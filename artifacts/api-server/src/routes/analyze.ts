import { Router, type IRouter, type Request, type Response } from "express";
import {
  AnalyzeInputSchema,
  type AnalyzeErrorBody,
} from "@workspace/shared-types";
import { analyzeSong } from "../lib/analyze/pipeline";
import { AnalyzeError, statusForKind } from "../lib/analyze/errors";

const router: IRouter = Router();

router.post("/analyze", async (req: Request, res: Response): Promise<void> => {
  const parsed = AnalyzeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const body: AnalyzeErrorBody = {
      error: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid request body.",
    };
    res.status(400).json(body);
    return;
  }

  const started = Date.now();
  try {
    const { song, cached } = await analyzeSong(parsed.data, req.log);
    req.log.info(
      { ms: Date.now() - started, cached, lines: song.lines.length },
      "analysis complete",
    );
    res.json(song);
  } catch (err) {
    if (err instanceof AnalyzeError) {
      req.log.warn(
        { kind: err.kind, ms: Date.now() - started },
        `analysis failed: ${err.message}`,
      );
      const body: AnalyzeErrorBody = { error: err.kind, message: err.message };
      res.status(statusForKind(err.kind)).json(body);
      return;
    }
    // Never surface raw internal error text to the client — it can carry
    // secrets (e.g. credentialed URLs). Log the detail server-side only.
    req.log.error({ err }, "analysis crashed");
    const body: AnalyzeErrorBody = {
      error: "internal",
      message: "Analysis failed unexpectedly. Please try again.",
    };
    res.status(500).json(body);
  }
});

export default router;
