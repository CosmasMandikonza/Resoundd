import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  SongSchema,
  SavedAnalysisSummarySchema,
  type SavedAnalysisSummary,
  type Song,
} from "@workspace/shared-types";
import { db, savedAnalysesTable } from "@workspace/db";
import { fetchTrackById, fetchLyrics } from "../lib/analyze/musixmatch";
import {
  mergeSource,
  stripSource,
  trackIdFromSong,
} from "../lib/analyze/song-persistence";

const router: IRouter = Router();

interface ErrorBody {
  error: string;
  message: string;
}

/** Resolve the authenticated user id, or write a 401 and return null. */
function requireUserId(req: Request, res: Response): string | null {
  if (req.isAuthenticated() && req.user?.id) return req.user.id;
  const body: ErrorBody = {
    error: "auth",
    message: "Sign in to save and view analyses.",
  };
  res.status(401).json(body);
  return null;
}

function toSummary(row: {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  sourceLang: string;
  targetLang: string;
  createdAt: Date;
}): SavedAnalysisSummary {
  return SavedAnalysisSummarySchema.parse({
    id: row.id,
    trackId: row.trackId,
    title: row.title,
    artist: row.artist,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    savedAt: row.createdAt.toISOString(),
  });
}

/** List the current user's saved analyses, newest first. */
router.get(
  "/saved-analyses",
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const rows = await db
      .select({
        id: savedAnalysesTable.id,
        trackId: savedAnalysesTable.trackId,
        title: savedAnalysesTable.title,
        artist: savedAnalysesTable.artist,
        sourceLang: savedAnalysesTable.sourceLang,
        targetLang: savedAnalysesTable.targetLang,
        createdAt: savedAnalysesTable.createdAt,
      })
      .from(savedAnalysesTable)
      .where(eq(savedAnalysesTable.userId, userId))
      .orderBy(desc(savedAnalysesTable.createdAt));

    res.json({ items: rows.map(toSummary) });
  },
);

/** Save (or update) the current analysis for the user. Strips raw source. */
router.post(
  "/saved-analyses",
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsed = SongSchema.safeParse(req.body);
    if (!parsed.success) {
      const body: ErrorBody = {
        error: "validation",
        message: "Invalid analysis payload.",
      };
      res.status(400).json(body);
      return;
    }

    const song = parsed.data;
    const trackId = trackIdFromSong(song);
    const stored = stripSource(song);

    const [row] = await db
      .insert(savedAnalysesTable)
      .values({
        userId,
        trackId,
        targetLang: song.targetLang,
        title: song.title,
        artist: song.artist,
        sourceLang: song.sourceLang,
        song: stored,
      })
      .onConflictDoUpdate({
        target: [
          savedAnalysesTable.userId,
          savedAnalysesTable.trackId,
          savedAnalysesTable.targetLang,
        ],
        set: {
          title: song.title,
          artist: song.artist,
          sourceLang: song.sourceLang,
          song: stored,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: savedAnalysesTable.id,
        trackId: savedAnalysesTable.trackId,
        title: savedAnalysesTable.title,
        artist: savedAnalysesTable.artist,
        sourceLang: savedAnalysesTable.sourceLang,
        targetLang: savedAnalysesTable.targetLang,
        createdAt: savedAnalysesTable.createdAt,
      });

    res.status(201).json(toSummary(row));
  },
);

/** Reopen a saved analysis: re-fetch raw lyrics live and merge them back in. */
router.get(
  "/saved-analyses/:id",
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const [row] = await db
      .select()
      .from(savedAnalysesTable)
      .where(
        and(
          eq(savedAnalysesTable.id, String(req.params.id)),
          eq(savedAnalysesTable.userId, userId),
        ),
      );

    if (!row) {
      const body: ErrorBody = {
        error: "not_found",
        message: "Saved analysis not found.",
      };
      res.status(404).json(body);
      return;
    }

    const stored = SongSchema.safeParse(row.song);
    if (!stored.success) {
      const body: ErrorBody = {
        error: "internal",
        message: "Saved analysis is corrupt.",
      };
      res.status(500).json(body);
      return;
    }

    let song = stored.data;

    // Compliance: raw lyric text is never persisted — re-fetch it live and
    // merge by line index. We resolve by the persisted Musixmatch track_id so
    // the lyrics always belong to the exact track originally analyzed (no
    // title/artist re-matching that could pick a different variant). If the
    // live fetch fails, fall back to the derived layer (blank source lines)
    // rather than failing the reopen.
    const trackId = Number(row.trackId);
    if (Number.isFinite(trackId)) {
      try {
        const track = await fetchTrackById(trackId);
        const lyrics = await fetchLyrics(track);
        song = mergeSource(song, lyrics.lines);
      } catch (err) {
        req.log.warn(
          { err },
          "reopen: live lyric re-fetch failed; returning derived layer only",
        );
      }
    }

    res.json(song);
  },
);

export default router;
