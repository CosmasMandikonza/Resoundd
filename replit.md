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
- `artifacts/api-server/src/lib/provider.ts` — `getLlmProvider()` reads `LLM_PROVIDER` (`openai` | `gemini`, default `gemini`); the analysis and embedding paths dispatch on it.
- `artifacts/api-server/src/lib/analyze/` — the analysis pipeline: `pipeline.ts` (orchestrator), `musixmatch.ts` (track + lyrics), `itunes.ts` (preview audio), `llm.ts` (shared prompt/parse + OpenAI JSON-mode path), `gemini.ts` (Gemini structured-output + embeddings path), `embeddings.ts` (back-translation drift, dispatches by provider), `fingerprint.ts` (arcs + markets), `cache.ts`, `errors.ts`, `http.ts`, `mediaStore.ts` (audio file persistence at MEDIA_DIR), `lalal.ts` (stem separation), `elevenlabs.ts` (TTS/sung rebirth).
- `artifacts/api-server/src/routes/analyze.ts` — `POST /api/analyze`, mounted in `routes/index.ts`.
- `artifacts/resound/src/context/useResound.tsx` — holds the active `song`, `isLive`, `loadSong`, `resetToShowcase`. Every view reads the song from here.
- `artifacts/resound/src/lib/api.ts` — client `analyzeSong()` that POSTs and re-validates the response with the shared `SongSchema`. Also the saved-analyses client (`listSavedAnalyses`/`saveAnalysis`/`openSavedAnalysis`), all `credentials:"include"` and schema-revalidated.
- `artifacts/api-server/src/routes/saved-analyses.ts` — `GET/POST /api/saved-analyses` + `GET /api/saved-analyses/:id`; auth-gated per-user. Save strips raw `line.source`; reopen re-fetches lyrics live by the persisted Musixmatch `track_id` (`fetchTrackById`) and merges by line index, falling back to the derived layer if the fetch fails.
- `artifacts/resound/src/components/SavedControls.tsx` — header SAVE/SAVED/auth controls + the SAVED overlay. `lib/replit-auth-web` provides `useAuth()` (called once each in HudFrame + Landing; logged-out users still get full use, SAVE shows a "Sign in to save" hint, SAVED is hidden).
- `artifacts/resound/src/components/AnalyzePanel.tsx` — the ANALYZE form (title/artist/target-lang, TRY quick-picks, loading step cycle, error + retry).
- `artifacts/resound/src/fixtures/showcase.ts` — the built-in SHOWCASE song (includes stems + rebirthSource for Rebirth view demo).

## Architecture decisions

- **Contract-first, single source of truth.** Types live in `@workspace/shared-types` as Zod schemas; the server validates pipeline output with `SongSchema` and the client re-validates the response with the same schema, so a contract drift fails loudly on both ends.
- **Fidelity scale split.** The contract uses 0..1 floats (views consume directly); the LLM emits 0-100 and the pipeline divides by 100 on assembly. `stressMatch`/`readiness` stay 0-100; drift is 0..1.
- **Same `Song` shape for showcase and live.** Views are source-agnostic — they render whatever `song` the context holds. Live results just set `isLive` and swap the song (views re-mount via `key={song.id}`).
- **No raw-lyrics persistence.** Lyrics are fetched, analyzed, and discarded; only the assembled `Song` is cached in-memory keyed `${trackId}:${targetLang}`. All provider keys stay server-side.
- **Errors are sanitized.** Upstream URLs (which carry the Musixmatch key) never appear in client-facing error messages; generic failures return a fixed message and log detail server-side only.
- **Auth is optional, never a gate.** Replit Auth adds per-user saved analyses only; Analyze, Featured, and all four views work fully logged out. UI labels stay generic ("Sign in"/"Sign out").
- **Saved analyses persist only the derived layer.** Raw `line.source` is stripped before the DB write (compliance: no raw-lyric persistence); reopen re-fetches lyric text live by the persisted Musixmatch `track_id` and merges by `line-<index>` id. Keyed unique on `userId+trackId+targetLang`.

## Product

Resound is a music-translation instrument. Enter any song + artist and a target language; the backend resolves the track (Musixmatch), pulls lyrics + a preview (iTunes), and runs an LLM + embedding analysis to measure how much meaning, emotion, culture, and singability survive the translation. Results render through four views — MEANING-CAST (emotional fingerprint), FIDELITY (per-line loss map), REBIRTH (stem deconstruct + dual audio A/B + waveform), and WORLD (per-market release readiness) — with a LIVE/SHOWCASE badge and quiet provenance notes (sync level, generated translation, preview-lyrics limits). A built-in showcase song renders when no analysis has been run.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- A live analysis needs a **valid `MUSIXMATCH_API_KEY`**. An invalid key returns HTTP 502 (`error: "auth"`) on `/api/analyze` — the pipeline is wired correctly, the key just needs re-checking. The LLM provider is selected by `LLM_PROVIDER` (`openai` | `gemini`, default `gemini`): `gemini` uses `GEMINI_API_KEY`, `openai` uses `OPENAI_API_KEY`, each powering both analysis and embeddings.
- **Partner data is optional, best-effort, with silent fallback.** Cyanite (audio emotion) needs `CYANITE_ACCESS_TOKEN`; Songstats (market data) needs `SONGSTATS_API_KEY`; LALAL.AI (stem separation) needs `LALAL_LICENSE_KEY`; ElevenLabs (rebirth vocal) needs `ELEVENLABS_API_KEY` (optional `ELEVENLABS_VOICE_ID`). When a key is missing or the call fails, the song simply omits that data — `partnersUsed` lists only what succeeded. Songstats + LALAL + ElevenLabs run inline in `/api/precompute` (precomputed featured songs only); Cyanite runs async — the client enriches via `POST /api/enrich/cyanite` after a live load. Live rebirth TTS fires on explicit user action via `POST /api/rebirth/generate` (returns 503 gracefully when key absent). Generated audio is served from `MEDIA_DIR` (default `/tmp/resound-media`) at `/api/media/*` with `Access-Control-Allow-Origin: *` for Web Audio AnalyserNode. See the `resound-partners-milestone2` and `resound-m3-rebirth` memory notes.
- **`POST /api/precompute` is an admin curation endpoint gated by `PRECOMPUTE_TOKEN`** (sent as the `x-precompute-token` header). When the token is unset the endpoint is disabled (HTTP 403) by design; `GET /api/featured` is public and returns `{items:[]}` until songs are curated.
- **Gemini is slow.** Structured-output analysis runs ~30-42s for ~24 lines, so `ANALYSIS_TIMEOUT_MS` is 60s; near-edge values cause intermittent "Gemini timed out". Only transient HTTP (503/500/overloaded, non-quota 429) is retried — timeouts, quota, and auth are not. See the `resound-gemini-provider` memory note for the schema-400 trap and retry policy.
- After editing server code, **restart the `artifacts/api-server` workflow** — its dev script builds once then serves the bundle, so changes aren't picked up until restart.
- Adding a domain field is a two-touch change: update the Zod schema in `@workspace/shared-types`, then run `pnpm run typecheck:libs` before the artifacts typecheck (stale lib declarations otherwise look like missing exports).
- Never interpolate an upstream URL into an `AnalyzeError` message — the Musixmatch key rides in the query string and error messages reach the client.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
