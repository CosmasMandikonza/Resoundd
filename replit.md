# Resound

A music-translation instrument that visualizes how much meaning, emotion, culture, and singability survive when a song crosses languages.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/shared-types/src/index.ts` — **contract source of truth.** All domain types (`Song`, `Line`, `Fidelity`, `Market`, `Fingerprint`, `Emotion`, etc.) are Zod schemas with inferred types, plus `AnalyzeInputSchema`, `SUPPORTED_TARGET_LANGS`, and the analyze error shape. Imported by both server and client. `artifacts/resound/src/types.ts` just re-exports it.
- `artifacts/api-server/src/lib/analyze/` — the analysis pipeline: `pipeline.ts` (orchestrator), `musixmatch.ts` (track + lyrics), `itunes.ts` (preview audio), `llm.ts` (OpenAI analysis, JSON mode), `embeddings.ts` (back-translation drift), `fingerprint.ts` (arcs + markets), `cache.ts`, `errors.ts`, `http.ts`.
- `artifacts/api-server/src/routes/analyze.ts` — `POST /api/analyze`, mounted in `routes/index.ts`.
- `artifacts/resound/src/context/useResound.tsx` — holds the active `song`, `isLive`, `loadSong`, `resetToShowcase`. Every view reads the song from here.
- `artifacts/resound/src/lib/api.ts` — client `analyzeSong()` that POSTs and re-validates the response with the shared `SongSchema`.
- `artifacts/resound/src/components/AnalyzePanel.tsx` — the ANALYZE form (title/artist/target-lang, TRY quick-picks, loading step cycle, error + retry).
- `artifacts/resound/src/fixtures/showcase.ts` — the built-in SHOWCASE song.

## Architecture decisions

- **Contract-first, single source of truth.** Types live in `@workspace/shared-types` as Zod schemas; the server validates pipeline output with `SongSchema` and the client re-validates the response with the same schema, so a contract drift fails loudly on both ends.
- **Fidelity scale split.** The contract uses 0..1 floats (views consume directly); the LLM emits 0-100 and the pipeline divides by 100 on assembly. `stressMatch`/`readiness` stay 0-100; drift is 0..1.
- **Same `Song` shape for showcase and live.** Views are source-agnostic — they render whatever `song` the context holds. Live results just set `isLive` and swap the song (views re-mount via `key={song.id}`).
- **No raw-lyrics persistence.** Lyrics are fetched, analyzed, and discarded; only the assembled `Song` is cached in-memory keyed `${trackId}:${targetLang}`. All provider keys stay server-side.
- **Errors are sanitized.** Upstream URLs (which carry the Musixmatch key) never appear in client-facing error messages; generic failures return a fixed message and log detail server-side only.

## Product

Resound is a music-translation instrument. Enter any song + artist and a target language; the backend resolves the track (Musixmatch), pulls lyrics + a preview (iTunes), and runs an LLM + embedding analysis to measure how much meaning, emotion, culture, and singability survive the translation. Results render through four views — MEANING-CAST (emotional fingerprint), FIDELITY (per-line loss map), REBIRTH (literal vs. singable rendering), and WORLD (per-market release readiness) — with a LIVE/SHOWCASE badge and quiet provenance notes (sync level, generated translation, preview-lyrics limits). A built-in showcase song renders when no analysis has been run.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- A live analysis needs a **valid `MUSIXMATCH_API_KEY`**. An invalid key returns HTTP 502 (`error: "auth"`) on `/api/analyze` — the pipeline is wired correctly, the key just needs re-checking. `OPENAI_API_KEY` powers both the LLM analysis and embeddings.
- After editing server code, **restart the `artifacts/api-server` workflow** — its dev script builds once then serves the bundle, so changes aren't picked up until restart.
- Adding a domain field is a two-touch change: update the Zod schema in `@workspace/shared-types`, then run `pnpm run typecheck:libs` before the artifacts typecheck (stale lib declarations otherwise look like missing exports).
- Never interpolate an upstream URL into an `AnalyzeError` message — the Musixmatch key rides in the query string and error messages reach the client.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
