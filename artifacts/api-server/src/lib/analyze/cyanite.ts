import type { Logger } from "pino";
import type { ArcPoint, CyaniteSummary, Emotion } from "@workspace/shared-types";
import { fetchWithTimeout } from "./http";

/**
 * Cyanite audio-emotion integration.
 *
 * Cyanite analyzes the actual audio (we feed it the 30s iTunes preview) and
 * returns a time-resolved valence/arousal profile plus mood tags. We turn that
 * into the song's SOURCE emotional arc — the real felt emotion of the
 * recording, which the LLM/lyric arc can only approximate.
 *
 * The whole flow is best-effort: every failure path (missing token, upload
 * error, Failed/NotAuthorized analysis, or timeout) returns `null` so the
 * caller can silently fall back to the lyric-derived arc.
 */

const GRAPHQL_URL = "https://api.cyanite.ai/graphql";

/** Total wall-clock budget for one Cyanite analysis (upload + enqueue + poll). */
const TOTAL_BUDGET_MS = 90_000;
const POLL_INTERVAL_MS = 4_000;
const MAX_ARC_POINTS = 48;

export interface CyaniteResult {
  sourceArc: ArcPoint[];
  summary: CyaniteSummary;
}

/** In-memory cache keyed by Musixmatch trackId (audio is target-lang agnostic). */
const cache = new Map<string, CyaniteResult>();
const CACHE_MAX = 200;

export function isCyaniteEnabled(): boolean {
  return Boolean(process.env.CYANITE_ACCESS_TOKEN?.trim());
}

/**
 * Preview audio must come from Apple's iTunes/mzstatic CDN. The enrich endpoint
 * accepts a client-supplied `previewUrl`, so without this allowlist the server
 * could be coerced into fetching arbitrary internal/external hosts (SSRF). The
 * pipeline's own iTunes previews already satisfy this check.
 */
export function isAllowedPreviewUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "apple.com" ||
    host.endsWith(".apple.com") ||
    host.endsWith(".mzstatic.com")
  );
}

function token(): string {
  const t = process.env.CYANITE_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("CYANITE_ACCESS_TOKEN is not set");
  return t;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** POST a GraphQL operation. Throws on transport error or top-level errors. */
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T> {
  const res = await fetchWithTimeout(
    GRAPHQL_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ query, variables }),
    },
    timeoutMs,
    "Cyanite",
  );
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Cyanite GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error("Cyanite returned no data.");
  return json.data;
}

const FILE_UPLOAD_REQUEST = `
  mutation { fileUploadRequest { id uploadUrl } }
`;

const LIBRARY_TRACK_CREATE = `
  mutation CreateTrack($input: LibraryTrackCreateInput!) {
    libraryTrackCreate(input: $input) {
      __typename
      ... on LibraryTrackCreateSuccess { createdLibraryTrack { id } }
      ... on Error { message }
    }
  }
`;

const LIBRARY_TRACK_ENQUEUE = `
  mutation EnqueueTrack($input: LibraryTrackEnqueueInput!) {
    libraryTrackEnqueue(input: $input) {
      __typename
      ... on Error { message }
    }
  }
`;

const LIBRARY_TRACK_POLL = `
  query PollTrack($id: ID!) {
    libraryTrack(id: $id) {
      __typename
      ... on LibraryTrack {
        id
        audioAnalysisV7 {
          __typename
          ... on AudioAnalysisV7Finished {
            result {
              valence
              arousal
              moodTags
              energyLevel
              segments { timestamps valence arousal }
            }
          }
          ... on AudioAnalysisV7Failed { error { message } }
        }
      }
    }
  }
`;

interface Segment {
  timestamps?: number[];
  valence?: number[];
  arousal?: number[];
}

interface FinishedResult {
  valence?: number;
  arousal?: number;
  moodTags?: string[];
  energyLevel?: string;
  segments?: Segment[];
}

/** Map a [-1,1]-or-[0,1] value to 0..1. If any negative is seen we assume bipolar. */
function normalizeSeries(values: number[]): number[] {
  if (!values.length) return [];
  const hasNeg = values.some((v) => v < 0);
  return values.map((v) => {
    const n = hasNeg ? (v + 1) / 2 : v;
    return Math.max(0, Math.min(1, n));
  });
}

function norm01(v: number | undefined): number {
  if (v == null || Number.isNaN(v)) return 0.5;
  const n = v < 0 ? (v + 1) / 2 : v;
  return Math.max(0, Math.min(1, n));
}

/** Bucket a (valence, arousal) pair (both 0..1) into a Resound emotion. */
function emotionFor(valence: number, arousal: number): Emotion {
  if (arousal >= 0.6) return valence >= 0.5 ? "joy" : "heat";
  if (valence >= 0.62) return arousal >= 0.4 ? "love" : "calm";
  if (valence <= 0.4) return "melancholy";
  return "calm";
}

