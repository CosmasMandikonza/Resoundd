# Resound

> **Every song, alive in every language.**

Resound is an instrument for cross-language music. It measures what a song loses when it's translated into another language — meaning, emotion, even singability — shows you exactly what breaks, and rebuilds it as a faithful, singable, *sung* version in the new language.

Built for the [Musixmatch Musicathon 2026](https://musicathon.musixmatch.com).

<!-- Replace with a real screenshot or GIF of the product -->
<!-- ![Resound](docs/screenshot.png) -->

## The problem

Music has gone global — a song no longer needs to be in English to top charts around the world. But every time a song crosses into a new language, something breaks: a metaphor flattens, a feeling cools, a line that used to sing becomes impossible to sing. Today, no tool measures that loss. Resound does — and then rebuilds what broke.

## What it does

Paste any song and Resound reads the original against its translation through four lenses:

- **Meaning-Cast** — a living emotional fingerprint of the song, with the original's emotional arc drawn against the translation's, so you can see where the feeling diverges.
- **Fidelity** — a line-by-line Loss Map scoring how much of the song's **Meaning**, **Emotion**, and **Culture** survive, with the evidence behind every number.
- **Rebirth** — the song rebuilt in the target language as a faithful, *singable* localization you can hear, sung over the original instrumental.
- **World** — a Global Release Cockpit that ranks every market by real streaming momentum and release-readiness, so you know exactly where to localize first.

Three metrics built for this:

- **Fidelity Score** — how much Meaning / Emotion / Culture survives the crossing.
- **Singability Score** — whether the new lyrics fit the melody: syllable count, stress, and rhyme.
- **Emotional Arc** — how the feeling moves across the song, second by second.

## Under the hood — grounded, not a black box

Every score traces back to a real signal:

- **Musixmatch** is the foundation — word-by-word **richsync** timing, **official translations**, and **lyric analysis** give the true structure of the song.
- **Emotion** is read from the audio itself via **Cyanite's** time-based mood and energy curves, then compared against the emotion the words carry.
- **Meaning loss** is measured by back-translating the localized lyrics and computing semantic drift.
- **Singability** is computed against the actual syllable timing from richsync.
- The **Rebirth** is real audio: **LALAL.AI** separates the original into vocal and instrumental stems, and **ElevenLabs** sings the localized lyrics back over the instrumental.

The system runs a fast core on every request and enriches asynchronously, degrading gracefully when an optional service is unavailable (e.g. follow-along mode when reborn audio isn't ready).

## Built on

| Service | Role |
|---|---|
| **Musixmatch** | Lyrics, richsync timing, official translations, lyric analysis, catalog |
| **Cyanite** | Audio-derived emotion (mood & energy curves) |
| **Songstats** | Live streaming momentum & market data |
| **ElevenLabs** | The reborn localized vocal |
| **LALAL.AI** | Vocal / instrumental stem separation |
| **iTunes Search API** | 30-second audio previews |
| **Gemini** | Structured lyric & meaning analysis (LLM provider is switchable) |
| **Replit** | Built & deployed |

## Tech stack

- **Frontend:** Vite + React + TypeScript + Tailwind (custom design tokens), `@react-three/fiber` + `three`, `d3`, `dotted-map`
- **Backend:** Node + Express — proxies all third-party APIs so keys stay server-side
- **Shared types:** pnpm workspace with Zod-validated schemas (`@workspace/shared-types`) used by both client and server
- **LLM:** Gemini (`gemini-2.5-flash`, structured JSON output, temperature 0); provider is environment-switchable

## Project structure

```
.
├── artifacts/        # the Resound app (client + Express server)
├── lib/              # shared TypeScript types (Zod schemas)
├── scripts/          # utilities (e.g. featured-song pre-compute)
├── replit.md         # project notes
└── pnpm-workspace.yaml
```

## Running locally

**Prerequisites:** Node 20+ and `pnpm`.

```bash
pnpm install
pnpm dev
```

Set the following as environment variables (or Replit Secrets):

| Variable | Purpose | Required |
|---|---|---|
| `MUSIXMATCH_API_KEY` | Lyrics, richsync, translations, analysis | Yes |
| `GEMINI_API_KEY` | LLM analysis (default provider) | Yes |
| `CYANITE_ACCESS_TOKEN` | Audio emotion analysis | Optional* |
| `SONGSTATS_API_KEY` | Live market data | Optional* |
| `ELEVENLABS_API_KEY` | Reborn vocal synthesis | Optional* |
| `LALAL_LICENSE_KEY` | Stem separation | Optional* |

\*Optional services degrade gracefully: without them, Resound falls back to lyric-derived emotion, estimated market data, and follow-along (text) rebirth.

## Data & compliance

Resound stores only **derived** data — scores, emotional arcs, and the localized text it generates. Raw lyrics are fetched live from Musixmatch per request and kept in memory only, never persisted, in line with the Musixmatch API terms. A small curated set of featured songs is pre-computed for instant, fully-enriched demos.

## Credits

Built for the **Musixmatch Musicathon 2026** — powered by Musixmatch, Cyanite, Songstats, ElevenLabs, LALAL.AI, and Replit.
