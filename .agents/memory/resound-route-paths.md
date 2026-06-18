---
name: Resound API route path convention
description: Express routes must NOT include /api prefix — the reverse proxy strips it before forwarding to the server.
---

## Rule

Express route handlers in `artifacts/api-server/src/routes/` must register their paths **without** the `/api` prefix.

**Correct:**
```ts
router.post("/rebirth/generate", ...)   // client calls /api/rebirth/generate
router.get("/healthz", ...)             // client calls /api/healthz
router.post("/analyze", ...)            // client calls /api/analyze
```

**Wrong:**
```ts
router.post("/api/rebirth/generate", ...)  // will never match — 404
```

**Why:** The global reverse proxy (artifact.toml `paths = ["/api"]`) routes `/api/*` traffic to the API server, but strips the `/api` prefix from the path before the request reaches Express. All existing routes confirm this pattern.

**How to apply:** Whenever adding a new route, check an existing route (`health.ts`, `analyze.ts`) for the path convention. The express.static mount in `app.ts` uses `/api/media` because it is mounted on `app`, which sits upstream of the proxy path-stripping — that is a different code path.
