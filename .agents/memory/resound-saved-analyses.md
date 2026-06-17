---
name: Resound saved analyses + optional auth
description: Compliance + reopen-correctness rules for the per-user saved-analyses feature and how optional Replit Auth is wired.
---

# Resound saved analyses + optional auth

Per-user saved analyses backed by Replit Auth. Auth is **optional, never a gate** — Analyze, Featured, and all four views must keep working logged out.

## Compliance: never persist raw lyrics
- Strip every line's `source` to `""` before the DB write. Only the derived layer (translation/localized/scores) is stored.
- **Why:** Raw lyric text must not be persisted (same constraint as the in-memory analyze cache). The DB row is derived-only.
- **How to apply:** On reopen, re-fetch lyric text live and merge it back by line index, then return the rehydrated song. If the live fetch fails, return the derived layer (blank source lines) rather than failing the reopen.

## Reopen must resolve by track key, not title/artist
- Persist the Musixmatch `track_id` (recovered from `song.id` = `song-<trackId>-<targetLang>`) and reopen via `fetchTrackById(trackId)` → `fetchLyrics`.
- **Why:** Re-resolving by title/artist (`resolveTrack`) can pick a different variant (remaster/live/dup), so reopened lyrics may not match the saved analysis.
- **How to apply:** `fetchLyrics` needs a `ResolvedTrack` (it uses `commontrackId` + `hasSubtitles`), so resolve the full track by id first — don't try to fetch lyrics from a bare track_id. Merge by parsing the index out of each `line-<index>` id.

## Auth wiring notes
- `lib/replit-auth-web` `useAuth()` fetches `/api/auth/user` and redirects to `/api/login` / `/api/logout` (root-relative — the proxy mounts api-server at `/api`). Call it once per route component (HudFrame, Landing) and pass the result down as props to avoid duplicate fetches.
- Env: needs `REPL_ID`; `ISSUER_URL` defaults to `https://replit.com/oidc`.
- The web auth lib is a composite lib: it must have `composite: true` + a project reference to `api-client-react` (it imports `AuthUser`), and be listed in the root tsconfig references, or the resound typecheck fails with TS6306.
- Saved-analyses endpoints are hand-written (not in OpenAPI), mirroring the existing analyze precedent; only the auth endpoints went through OpenAPI codegen.
