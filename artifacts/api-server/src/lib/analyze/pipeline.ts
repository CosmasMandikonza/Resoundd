import {
  SongSchema,
  type AnalyzeInput,
  type Emotion,
  type Fidelity,
  type Line,
  type Song,
} from "@workspace/shared-types";
import type { Logger } from "pino";
import { AnalyzeError } from "./errors";
import { cacheKey, getCached, setCached } from "./cache";
import { resolveTrack, fetchLyrics, type RawLyricLine } from "./musixmatch";
import { findPreview } from "./itunes";
import { analyzeWithLlm, type LlmAnalysis } from "./llm";
import { computeDrift } from "./embeddings";
import { buildFingerprint, buildMarkets } from "./fingerprint";
import { applySongstats, fetchSongstats, isSongstatsEnabled } from "./songstats";
import { runCyaniteAnalysis } from "./cyanite";
import { runStemSeparation, isLalalEnabled } from "./lalal";
import {
  generateSungRebirth,
  isElevenLabsEnabled,
  buildStylePrompt,
} from "./elevenlabs";

const f01 = (n: number): number => Math.round(n) / 100;

function toFidelity(f: {
  meaning: number;
  emotion: number;
  culture: number;
  singability: number;
}): Fidelity {
  return {
    meaning: f01(f.meaning),
    emotion: f01(f.emotion),
    culture: f01(f.culture),
    singability: f01(f.singability),
  };
}

function avgFidelity(lines: Line[]): Fidelity {
  if (lines.length === 0) {
    return { meaning: 0, emotion: 0, culture: 0, singability: 0 };
  }
  const sum = lines.reduce(
    (acc, l) => ({
      meaning: acc.meaning + l.fidelity.meaning,
      emotion: acc.emotion + l.fidelity.emotion,
      culture: acc.culture + l.fidelity.culture,
      singability: acc.singability + l.fidelity.singability,
    }),
    { meaning: 0, emotion: 0, culture: 0, singability: 0 },
  );
  const n = lines.length;
  return {
    meaning: sum.meaning / n,
    emotion: sum.emotion / n,
    culture: sum.culture / n,
    singability: sum.singability / n,
  };
}

interface LineTiming {
  tStart: number;
  tEnd: number;
  norm: number;
}

/** Resolve seconds-based start/end and a normalized 0..1 position per line. */
function computeTimings(
  rawLines: RawLyricLine[],
  count: number,
  durationMs: number,
  timed: boolean,
): LineTiming[] {
  const durationSec = durationMs / 1000;
  const timings: LineTiming[] = [];

  if (timed) {
    for (let i = 0; i < count; i++) {
      const startMs = rawLines[i]?.tStartMs ?? 0;
      const nextMs =
        rawLines[i + 1]?.tStartMs ?? startMs + 3000;
      const tStart = startMs / 1000;
      const tEnd = Math.max(tStart + 0.5, nextMs / 1000);
      timings.push({
        tStart,
        tEnd,
        norm: durationSec > 0 ? Math.min(1, tStart / durationSec) : 0,
      });
    }
    return timings;
  }

  const step = count > 0 ? durationSec / count : 0;
  for (let i = 0; i < count; i++) {
    timings.push({
      tStart: i * step,
      tEnd: (i + 1) * step,
      norm: count > 1 ? i / (count - 1) : 0,
    });
  }
  return timings;
}

