---
name: Resound M3 Rebirth engine
description: LALAL.AI stem separation + ElevenLabs TTS/sung vocal for the Rebirth view; media store; Web Audio constraints.
---

## Partners

- **LALAL.AI** (`LALAL_LICENSE_KEY`): stem separation of iTunes 30s preview → vocal + instrumental URLs
  - Auth: `Authorization: license {key}`
  - Flow: `POST /api/upload/` (multipart) → `POST /api/preview/` `{id, stem:"vocals", splitter:"phoenix"}` → poll `GET /api/preview/?id={id}` → download stem URLs → save via mediaStore
  - Poll budget: 120s total, 5s interval
  - Client: `artifacts/api-server/src/lib/analyze/lalal.ts`

- **ElevenLabs** (`ELEVENLABS_API_KEY`): TTS vocal for Rebirth view
  - Model: `eleven_multilingual_v2`; voice: `ELEVENLABS_VOICE_ID` env (default Rachel `21m00Tcm4TlvDq8ikWAM`)
  - Two paths: `generateSungRebirth` (precompute, expressive settings + style prompt) and `generateTts` (live on-demand)
  - Client: `artifacts/api-server/src/lib/analyze/elevenlabs.ts`

## Media store

- Path: `MEDIA_DIR` env (default `/tmp/resound-media`)
- Files served by `express.static` at `/api/media` in `app.ts` with `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`
- `saveMedia(filename, bytes)` → `/api/media/<filename>`; `mediaExists(filename)` for idempotency

## Web Audio AnalyserNode constraint

The `<audio>` element serving ElevenLabs audio **must** have `crossOrigin="anonymous"` set **before** the browser loads the resource. Without it, the browser caches the response without CORS headers and `createMediaElementSource()` throws a security error. The `/api/media` route adds `Access-Control-Allow-Origin: *` at the static-serve level.

## Precompute path

`analyzeSongForFeatured` passes `{ waitForCyanite: true, waitForRebirth: true }`. The rebirth block (after Cyanite) runs LALAL + ElevenLabs in `Promise.all`. Both are best-effort; failure leaves `song.stems`/`song.rebirthAudioUrl` absent.

## Live path

`POST /api/rebirth/generate` (route: `/rebirth/generate`) → `generateTts` → patches song via `patchSong` in context. Only fires on explicit user action. Returns 503 gracefully when key absent.

## `partnersUsed` tokens

- `"LALAL"` added when stem separation succeeds
- `"ELEVENLABS"` added when TTS/sung generation succeeds
