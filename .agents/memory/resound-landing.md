---
name: Resound landing isolation
description: Why the landing duplicates sphere/wash logic and how its scroll motion is wired
---

# Resound landing (`artifacts/resound/src/pages/Landing.tsx` + `components/landing/`)

- The landing is built under an **edit-landing-only** constraint: do not modify instrument views, `cast/Fingerprint.tsx`, the analyze pipeline, or the Zod contract.
  - **Why:** keeps the marketing surface decoupled from the instrument.
  - **How to apply:** the ambient sphere **replicates** Fingerprint's wash-texture + `meshStandardMaterial` tinting locally (`landing/AmbientSphere.tsx`) instead of importing from the view. If you need shared 3D helpers later, extract to a lib rather than importing across artifacts views.

- `gsap` + `lenis` are **devDependencies of `@workspace/resound`** (this is a client-only Vite artifact) and were **not** in the workspace catalog — add with `pnpm --filter @workspace/resound add -D gsap lenis`.

- Scroll motion (Lenis smooth-scroll + GSAP ScrollTrigger reveals) is **gated on `prefers-reduced-motion`**: reduced-motion users get no Lenis/GSAP and see content at full opacity. Reveals use `gsap.set(...opacity:0)` + a one-shot `gsap.to({...once:true})` + `ScrollTrigger.refresh()` so elements can never be stranded hidden if a trigger misfires.
