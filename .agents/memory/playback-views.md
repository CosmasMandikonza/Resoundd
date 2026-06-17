---
name: Resound playback views
description: Convention for building synchronized playback views (Cast, Rebirth, …) in artifacts/resound
---

# Synchronized playback views

Each "view" (CastView, RebirthView) that plays a song runs its own clock and
writes to shared context. New playback views must follow the same shape so they
stay consistent and never crash in the screenshot sandbox (which has no audio).

- **Clock:** drive line highlighting from an `<audio>` element when its src
  loads, else fall back to a synthetic RAF clock so highlighting still advances.
  Track which mode via a ref (`'audio' | 'synthetic'`). Show a
  "NO … — FOLLOW-ALONG MODE" note when audio is missing/fails. Always attach an
  audio `error` listener and clean up both the RAF and audio on unmount.
- **Shared context:** update `isPlaying`, `timecode` (MM:SS:mmm), `activeEmotion`,
  and `resonance` from the active view via `useResound`.
- **Forced display state during playback:** do NOT mutate a `mode`/toggle state
  when play starts. Derive it: `const effectiveMode = isPlaying ? 'reborn' : mode`
  and disable the toggle while playing. **Why:** mutating on play let the user
  click the toggle back mid-playback, desyncing the UI from the forced state;
  deriving keeps it locked and restores the user's choice when playback stops.
- **Colors:** resolve emotion accents once via `useMemo` into an
  `emotion → color` map; never call `resolveEmotionColor` inside per-row render,
  since it reads computed CSS vars and the row list re-renders every clock frame.
