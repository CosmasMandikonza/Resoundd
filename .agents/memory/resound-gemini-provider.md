---
name: Resound Gemini LLM provider
description: Non-obvious constraints when running the analyze pipeline on Gemini (schema, latency, retry policy).
---

# Resound Gemini provider

The analyze pipeline supports `LLM_PROVIDER=gemini` for both analysis and embeddings,
self-contained to the provider/client layer (no view/pipeline/contract changes).

## Gemini structured-output schema (HTTP 400 trap)
Gemini's `responseSchema` rejects unknown keys, so the JSON schema from
`zodToJsonSchema` must be sanitized to allowed keys only — BUT the sanitizer must
special-case the `properties` object: its **keys are field names**, not schema
keywords, and must be preserved. Stripping them yields a 400.
**Why:** field names like `meaning` look like unknown keywords to a naive filter.

## Latency & timeout
Gemini structured output is much slower than OpenAI JSON mode: ~30–42s observed for
~24 lines (p100 has touched ~42s). `ANALYSIS_TIMEOUT_MS` is 60s to clear that with
margin. The shared proxy (`localhost:80`) tolerates these long single requests.
A timeout surfaces as `AnalyzeError` kind `"timeout"` (from `fetchWithTimeout`).
**How to apply:** if you shorten the timeout or switch models, re-measure; near-edge
values cause intermittent "Gemini timed out" in the UI/e2e.

## Retry classification (don't over-retry)
Two independent budgets in `analyzeWithGemini`:
- Transient HTTP only (503/500/overloaded, non-quota 429) are marked `retriable` and
  backed off + retried.
- A malformed model response gets exactly **one** parse re-roll (cap total latency).
- Timeouts (kind `"timeout"`), quota (429 insufficient), and auth (401/403) are
  **never** retried.
**Why:** an earlier version retried any `kind === "analysis"` error, which also caught
non-retriable `throwGemini("other")` failures and could triple tail latency.

## In-memory cache caveat
The analyze cache is per-process in-memory keyed `${trackId}:${targetLang}`. It does
NOT survive an api-server restart, and long (~40s) requests can coincide with workflow
restarts, so don't rely on a warmed cache across restarts when demoing.
