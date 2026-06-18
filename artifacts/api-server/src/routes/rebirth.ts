import { Router } from "express";
import { z } from "zod/v4";
import { generateTts, isElevenLabsEnabled } from "../lib/analyze/elevenlabs";

const router = Router();

const GenerateBodySchema = z.object({
  songId: z.string().min(1).max(300),
  targetLang: z.string().min(2).max(10),
  lyrics: z.array(z.string().max(600)).min(1).max(120),
});

/**
 * POST /api/rebirth/generate
 *
 * On-demand ElevenLabs TTS vocal generation for a live song. Triggered
 * explicitly by the user (GENERATE REBIRTH button) — never auto-fires.
 *
 * Returns { rebirthAudioUrl, rebirthSource } on success, or a typed error
 * body so the client can show a friendly "unavailable" state.
 *
 * Credit-safety: requires ElevenLabs key; returns 503 without one so the
 * frontend falls back gracefully.
 */
router.post("/rebirth/generate", async (req, res) => {
  if (!isElevenLabsEnabled()) {
    res.status(503).json({
      error: "rebirth_unavailable",
      message: "Rebirth audio generation is not configured.",
    });
    return;
  }

  const parsed = GenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_input",
      message: "Invalid request body.",
    });
    return;
  }

  const { songId, targetLang, lyrics } = parsed.data;

  try {
    const url = await generateTts(lyrics, targetLang, songId, req.log);

    if (!url) {
      res.status(503).json({
        error: "rebirth_failed",
        message: "Could not generate rebirth audio — please try again.",
      });
      return;
    }

    res.json({ rebirthAudioUrl: url, rebirthSource: "tts" });
  } catch (err) {
    req.log.error({ err }, "rebirth/generate: unexpected error");
    res.status(500).json({
      error: "internal",
      message: "Rebirth generation failed unexpectedly.",
    });
  }
});

export default router;