/** Evenly downsample an array to at most `max` items, preserving endpoints. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/** Build a normalized 0..1 source arc from Cyanite's time-resolved segments. */
function buildArc(result: FinishedResult): ArcPoint[] {
  const seg = result.segments?.[0];
  const ts = seg?.timestamps ?? [];
  const valRaw = seg?.valence ?? [];
  const aroRaw = seg?.arousal ?? [];
  const n = Math.min(ts.length, valRaw.length, aroRaw.length);

  // No usable per-segment timeline: emit a flat two-point arc from the overall
  // valence/arousal so the dual-arc view still renders.
  if (n < 2) {
    const v = norm01(result.valence);
    const a = norm01(result.arousal);
    const emotion = emotionFor(v, a);
    return [
      { t: 0, valence: v, intensity: a, emotion },
      { t: 1, valence: v, intensity: a, emotion },
    ];
  }

  const times = ts.slice(0, n);
  const val = normalizeSeries(valRaw.slice(0, n));
  const aro = normalizeSeries(aroRaw.slice(0, n));
  const tMax = times[times.length - 1] || 1;

  const points: ArcPoint[] = times.map((t, i) => {
    const valence = val[i];
    const intensity = aro[i];
    return {
      t: tMax > 0 ? Math.max(0, Math.min(1, t / tMax)) : i / (n - 1),
      valence,
      intensity,
      emotion: emotionFor(valence, intensity),
    };
  });

  return downsample(points, MAX_ARC_POINTS);
}

function buildSummary(result: FinishedResult): CyaniteSummary {
  const moodTags = (result.moodTags ?? [])
    .filter((t): t is string => typeof t === "string")
    .slice(0, 6)
    .map((t) => t.replace(/_/g, " "));
  return {
    moodTags,
    valence: norm01(result.valence),
    arousal: norm01(result.arousal),
    energy: (result.energyLevel ?? "unknown").toLowerCase(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a full Cyanite analysis on the given preview audio. Returns the assembled
 * source arc + summary, or `null` on ANY failure (silent fallback to lyric arc).
 */
export async function runCyaniteAnalysis(
  previewUrl: string,
  trackId: string,
  log: Logger,
): Promise<CyaniteResult | null> {
  if (!isCyaniteEnabled()) return null;

  // SSRF guard: only ever fetch preview audio from Apple's CDN.
  if (!isAllowedPreviewUrl(previewUrl)) {
    log.warn("cyanite: preview URL host not allowed — skipping");
    return null;
  }

  const cached = cache.get(trackId);
  if (cached) {
    log.info({ trackId }, "cyanite cache hit");
    return cached;
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    // 1. Fetch the preview audio bytes.
    const audioRes = await fetchWithTimeout(
      previewUrl,
      {},
      15_000,
      "Audio preview",
    );
    if (!audioRes.ok) {
      log.warn({ status: audioRes.status }, "cyanite: preview fetch failed");
      return null;
    }
    const bytes = Buffer.from(await audioRes.arrayBuffer());
    if (bytes.byteLength === 0) {
      log.warn("cyanite: empty preview audio");
      return null;
    }

    // 2. Request an upload slot.
    const upload = await gql<{
      fileUploadRequest: { id: string; uploadUrl: string };
    }>(FILE_UPLOAD_REQUEST, {});
    const { id: uploadId, uploadUrl } = upload.fileUploadRequest;

    // 3. PUT the audio bytes to the signed upload URL.
    const put = await fetchWithTimeout(
      uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "audio/mpeg" },
        body: bytes,
      },
      30_000,
      "Cyanite upload",
    );
    if (!put.ok) {
      log.warn({ status: put.status }, "cyanite: upload PUT failed");
      return null;
    }

    // 4. Register the uploaded file as a library track.
    const created = await gql<{
      libraryTrackCreate: {
        __typename: string;
        createdLibraryTrack?: { id: string };
        message?: string;
      };
    }>(LIBRARY_TRACK_CREATE, {
      input: { uploadId, title: `resound-${trackId}` },
    });
    const createdId = created.libraryTrackCreate.createdLibraryTrack?.id;
    if (!createdId) {
      log.warn(
        { reason: created.libraryTrackCreate.message },
        "cyanite: libraryTrackCreate did not return a track",
      );
      return null;
    }

    // 5. Enqueue analysis.
    await gql(LIBRARY_TRACK_ENQUEUE, {
      input: { libraryTrackId: createdId },
    });

    // 6. Poll until the audio analysis finishes, fails, or we run out of time.
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const poll = await gql<{
        libraryTrack: {
          audioAnalysisV7?: {
            __typename: string;
            result?: FinishedResult;
            error?: { message: string };
          };
        };
      }>(LIBRARY_TRACK_POLL, { id: createdId });

      const analysis = poll.libraryTrack?.audioAnalysisV7;
      const kind = analysis?.__typename;
      if (kind === "AudioAnalysisV7Finished" && analysis?.result) {
        const result: CyaniteResult = {
          sourceArc: buildArc(analysis.result),
          summary: buildSummary(analysis.result),
        };
        if (cache.size >= CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(trackId, result);
        log.info({ trackId }, "cyanite analysis finished");
        return result;
      }
      if (kind === "AudioAnalysisV7Failed") {
        log.warn(
          { reason: analysis?.error?.message },
          "cyanite: analysis failed",
        );
        return null;
      }
      // Enqueued / Processing / NotStarted / NotAuthorized → keep waiting until
      // the deadline, then fall back.
      if (kind === "AudioAnalysisV7NotAuthorized") {
        log.warn("cyanite: not authorized for this track");
        return null;
      }
    }

    log.warn({ trackId }, "cyanite: analysis timed out — falling back to lyric");
    return null;
  } catch (err) {
    log.warn({ err }, "cyanite: analysis errored — falling back to lyric");
    return null;
  }
}
