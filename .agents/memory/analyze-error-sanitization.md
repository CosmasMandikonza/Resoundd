---
name: Analyze error sanitization
description: Why analyze-pipeline errors must never echo upstream URLs or raw internal messages to the client.
---

The Musixmatch API key is passed as an `apikey` **query parameter** on every
request URL. The `/api/analyze` route returns `AnalyzeError.message` to the
client as JSON.

**Why:** if any error message interpolates the request URL (e.g. a timeout
"Upstream request timed out: <url>"), the secret leaks to the browser. This
happened once and was caught in review.

**How to apply:**
- `fetchWithTimeout` takes a non-sensitive `label` (e.g. "Musixmatch") and uses
  only that in timeout/unreachable errors — never the URL.
- The route's generic `catch` (non-`AnalyzeError`) returns a fixed message and
  logs the real error server-side only.
- Only deliberately-safe `AnalyzeError` messages are returned to the client.
  When adding a new upstream or error path, assume any string you put in an
  `AnalyzeError` may reach the browser.
