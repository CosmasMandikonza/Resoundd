import type { Logger } from "pino";
import type { Stems } from "@workspace/shared-types";
import { fetchWithTimeout } from "./http";
import { saveMedia, mediaExists } from "./mediaStore";

/**
 * LALAL.AI stem separation integration.
 *
 * Flow: fetch the iTunes 30s preview → POST /upload/ → POST /preview/ (split
 * vocals) → poll /preview/?id until finished → download instrumental + vocal
 * stems → save via mediaStore → return URLs served by /api/media.
 *
 * Every failure path (missing key, upload error, analysis failure, timeout)
 * returns `null` so the caller falls back gracefully.
 *
 * Ref: https://www.lalal.ai/api-doc/
 */

const BASE_URL = "https://www.lalal.ai/api";

/** LALAL analysis budget (upload + split + poll). */
const TOTAL_BUDGET_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;

/** In-memory cache: trackId → stems (target-lang agnostic). */
const cache = new Map<string, Stems>();
const CACHE_MAX = 100;

export function isLalalEnabled(): boolean {
  return Boolean(process.env.LALAL_LICENSE_KEY?.trim());
}

function authHeader(): string {
  const key = process.env.LALAL_LICENSE_KEY?.trim();
  if (!key) throw new Error("LALAL_LICENSE_KEY is not set");
  return `license ${key}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface UploadResponse {
  id?: string;
}

interface CheckResponse {
  task?: {
    id?: string;
    status?: string;
    result?: {
      stem?: { url?: string };
      accompaniment?: { url?: string };
    };
    error?: string | null;
  };
}

/**
 * Run LALAL stem separation on the given preview URL. Returns servable
 * `/api/media` URLs for the instrumental + vocal stems, or `null` on failure.
 */
export async function runStemSeparation(
  previewUrl: string,
  trackId: string,
  log: Logger,
): Promise<Stems | null> {
  if (!isLalalEnabled()) return null;

  const cached = cache.get(trackId);
  if (cached) {
    log.info({ trackId }, "lalal cache hit");
    return cached;
  }

  // If stems were already saved (across a server restart), skip re-generation.
  const instrFile = `lalal-${trackId}-instrumental.mp3`;
  const vocalFile = `lalal-${trackId}-vocal.mp3`;
  if (mediaExists(instrFile) && mediaExists(vocalFile)) {
    const stems: Stems = {
      instrumentalUrl: `/api/media/${instrFile}`,
      vocalUrl: `/api/media/${vocalFile}`,
    };
    cache.set(trackId, stems);
    log.info({ trackId }, "lalal: stems already on disk");
    return stems;
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    // 1. Fetch the preview audio from the Apple CDN.
    const audioRes = await fetchWithTimeout(previewUrl, {}, 15_000, "LALAL preview fetch");
    if (!audioRes.ok) {
      log.warn({ status: audioRes.status }, "lalal: preview fetch failed");
      return null;
    }
    const audioBytes = Buffer.from(await audioRes.arrayBuffer());
    if (audioBytes.byteLength === 0) {
      log.warn("lalal: empty preview audio");
      return null;
    }

    // 2. Upload the audio to LALAL.
    const formData = new FormData();
    const blob = new Blob([audioBytes], { type: "audio/mpeg" });
    formData.append("file", blob, `${trackId}.mp3`);

    const uploadRes = await fetchWithTimeout(
      `${BASE_URL}/upload/`,
      {
        method: "POST",
        headers: { Authorization: authHeader() },
        body: formData,
      },
      30_000,
      "LALAL upload",
    );
    if (!uploadRes.ok) {
      log.warn({ status: uploadRes.status }, "lalal: upload failed");
      return null;
    }
    const uploadJson = (await uploadRes.json()) as UploadResponse;
    const fileId = uploadJson.id;
    if (!fileId) {
      log.warn("lalal: no file id in upload response");
      return null;
    }

    // 3. Request stem separation (vocals stem = keep vocals separate from accompaniment).
    const splitRes = await fetchWithTimeout(
      `${BASE_URL}/preview/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(),
        },
        body: JSON.stringify({ id: fileId, stem: "vocals", splitter: "phoenix" }),
      },
      15_000,
      "LALAL split request",
    );
    if (!splitRes.ok) {
      log.warn({ status: splitRes.status }, "lalal: split request failed");
      return null;
    }

    // 4. Poll until finished or deadline.
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const checkRes = await fetchWithTimeout(
        `${BASE_URL}/preview/?id=${encodeURIComponent(fileId)}`,
        { headers: { Authorization: authHeader() } },
        10_000,
        "LALAL poll",
      );
      if (!checkRes.ok) continue;

      const data = (await checkRes.json()) as CheckResponse;
      const task = data.task;
      const status = task?.status;

      if (status === "error") {
        log.warn({ reason: task?.error }, "lalal: analysis errored");
        return null;
      }

      if (status === "success" && task?.result) {
        const instrUrl = task.result.accompaniment?.url;
        const vocalUrl = task.result.stem?.url;
        if (!instrUrl || !vocalUrl) {
          log.warn("lalal: missing stem URLs in result");
          return null;
        }

        // 5. Download both stems and persist via mediaStore.
        const [instrBuf, vocalBuf] = await Promise.all([
          fetchWithTimeout(instrUrl, {}, 30_000, "LALAL instrumental download").then((r) =>
            r.arrayBuffer().then((ab) => Buffer.from(ab)),
          ),
          fetchWithTimeout(vocalUrl, {}, 30_000, "LALAL vocal download").then((r) =>
            r.arrayBuffer().then((ab) => Buffer.from(ab)),
          ),
        ]);

        const [savedInstr, savedVocal] = await Promise.all([
          saveMedia(instrFile, instrBuf),
          saveMedia(vocalFile, vocalBuf),
        ]);

        const stems: Stems = {
          instrumentalUrl: savedInstr,
          vocalUrl: savedVocal,
        };

        if (cache.size >= CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(trackId, stems);
        log.info({ trackId }, "lalal: stem separation complete");
        return stems;
      }

      // status "progress" / "missing" / other → keep polling.
    }

    log.warn({ trackId }, "lalal: timed out waiting for stems");
    return null;
  } catch (err) {
    log.warn({ err }, "lalal: stem separation errored — falling back");
    return null;
  }
}
