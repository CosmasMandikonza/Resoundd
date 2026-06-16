---
name: WebGL / R3F in the screenshot sandbox
description: The screenshot/preview sandbox has no WebGL; any react-three-fiber Canvas must be capability-gated with a CSS fallback or screenshots crash.
---

# WebGL / react-three-fiber in the Replit screenshot sandbox

The `screenshot` (app_preview) environment **cannot create a WebGL context**. A
bare `react-three-fiber` `<Canvas>` (or any `THREE.WebGLRenderer`) throws on init,
which surfaces as a full-screen Vite runtime-error overlay in the screenshot — even
though the same code works fine in a real browser.

**How to apply:** Any R3F/Three component must:
1. Run a `detectWebGL()` capability check (try `getContext("webgl2"|"webgl"|"experimental-webgl")`) and render a CSS/DOM fallback when false.
2. Additionally wrap the `<Canvas>` in a class error boundary (`getDerivedStateFromError`) with the same fallback, to catch renderer-init failures that slip past detection.

**Why:** Without this, screenshots are unusable for visual verification and look
like the app is broken. The fallback should be on-brand (driven by the same design
tokens) so the degraded state still looks intentional.

## Related: HMR "Invalid hook call" with R3F
While editing R3F components, Vite Fast Refresh can momentarily log
`Invalid hook call` / `Cannot read properties of null (reading 'useMemo')` from
`CanvasImpl`. This is an **HMR transient**, not a real duplicate-React bug — verify
by checking only one `react@x` exists under `node_modules/.pnpm` and confirming a
clean workflow restart (cold load) has no error. Don't chase optimizeDeps/dedupe
fixes unless the error survives a cold start.
