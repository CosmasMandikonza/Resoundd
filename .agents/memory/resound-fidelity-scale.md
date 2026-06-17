---
name: Resound fidelity scale boundary
description: The 0..1 vs 0-100 split between the Song contract and the analysis LLM.
---

The `Song`/`Fidelity`/`Line.drift` contract (in `@workspace/shared-types`) uses
**0..1** floats. The four views render these values directly (bars, arcs,
readouts assume 0..1).

The analysis LLM is prompted to emit scores on a **0-100** scale (easier for the
model to reason about and keep consistent). `stressMatch`/`readiness` stay 0-100
in the contract; everything else (per-line + overall `fidelity`,
`rebornFidelity`, `drift`) is 0..1.

**Why:** mixing the two scales silently produces washed-out or maxed-out
visuals with no error, because both are valid numbers.

**How to apply:** any new LLM-derived fidelity-like field must be divided by 100
(`f01`/`toFidelity` in the pipeline) before it enters a `Song`. Drift from
embeddings is already 0..1 (1 - cosine). The pipeline ends with
`SongSchema.parse`, but the schema does not range-check 0..1, so the /100 step is
the only guard — keep it.
