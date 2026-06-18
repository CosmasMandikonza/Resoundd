---
name: Resound partner integrations (Cyanite + Songstats)
description: Async vs inline partner enrichment, the precompute cache-gating trap, SSRF chokepoint, and the admin token gate for the featured/precompute curation path.
---

# Resound partner data sources (Milestone 2)

Two partner sources feed the analyze pipeline. Both are **best-effort with silent
fallback** — any failure returns null and the song keeps `emotionSource:"lyric"`
/ `marketDataSource:"estimated"`. The provenance line is built from
`song.partnersUsed`.

- **Songstats** = market data, run **inline** during `/api/analyze` (overlays
  streams/momentum onto markets; readiness still comes from fidelity).
- **Cyanite** = audio emotion, run **async**: the live path returns the lyric arc
  immediately and the client enriches via `POST /api/enrich/cyanite`. Only the
  precompute/featured path waits for Cyanite inline (`waitForCyanite`).

## The precompute cache-gating trap
**Rule:** when `waitForCyanite` is true, a plain cache hit must NOT be returned
unless that cached song is itself already Cyanite-enriched
(`hit.emotionSource === "cyanite"`).
**Why:** the analyze cache is keyed only by `trackId:targetLang` and is shared
between the live (lyric-only) path and the precompute path. Without this guard,
precompute hits a prior live result and ships a featured song that silently
skipped the audio analysis.
**How to apply:** preserve the guard `hit && (!waitForCyanite || hit.emotionSource === "cyanite")` if you ever touch the cache read in `pipeline.ts`.

## SSRF chokepoint
`/api/enrich/cyanite` accepts a client-supplied `previewUrl`. The host allowlist
(`isAllowedPreviewUrl`: https + `*.apple.com` / `*.mzstatic.com`) is enforced
**inside `runCyaniteAnalysis`**, not just in the route — that one chokepoint
covers both the enrich route and the pipeline. Keep new audio-fetch entry points
behind it.

## Admin curation gate
`POST /api/precompute` triggers expensive LLM+Cyanite jobs and mutates the public
featured store, so it is gated by a service token: `PRECOMPUTE_TOKEN` env var,
sent as the `x-precompute-token` header (constant-time compare). When the token
is **unset the endpoint is disabled (403)** — that is the intended safe default,
not a bug. `GET /api/featured` is public and returns `{items:[]}` until songs are
curated.
