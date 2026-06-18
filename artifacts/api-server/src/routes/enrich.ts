import { Router, type IRouter, type Request, type Response } from "express";
import {
  CyaniteEnrichInputSchema,
  type CyaniteEnrichResult,
} from "@workspace/shared-types";
import { runCyaniteAnalysis, isCyaniteEnabled } from "../lib/analyze/cyanite";

const router: IRouter = Router();

/**
 * POST /api/enrich/cyanite — asynchronous audio-emotion enrichment.
 *
 * The live analyze path returns immediately with the lyric-derived arc
 * (`emotionSource: "lyric"`). The client then calls this endpoint with the
 * track id + preview URL; we run the slow Cyanite audio analysis and return the
 * real source arc + summary so the client can swap it in. Any failure (disabled,
 * timeout, upstream error) returns `{ emotionSource: "lyric" }` so the client
 * silently keeps what it already has — this endpoint never errors the UX.
 */
router.post(
  "/enrich/cyanite",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CyaniteEnrichInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid request body.",
      });
      return;
    }

    const lyricFallback: CyaniteEnrichResult = { emotionSource: "lyric" };

    if (!isCyaniteEnabled()) {
      res.json(lyricFallback);
      return;
    }

    const { trackId, previewUrl } = parsed.data;
    const started = Date.now();
    const result = await runCyaniteAnalysis(previewUrl, trackId, req.log);

    if (!result) {
      req.log.info(
        { trackId, ms: Date.now() - started },
        "cyanite enrich fell back to lyric",
      );
      res.json(lyricFallback);
      return;
    }

    const body: CyaniteEnrichResult = {
      emotionSource: "cyanite",
      sourceArc: result.sourceArc,
      cyaniteSummary: result.summary,
    };
    req.log.info(
      { trackId, ms: Date.now() - started, points: result.sourceArc.length },
      "cyanite enrich complete",
    );
    res.json(body);
  },
);

export default router;
