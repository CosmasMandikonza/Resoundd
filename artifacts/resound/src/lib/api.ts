import {
  SongSchema,
  SavedAnalysisSummarySchema,
  CyaniteEnrichResultSchema,
  RebirthGenerateResultSchema,
  type AnalyzeInput,
  type AnalyzeErrorBody,
  type CyaniteEnrichResult,
  type SavedAnalysisSummary,
  type Song,
  type RebirthGenerateResult,
} from "@/types";

/** A typed failure thrown by analyzeSong, carrying the machine-readable kind. */
export class AnalyzeRequestError extends Error {
  readonly kind: AnalyzeErrorBody["error"] | "network";

  constructor(kind: AnalyzeErrorBody["error"] | "network", message: string) {
    super(message);
    this.name = "AnalyzeRequestError";
    this.kind = kind;
  }
}

const ENDPOINT = `${import.meta.env.BASE_URL}api/analyze`;

/** POST the analyze request and return a validated Song (or throw a typed error). */
export async function analyzeSong(
  input: AnalyzeInput,
  signal?: AbortSignal,
): Promise<Song> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AnalyzeRequestError(
      "network",
      "Couldn't reach the analysis server.",
    );
  }

  if (!res.ok) {
    let body: Partial<AnalyzeErrorBody> = {};
    try {
      body = (await res.json()) as AnalyzeErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new AnalyzeRequestError(
      body.error ?? "internal",
      body.message ?? `Analysis failed (${res.status}).`,
    );
  }

  const json = await res.json();
  const parsed = SongSchema.safeParse(json);
  if (!parsed.success) {
    throw new AnalyzeRequestError(
      "internal",
      "The server returned a malformed song.",
    );
  }
  return parsed.data;
}

const ENRICH_ENDPOINT = `${import.meta.env.BASE_URL}api/enrich/cyanite`;

/**
 * Ask the server to run the slow Cyanite audio-emotion analysis for a track.
 * Best-effort: any failure (network, server, disabled) resolves to a silent
 * lyric fallback (`{ emotionSource: "lyric" }`) so the caller keeps the arc it
 * already has. Never throws.
 */
export async function enrichCyanite(input: {
  trackId: string;
  previewUrl: string;
  targetLang?: string;
  signal?: AbortSignal;
}): Promise<CyaniteEnrichResult> {
  const fallback: CyaniteEnrichResult = { emotionSource: "lyric" };
  try {
    const res = await fetch(ENRICH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: input.trackId,
        previewUrl: input.previewUrl,
        ...(input.targetLang ? { targetLang: input.targetLang } : {}),
      }),
      signal: input.signal,
    });
    if (!res.ok) return fallback;
    const parsed = CyaniteEnrichResultSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : fallback;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return fallback;
  }
}

const FEATURED_ENDPOINT = `${import.meta.env.BASE_URL}api/featured`;

/** A featured gallery entry (precomputed, fully enriched). */
export interface FeaturedItem {
  id: string;
  song: Song;
}

/**
 * Fetch the public featured gallery. Returns an empty array on any failure so
 * the caller can fall back to the built-in fixture.
 */
export async function listFeatured(): Promise<FeaturedItem[]> {
  try {
    const res = await fetch(FEATURED_ENDPOINT);
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: unknown };
    if (!Array.isArray(json.items)) return [];
    const items: FeaturedItem[] = [];
    for (const raw of json.items) {
      if (typeof raw !== "object" || raw === null) continue;
      const { id, song } = raw as { id?: unknown; song?: unknown };
      const parsed = SongSchema.safeParse(song);
      if (typeof id === "string" && parsed.success) {
        items.push({ id, song: parsed.data });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** A typed failure thrown by the saved-analyses calls. */
export class SavedRequestError extends Error {
  readonly kind: "auth" | "not_found" | "network" | "internal";

  constructor(
    kind: "auth" | "not_found" | "network" | "internal",
    message: string,
  ) {
    super(message);
    this.name = "SavedRequestError";
    this.kind = kind;
  }
}

const SAVED_ENDPOINT = `${import.meta.env.BASE_URL}api/saved-analyses`;

async function savedFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: "include", ...init });
  } catch {
    throw new SavedRequestError(
      "network",
      "Couldn't reach the analysis server.",
    );
  }
}

async function savedErrorFor(res: Response): Promise<SavedRequestError> {
  let message: string | undefined;
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") message = body.message;
  } catch {
    // No JSON body — fall back to status-based defaults below.
  }
  if (res.status === 401)
    return new SavedRequestError("auth", message ?? "Please sign in.");
  if (res.status === 404)
    return new SavedRequestError(
      "not_found",
      message ?? "That saved analysis is gone.",
    );
  return new SavedRequestError("internal", message ?? "Something went wrong.");
}

/** List the signed-in user's saved analyses, newest first. */
export async function listSavedAnalyses(): Promise<SavedAnalysisSummary[]> {
  const res = await savedFetch(SAVED_ENDPOINT);
  if (!res.ok) throw await savedErrorFor(res);
  const json = (await res.json()) as { items?: unknown };
  const parsed = SavedAnalysisSummarySchema.array().safeParse(json.items);
  if (!parsed.success) {
    throw new SavedRequestError("internal", "Saved list was malformed.");
  }
  return parsed.data;
}

/** Persist the current song for the signed-in user (raw lyrics are stripped server-side). */
export async function saveAnalysis(
  song: Song,
): Promise<SavedAnalysisSummary> {
  const res = await savedFetch(SAVED_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(song),
  });
  if (!res.ok) throw await savedErrorFor(res);
  const parsed = SavedAnalysisSummarySchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new SavedRequestError("internal", "Save response was malformed.");
  }
  return parsed.data;
}

/** Reopen a saved analysis — the server re-fetches the raw lyrics live and merges them. */
export async function openSavedAnalysis(id: string): Promise<Song> {
  const res = await savedFetch(`${SAVED_ENDPOINT}/${encodeURIComponent(id)}`);
  if (!res.ok) throw await savedErrorFor(res);
  const parsed = SongSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new SavedRequestError("internal", "The reopened song was malformed.");
  }
  return parsed.data;
}

const REBIRTH_GENERATE_ENDPOINT = `${import.meta.env.BASE_URL}api/rebirth/generate`;

/**
 * Generate a rebirth vocal for a live song on demand.
 *
 * Returns the validated result on success, or `null` on any failure (missing
 * key, generation error, network) so the caller can surface a graceful
 * "unavailable" state rather than crashing.
 */
export async function generateRebirth(input: {
  songId: string;
  targetLang: string;
  lyrics: string[];
}): Promise<RebirthGenerateResult | null> {
  try {
    const res = await fetch(REBIRTH_GENERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const parsed = RebirthGenerateResultSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