function assembleLines(
  ordered: LlmAnalysis["lines"],
  rawLines: RawLyricLine[],
  timings: LineTiming[],
  drift: number[] | null,
): Line[] {
  return ordered.map((l, i) => {
    const raw = rawLines[l.index];
    const fidelity = toFidelity(l.fidelity);
    const lineDrift =
      drift?.[i] ?? Math.max(0, Math.min(1, 1 - fidelity.meaning));
    const line: Line = {
      id: `line-${l.index}`,
      tStart: timings[i].tStart,
      tEnd: timings[i].tEnd,
      source: raw?.text ?? l.translation,
      translation: l.translation,
      localized: l.localized,
      emotion: l.emotion as Emotion,
      fidelity,
      rebornFidelity: toFidelity(l.rebornFidelity),
      drift: Math.round(lineDrift * 100) / 100,
    };
    if (l.lost) line.lost = l.lost;
    if (l.risk) line.risk = l.risk;
    return line;
  });
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface AnalyzeResult {
  song: Song;
  cached: boolean;
}

export interface AnalyzeOptions {
  /**
   * When true, run the (slow) Cyanite audio-emotion analysis inline and swap its
   * arc into the result before returning — used by /api/precompute so featured
   * songs ship complete. The default live path returns the lyric arc immediately
   * and lets the client enrich via /api/enrich/cyanite.
   */
  waitForCyanite?: boolean;
  /**
   * When true, also run LALAL.AI stem separation + ElevenLabs sung-rebirth
   * generation inline before returning. Only used by /api/precompute so featured
   * songs arrive with stems and a pre-generated vocal. Live songs generate TTS
   * on demand via /api/rebirth/generate.
   */
  waitForRebirth?: boolean;
}

/** Full analysis pipeline: resolve -> lyrics -> (preview ‖ LLM ‖ Songstats) -> drift -> assemble. */
export async function analyzeSong(
  input: AnalyzeInput,
  log: Logger,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const track = await resolveTrack({
    title: input.title,
    artist: input.artist,
    query: input.query,
  });
  log.info(
    { trackId: track.trackId, name: track.trackName },
    "resolved track",
  );

  const key = cacheKey(track.trackId, input.targetLang);
  const hit = getCached(key);
  // When precompute asks for the slow Cyanite enrichment, only honor a cached
  // entry that is itself already Cyanite-enriched — otherwise we'd ship a
  // lyric-arc featured song and silently skip audio analysis.
  if (hit && (!options.waitForCyanite || hit.emotionSource === "cyanite")) {
    log.info({ key }, "cache hit");
    return { song: hit, cached: true };
  }

  const lyrics = await fetchLyrics(track);
  const timed = lyrics.timingLevel === "line";
  log.info(
    { lines: lyrics.lines.length, timingLevel: lyrics.timingLevel },
    "fetched lyrics",
  );

  // iTunes preview, the LLM analysis, and the Songstats market lookup are all
  // independent of each other, so run them concurrently. Songstats is best-effort.
  const [preview, analysis, songstats] = await Promise.all([
    findPreview(track.trackName, track.artistName),
    analyzeWithLlm({
      lines: lyrics.lines,
      targetLang: input.targetLang,
      title: track.trackName,
      artist: track.artistName,
    }),
    fetchSongstats(
      { title: track.trackName, artist: track.artistName },
      log,
    ),
  ]);

  // Order analyzed lines by the model's declared index first, so every
  // position-indexed array below (drift, timings) stays aligned to `ordered`.
  const ordered = [...analysis.lines].sort((a, b) => a.index - b.index);

  const drift = await computeDrift(
    ordered.map((l) => ({
      source: l.backTranslation,
      // back-translation is in the source language; compare to the original line
      backTranslation: lyrics.lines[l.index]?.text ?? l.backTranslation,
    })),
  );

  const durationMs =
    preview?.durationMs ??
    track.durationMs ??
    (timed
      ? (lyrics.lines[lyrics.lines.length - 1]?.tStartMs ?? 0) + 4000
      : 180000);

  const timings = computeTimings(
    ordered.map((l) => lyrics.lines[l.index] ?? { text: "" }),
    ordered.length,
    durationMs,
    timed,
  );

  const lines = assembleLines(ordered, lyrics.lines, timings, drift);
  const overallFidelity = avgFidelity(lines);
  const { sourceArc, translationArc } = buildFingerprint(
    { ...analysis, lines: ordered },
    timings.map((t) => t.norm),
  );
  const baseMarkets = buildMarkets(analysis);
  const { markets, applied: songstatsApplied } = songstats
    ? applySongstats(baseMarkets, songstats)
    : { markets: baseMarkets, applied: false };
  const marketDataSource = songstatsApplied ? "songstats" : "estimated";

  const partnersUsed = ["MUSIXMATCH"];
  if (songstatsApplied) partnersUsed.push("SONGSTATS");

  const topMarket =
    [...markets].sort((a, b) => b.readiness - a.readiness)[0]?.name ??
    input.targetLang.toUpperCase();

  const song: Song = {
    id: `song-${track.trackId}-${input.targetLang}`,
    title: track.trackName,
    artist: track.artistName,
    sourceLang: (analysis.sourceLang || lyrics.language || "und").toLowerCase(),
    targetLang: input.targetLang,
    market: topMarket,
    previewUrl: preview?.previewUrl ?? "",
    previewOffsetMs: 0,
    durationMs,
    rebirthAudioUrl: "",
    rebirthOffsetMs: 0,
    lines,
    fingerprint: { sourceArc, translationArc },
    overallFidelity,
    singability: {
      syllableSource: median(analysis.lines.map((l) => l.syllableSource)),
      syllableLocalized: median(analysis.lines.map((l) => l.syllableLocalized)),
      rhyme: analysis.rhyme,
      stressMatch: Math.round(analysis.stressMatch),
    },
    markets,
    timingLevel: lyrics.timingLevel,
    translationSource: "generated",
    emotionSource: "lyric",
    marketDataSource,
    partnersUsed,
    ...(lyrics.restricted ? { lyricsRestricted: true } : {}),
    ...(lyrics.copyright ? { copyright: lyrics.copyright } : {}),
  };

  // For precompute/featured we wait for the slow Cyanite audio analysis so the
  // shipped song already carries the real emotional arc. The live path skips
  // this and lets the client enrich asynchronously.
  if (options.waitForCyanite && song.previewUrl) {
    const cyanite = await runCyaniteAnalysis(
      song.previewUrl,
      String(track.trackId),
      log,
    );
    if (cyanite) {
      song.fingerprint = {
        ...song.fingerprint,
        sourceArc: cyanite.sourceArc,
      };
      song.emotionSource = "cyanite";
      song.cyaniteSummary = cyanite.summary;
      if (!song.partnersUsed.includes("CYANITE")) {
        song.partnersUsed.push("CYANITE");
      }
    }
  }

  // For precompute/featured, also run LALAL stem separation and ElevenLabs sung
  // rebirth so the featured Rebirth view plays instantly without user action.
  // Both are best-effort: any failure leaves the song without stems/rebirthAudio
  // and the frontend falls back gracefully. Run in parallel.
  if (options.waitForRebirth) {
    const trackIdStr = String(track.trackId);
    const [stems, rebirthUrl] = await Promise.all([
      isLalalEnabled() && song.previewUrl
        ? runStemSeparation(song.previewUrl, trackIdStr, log)
        : Promise.resolve(null),
      isElevenLabsEnabled()
        ? generateSungRebirth(
            song.lines.map((l) => l.localized),
            buildStylePrompt(song.cyaniteSummary),
            song.id,
            log,
          )
        : Promise.resolve(null),
    ]);

    if (stems) {
      song.stems = stems;
      if (!song.partnersUsed.includes("LALAL")) song.partnersUsed.push("LALAL");
    }
    if (rebirthUrl) {
      song.rebirthAudioUrl = rebirthUrl;
      song.rebirthSource = "elevenmusic";
      if (!song.partnersUsed.includes("ELEVENLABS"))
        song.partnersUsed.push("ELEVENLABS");
    }
  }

  const validated = SongSchema.safeParse(song);
  if (!validated.success) {
    throw new AnalyzeError(
      "internal",
      `Assembled song failed contract validation: ${validated.error.message}`,
    );
  }

  setCached(key, validated.data);
  return { song: validated.data, cached: false };
}

/**
 * Like {@link analyzeSong} but advertises CYANITE as an intended partner up
 * front and always waits for the audio analysis. Used by /api/precompute so
 * featured songs are fully enriched before they are persisted.
 */
export async function analyzeSongForFeatured(
  input: AnalyzeInput,
  log: Logger,
): Promise<AnalyzeResult> {
  return analyzeSong(input, log, { waitForCyanite: true, waitForRebirth: true });
}

export { isSongstatsEnabled };
