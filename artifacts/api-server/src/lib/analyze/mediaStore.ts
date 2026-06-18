import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Simple local media store for generated audio files (ElevenLabs TTS / LALAL stems).
 *
 * Files are written to MEDIA_DIR (default /tmp/resound-media) and served by the
 * api-server via express.static at /api/media, with Access-Control-Allow-Origin: *
 * so the Web Audio API AnalyserNode can cross-origin-connect.
 *
 * Files are best-effort persistent — they survive across API server restarts as
 * long as MEDIA_DIR is not cleared. Featured songs that lose their audio on a
 * restart simply re-generate on the next /api/precompute call.
 */

function mediaDir(): string {
  return process.env.MEDIA_DIR ?? "/tmp/resound-media";
}

async function ensureDir(): Promise<void> {
  const dir = mediaDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Persist `bytes` as `filename` in the media directory and return the
 * public URL path (`/api/media/<filename>`) that clients can fetch.
 */
export async function saveMedia(
  filename: string,
  bytes: Buffer,
): Promise<string> {
  await ensureDir();
  const filePath = join(mediaDir(), filename);
  await writeFile(filePath, bytes);
  return `/api/media/${filename}`;
}

/** True when a media file already exists (skip re-generation). */
export function mediaExists(filename: string): boolean {
  return existsSync(join(mediaDir(), filename));
}

/** Absolute filesystem path for a named media file. */
export function mediaPath(filename: string): string {
  return join(mediaDir(), filename);
}

export { mediaDir };
