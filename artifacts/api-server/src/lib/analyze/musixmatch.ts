import { AnalyzeError } from "./errors";
import { fetchWithTimeout } from "./http";

const BASE = "https://api.musixmatch.com/ws/1.1";

export interface RawLyricLine {
  text: string;
  /** Start time in ms, only present when line-level subtitles are available. */
  tStartMs?: number;
}

export interface ResolvedTrack {
  trackId: number;
  commontrackId: number;
  trackName: string;
  artistName: string;
  /** Total track length in ms, when the provider reports it. */
  durationMs?: number;
  hasSubtitles: boolean;
}

export interface LyricsResult {
  lines: RawLyricLine[];
  timingLevel: "line" | "none";
  restricted: boolean;
  copyright?: string;
  /** Provider's reported lyrics language (ISO 639-1), when available. */
  language?: string;
}

interface MxmEnvelope<T> {
  message: {
    header: { status_code: number };
    body: T | "";
  };
}

function apiKey(): string {
  const key = process.env.MUSIXMATCH_API_KEY;
  if (!key) {
    throw new AnalyzeError("auth", "MUSIXMATCH_API_KEY is not set");
  }
  return key.trim();
}

async function mxm<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set("apikey", apiKey());
  url.searchParams.set("format", "json");

  const res = await fetchWithTimeout(url.toString(), {}, 12000, "Musixmatch");
  const json = (await res.json()) as MxmEnvelope<T>;
  const code = json?.message?.header?.status_code;

  if (code === 200) {
    const body = json.message.body;
    return (body === "" ? ({} as T) : body) as T;
  }
  if (code === 401) {
    throw new AnalyzeError(
      "auth",
      "Musixmatch rejected the API key (401). Re-check MUSIXMATCH_API_KEY.",
    );
  }
  if (code === 402) {
    throw new AnalyzeError(
      "restricted",
      "Musixmatch usage limit reached or plan restriction (402).",
    );
  }
  if (code === 404) {
    throw new AnalyzeError("not_found", "Track not found on Musixmatch.");
  }
  throw new AnalyzeError(
    "internal",
    `Musixmatch returned status_code ${code} for ${path}.`,
  );
}

interface MxmTrack {
  track_id: number;
  commontrack_id: number;
  track_name: string;
  artist_name: string;
  has_subtitles: number;
  track_length?: number;
  instrumental?: number;
  restricted?: number;
}

/** Resolve a track by explicit title/artist, or a free-text query. */
export async function resolveTrack(input: {
  title?: string;
  artist?: string;
  query?: string;
}): Promise<ResolvedTrack> {
  let track: MxmTrack | undefined;

  if (input.title) {
    const body = await mxm<{ track?: MxmTrack }>("matcher.track.get", {
      q_track: input.title,
      ...(input.artist ? { q_artist: input.artist } : {}),
    });
    track = body.track;
  }

  if (!track) {
    const q = input.query ?? [input.title, input.artist].filter(Boolean).join(" ");
    const body = await mxm<{ track_list?: { track: MxmTrack }[] }>(
      "track.search",
      {
        q: q,
        page_size: 1,
        page: 1,
        s_track_rating: "desc",
        f_has_lyrics: 1,
      },
    );
    track = body.track_list?.[0]?.track;
  }

  if (!track) {
    throw new AnalyzeError(
      "not_found",
      "No matching track found. Try refining the title or artist.",
    );
  }
  if (track.instrumental === 1) {
    throw new AnalyzeError(
      "restricted",
      "This track is instrumental — there are no lyrics to analyze.",
    );
  }

  return {
    trackId: track.track_id,
    commontrackId: track.commontrack_id,
    trackName: track.track_name,
    artistName: track.artist_name,
    durationMs: track.track_length ? track.track_length * 1000 : undefined,
    hasSubtitles: track.has_subtitles === 1,
  };
}

/**
 * Resolve a track deterministically by its Musixmatch `track_id`. Used when
 * reopening a saved analysis so the re-fetched lyrics always belong to the
 * exact track that was originally analyzed (no title/artist re-matching).
 */
export async function fetchTrackById(trackId: number): Promise<ResolvedTrack> {
  const body = await mxm<{ track?: MxmTrack }>("track.get", {
    track_id: trackId,
  });
  const track = body.track;
  if (!track) {
    throw new AnalyzeError("not_found", "Track not found on Musixmatch.");
  }
  return {
    trackId: track.track_id,
    commontrackId: track.commontrack_id,
    trackName: track.track_name,
    artistName: track.artist_name,
    durationMs: track.track_length ? track.track_length * 1000 : undefined,
    hasSubtitles: track.has_subtitles === 1,
  };
}

const DISCLAIMER_PATTERNS = [
  /not for commercial use/i,
  /^\*+$/,
  /^\(\d+\)$/,
];

function cleanLines(raw: string[], limit: number): string[] {
  const cleaned: string[] = [];
  for (const item of raw) {
    const line = item.trim();
    if (!line) continue;
    if (DISCLAIMER_PATTERNS.some((re) => re.test(line))) continue;
    cleaned.push(line);
    if (cleaned.length >= limit) break;
  }
  return cleaned;
}

interface MxmSubtitleEntry {
  text: string;
  time: { total: number };
}

/**
 * Fetch lyrics for a resolved track. Prefers timed subtitles (line-level sync);
 * falls back to plain lyrics (no timing). Caps the number of lines so the
 * downstream LLM/embedding work stays bounded and fast.
 */
export async function fetchLyrics(
  track: ResolvedTrack,
  maxLines = 24,
): Promise<LyricsResult> {
  if (track.hasSubtitles) {
    try {
      const body = await mxm<{ subtitle?: { subtitle_body: string } }>(
        "track.subtitles.get",
        { commontrack_id: track.commontrackId },
      );
      const rawBody = body.subtitle?.subtitle_body;
      if (rawBody) {
        const entries = JSON.parse(rawBody) as MxmSubtitleEntry[];
        const lines: RawLyricLine[] = [];
        for (const e of entries) {
          const text = e.text?.trim();
          if (!text) continue;
          if (DISCLAIMER_PATTERNS.some((re) => re.test(text))) continue;
          lines.push({ text, tStartMs: Math.round((e.time?.total ?? 0) * 1000) });
          if (lines.length >= maxLines) break;
        }
        if (lines.length > 0) {
          return { lines, timingLevel: "line", restricted: false };
        }
      }
    } catch (err) {
      if (err instanceof AnalyzeError && err.kind === "restricted") {
        // Subtitles need a higher plan; fall through to plain lyrics.
      } else if (err instanceof AnalyzeError && err.kind === "auth") {
        throw err;
      }
      // Any parse/availability issue: fall back to plain lyrics.
    }
  }

  const body = await mxm<{
    lyrics?: {
      lyrics_body: string;
      lyrics_copyright?: string;
      restricted?: number;
      lyrics_language?: string;
    };
  }>("track.lyrics.get", { commontrack_id: track.commontrackId });

  const lyrics = body.lyrics;
  if (!lyrics?.lyrics_body) {
    throw new AnalyzeError(
      "not_found",
      "No lyrics available for this track.",
    );
  }

  const lines = cleanLines(lyrics.lyrics_body.split("\n"), maxLines).map(
    (text) => ({ text }),
  );
  if (lines.length === 0) {
    throw new AnalyzeError("not_found", "Lyrics were empty after cleanup.");
  }

  return {
    lines,
    timingLevel: "none",
    restricted: lyrics.restricted === 1,
    copyright: lyrics.lyrics_copyright?.trim() || undefined,
    language: lyrics.lyrics_language || undefined,
  };
}
