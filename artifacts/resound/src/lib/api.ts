import {
  SongSchema,
  type AnalyzeInput,
  type AnalyzeErrorBody,
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
