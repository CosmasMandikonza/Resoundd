import { AnalyzeError } from "./errors";

/**
 * fetch with an abort-based timeout. Throws AnalyzeError("timeout") on expiry.
 *
 * `label` is a short, non-sensitive description of the upstream (e.g.
 * "Musixmatch") used in the user-facing error. The raw URL is NEVER included
 * because it can carry secrets (API keys in query params).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
  label = "Upstream service",
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AnalyzeError("timeout", `${label} timed out.`);
    }
    throw new AnalyzeError("timeout", `${label} is unreachable.`);
  } finally {
    clearTimeout(timer);
  }
}
