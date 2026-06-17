---
name: Resound landing isolation
description: Edit-landing-only constraint, the kinetic hero, and how its motion is wired/gated
---

# Resound landing (`artifacts/resound/src/pages/Landing.tsx` + `components/landing/`)

- The landing is built under an **edit-landing-only** constraint: do not modify instrument views, `cast/Fingerprint.tsx`, the analyze pipeline, or the Zod contract.
  - **Why:** keeps the marketing surface decoupled from the instrument.
  - **How to apply:** if you need shared 3D/animation helpers across artifacts later, extract to a lib rather than importing across artifact views.

- `gsap` + `lenis` are **devDependencies of `@workspace/resound`** (client-only Vite artifact), not in the workspace catalog. **GSAP SplitText is free/bundled in gsap 3.13+** (`import { SplitText } from "gsap/SplitText"`); register it alongside ScrollTrigger.

- **The hero is "THE BORDER" kinetic typography** (`landing/KineticBorder.tsx`): one lyric rendered as overlaid source + English layers split by a cursor/touch-following vertical border via `clip-path: inset(...)` math, with an ~80px transition band (blur + RGB-split text-shadow + accent wash) and a resisting untranslatable word. The border + clips + readout are driven by a `requestAnimationFrame` loop writing DOM styles off **refs** — never React state per frame; only the line index (~6s) and the reduced-motion flag are React state.
  - Background is `landing/ColorField.tsx`: a 2D-canvas flowing accent color-field (DPR capped at 2, rAF + ResizeObserver disposed on unmount) with a CSS-gradient fallback if the 2D context is missing. It is `fixed inset-0` behind a `bg-void/70` scrim; lower sections sit at `z-10` and the pillars grid uses a transparent grid overlay so the field shows through.

- **Reduced-motion must be truly static.** Gate *every* timer/loop on `prefers-reduced-motion`, including the line-cycling `setInterval` (not just the rAF loop) — otherwise reduced mode still mutates content every 6s. Reduced mode renders one fully-resolved English line with a fixed MEANING readout and no kinetic layers.
  - Scroll motion (Lenis + ScrollTrigger reveals + SplitText headline reveals) is also gated on reduced-motion. Reveals use explicit hidden state + one-shot `once`/`refresh` tweens so elements can't be stranded hidden; **`SplitText` instances must be `.revert()`-ed in cleanup** (gsap.context revert does not undo the DOM split).

- "MUSICATHON 2026" lives **only in the footer** ("Built for Musicathon 2026"); it must not appear in the hero HUD.
