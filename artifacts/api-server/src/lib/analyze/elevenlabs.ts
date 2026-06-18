import type { Logger } from "pino";
import { fetchWithTimeout } from "./http";
import { saveMedia, mediaExists } from "./mediaStore";
import type { CyaniteSummary } from "@workspace/shared-types";

/**
 * ElevenLabs TTS integration for Resound's Rebirth view.
 *
 * Two generation paths:
 *
 * - **TTS (live, on demand):** `generateTts` — standard ElevenLabs multilingual
 *   text-to-speech triggered by the user's "GENERATE REBIRTH" button.  Fast,
 *   credit-efficient, returns a spoken-word vocal over the instrumental.
 *
 * - **Sung / expressive (precompute):** `generateSungRebirth` — same TTS API
 *   but with a style prompt injected into the text, higher stability, and a
 *   different voice setting profile aimed at musical/expressive delivery.
 *   Used during /api/precompute so featured songs arrive with a richer vocal.
 *   When the ElevenLabs Music API (singing) becomes publicly available the
 *   `generateSungRebirth` path can be swapped without touching callers.
 *
 * Every failure path returns `null` so the caller keeps the lyric-follow-along
 * experience without a rebirth audio (silent fallback).
 *
 * Ref: https://elevenlabs.io/docs/api-reference/text-to-speech
 */

const BASE_URL = "https://api.elevenlabs.io";

/**
 * Default voice: multilingual Rachel (ElevenLabs pre-made).
 * Override with ELEVENLABS_VOICE_ID env var for a different voice.
 */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Per-song in-memory cache: songId → media URL. */
const cache = new Map<string, string>();
const CACHE_MAX = 100;

export function isElevenLabsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}

/**
 * Build a style-prompt prefix for the TTS text so the voice delivery
 * matches the song's energy. Injected as a bracketed stage direction.
 */
export function buildStylePrompt(summary?: CyaniteSummary): string {
  if (!summary) return "";
  const tags = summary.moodTags.slice(0, 3).join(", ");
  const energy = summary.energy;
  // Rough BPM estimate from arousal (0..1 → 60-180 BPM)
  const bpm = Math.round(60 + summary.arousal * 120);
  return tags
    ? `[Deliver in a ${energy}-energy, ${tags} style at roughly ${bpm} BPM.] `
    : "";
}

/** Format localized lyric lines into a single TTS-friendly string. */
function formatLyrics(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

async function callTts(
  text: string,
  settings: { stability: number; similarity_boost: number; style?: number },
  cacheKey: string,
  filename: string,
  log: Logger,
): Promise<string | null> {
  // Check in-memory cache first.
  const hit = cache.get(cacheKey);
  if (hit) {
    log.info({ cacheKey }, "elevenlabs cache hit");
    return hit;
  }

  // Check disk (survives server restarts).
  if (mediaExists(filename)) {
    const url = `/api/media/${filename}`;
    cache.set(cacheKey, url);
    log.info({ filename }, "elevenlabs: audio already on disk");
    return url;
  }

  const body = {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: settings,
  };

  const res = await fetchWithTimeout(
    `${BASE_URL}/v1/text-to-speech/${voiceId()}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
    60_000,
    "ElevenLabs TTS",
  );

  if (!res.ok) {
    log.warn({ status: res.status }, "elevenlabs: TTS request failed");
    return null;
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    log.warn("elevenlabs: empty audio response");
    return null;
  }

  const url = await saveMedia(filename, bytes);

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, url);
  return url;
}

/**
 * Generate a multilingual TTS vocal for a live song (on-demand, user action).
 * Returns the `/api/media/<file>` URL or `null` on any failure.
 */
export async function generateTts(
  lyrics: string[],
  targetLang: string,
  songId: string,
  log: Logger,
): Promise<string | null> {
  if (!isElevenLabsEnabled()) return null;
  try {
    const text = formatLyrics(lyrics);
    const filename = `elabs-tts-${sanitizeId(songId)}.mp3`;
    const url = await callTts(
      text,
      { stability: 0.55, similarity_boost: 0.75 },
      `tts:${songId}`,
      filename,
      log,
    );
    if (url) log.info({ songId, targetLang }, "elevenlabs: TTS complete");
    return url;
  } catch (err) {
    log.warn({ err }, "elevenlabs: TTS errored — falling back");
    return null;
  }
}

/**
 * Generate an expressive/sung rebirth vocal for the precompute path.
 * Uses a style prompt derived from the Cyanite summary to guide vocal delivery.
 * Returns the `/api/media/<file>` URL or `null` on any failure.
 */
export async function generateSungRebirth(
  lyrics: string[],
  stylePrompt: string,
  songId: string,
  log: Logger,
): Promise<string | null> {
  if (!isElevenLabsEnabled()) return null;
  try {
    // Prepend the style direction so the voice performs expressively.
    const text = stylePrompt + formatLyrics(lyrics);
    const filename = `elabs-sung-${sanitizeId(songId)}.mp3`;
    const url = await callTts(
      text,
      { stability: 0.38, similarity_boost: 0.85, style: 0.6 },
      `sung:${songId}`,
      filename,
      log,
    );
    if (url) log.info({ songId }, "elevenlabs: sung rebirth complete");
    return url;
  } catch (err) {
    log.warn({ err }, "elevenlabs: sung rebirth errored — falling back");
    return null;
  }
}

/** Strip characters unsafe for filenames. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}
