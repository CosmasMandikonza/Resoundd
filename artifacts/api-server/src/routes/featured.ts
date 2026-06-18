import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { asc } from "drizzle-orm";
import { AnalyzeInputSchema, SongSchema, type Song } from "@workspace/shared-types";
import { db, featuredAnalysesTable } from "@workspace/db";
import { analyzeSongForFeatured } from "../lib/analyze/pipeline";
import { AnalyzeError, statusForKind } from "../lib/analyze/errors";
import { fetchTrackById, fetchLyrics } from "../lib/analyze/musixmatch";
import { mergeSource, stripSource, trackIdFromSong } from "../lib/analyze/song-persistence";

const router: IRouter = Router();

interface ErrorBody {
  error: string;
  message: string;
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guard the curation endpoint. /api/precompute triggers expensive LLM + Cyanite
 * jobs and mutates the public featured store, so it must never be open. It is
 * gated by a service token (`PRECOMPUTE_TOKEN`) sent in the `x-precompute-token`
 * header. When the token is not configured the endpoint is disabled outright.
 */
function authorizePrecompute(req: Request, res: Response): boolean {
  const expected = process.env.PRECOMPUTE_TOKEN?.trim();
  if (!expected) {
    res.status(403).json({
      error: "forbidden",
      message: "Precompute is disabled.",
    } satisfies ErrorBody);
    return false;
  }
  const provided = req.get("x-precompute-token") ?? "";
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({
      error: "auth",
      message: "Invalid or missing precompute token.",
    } satisfies ErrorBody);
    return false;
  }
  return true;
}

/** Re-hydrate a stored (source-stripped) featured song with live lyric text. */
async function rehydrate(stored: Song, trackId: string): Promise<Song> {
  const numericId = Number(trackId);
  if (!Number.isFinite(numericId)) return stored;
  try {
    const track = await fetchTrackById(numericId);
    const lyrics = await fetchLyrics(track);
    return mergeSource(stored, lyrics.lines);
  } catch {
    // Live re-fetch failed — return the derived layer (blank source) rather
    // than dropping the featured entry entirely.
    return stored;
  }
}

/**
 * GET /api/featured — the public, precomputed gallery. Returns fully enriched
 * songs (Cyanite arc + Songstats markets), each re-hydrated with live lyric
 * text. Items with a corrupt stored payload are skipped rather than failing the
 * whole list.
 */
router.get("/featured", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(featuredAnalysesTable)
      .orderBy(asc(featuredAnalysesTable.rank), asc(featuredAnalysesTable.createdAt));

    const items = await Promise.all(
      rows.map(async (row) => {
        const parsed = SongSchema.safeParse(row.song);
        if (!parsed.success) {
          req.log.warn({ id: row.id }, "featured: corrupt stored song, skipping");
          return null;
        }
        const song = await rehydrate(parsed.data, row.trackId);
        return { id: row.id, song };
      }),
    );

    res.json({
      items: items.filter((i): i is { id: string; song: Song } => i !== null),
    });
  } catch (err) {
    req.log.error({ err }, "featured: list failed");
    res.status(500).json({
      error: "internal",
      message: "Could not load featured analyses.",
    } satisfies ErrorBody);
  }
});

/**
 * POST /api/precompute — curate a featured analysis. Runs the FULL pipeline
 * including the slow Cyanite audio enrichment (so the stored song ships with the
 * real emotional arc), strips raw lyrics, and upserts into the featured store
 * keyed by (trackId, targetLang). Body: AnalyzeInput plus an optional `rank`.
 */
router.post(
  "/precompute",
  async (req: Request, res: Response): Promise<void> => {
    if (!authorizePrecompute(req, res)) return;

    const parsed = AnalyzeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const body: ErrorBody = {
        error: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid request body.",
      };
      res.status(400).json(body);
      return;
    }

    const rankRaw = (req.body as { rank?: unknown }).rank;
    const rank = typeof rankRaw === "number" && Number.isFinite(rankRaw) ? rankRaw : 0;

    const started = Date.now();
    try {
      const { song } = await analyzeSongForFeatured(parsed.data, req.log);
      const trackId = trackIdFromSong(song);
      const stored = stripSource(song);

      const [row] = await db
        .insert(featuredAnalysesTable)
        .values({
          trackId,
          targetLang: song.targetLang,
          title: song.title,
          artist: song.artist,
          sourceLang: song.sourceLang,
          rank,
          song: stored,
        })
        .onConflictDoUpdate({
          target: [featuredAnalysesTable.trackId, featuredAnalysesTable.targetLang],
          set: {
            title: song.title,
            artist: song.artist,
            sourceLang: song.sourceLang,
            rank,
            song: stored,
            updatedAt: new Date(),
          },
        })
        .returning({ id: featuredAnalysesTable.id });

      req.log.info(
        {
          id: row.id,
          ms: Date.now() - started,
          emotionSource: song.emotionSource,
          marketDataSource: song.marketDataSource,
          partnersUsed: song.partnersUsed,
        },
        "precompute complete",
      );
      // Return the live (source-intact) song so the caller can preview it.
      res.status(201).json({ id: row.id, song });
    } catch (err) {
      if (err instanceof AnalyzeError) {
        req.log.warn(
          { kind: err.kind, ms: Date.now() - started },
          `precompute failed: ${err.message}`,
        );
        const body: ErrorBody = { error: err.kind, message: err.message };
        res.status(statusForKind(err.kind)).json(body);
        return;
      }
      req.log.error({ err }, "precompute crashed");
      const body: ErrorBody = {
        error: "internal",
        message: "Precompute failed unexpectedly. Please try again.",
      };
      res.status(500).json(body);
    }
  },
);

export default router;
