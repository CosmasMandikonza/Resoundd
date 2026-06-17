import {
  SongSchema,
  SavedAnalysisSummarySchema,
  type AnalyzeInput,
  type AnalyzeErrorBody,
  type SavedAnalysisSummary,
  type Song,
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
