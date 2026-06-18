import { z } from "zod";

/**
 * Single source of truth for the Resound domain contract, shared by the Express
 * analysis server (output validation) and the React client (typing + display).
 *
 * IMPORTANT: all fidelity sub-scores are 0..1 (the views consume them directly).
 * The LLM emits 0-100; the server divides by 100 before assembling a Song.
 */

export const EmotionSchema = z.enum([
  "joy",
  "heat",
  "love",
  "calm",
  "melancholy",
]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const FidelitySchema = z.object({
  meaning: z.number(),
  emotion: z.number(),
  culture: z.number(),
  singability: z.number(),
});
export type Fidelity = z.infer<typeof FidelitySchema>;

export const LineSchema = z.object({
  id: z.string(),
  tStart: z.number(),
  tEnd: z.number(),
  source: z.string(),
  translation: z.string(),
  /** Resound's faithful, singable rendering (the "reborn" line). */
  localized: z.string(),
  emotion: EmotionSchema,
  fidelity: FidelitySchema,
  /** The lifted scores for the localized rendering. */
  rebornFidelity: FidelitySchema,
  lost: z.string().optional(),
  risk: z.string().optional(),
  /** Back-translation drift, 0..1 (embedding cosine distance). Live data only. */
  drift: z.number().optional(),
});
export type Line = z.infer<typeof LineSchema>;

export const ArcPointSchema = z.object({
  t: z.number(),
  valence: z.number(),
  intensity: z.number(),
  emotion: EmotionSchema,
}); // 0..1
export type ArcPoint = z.infer<typeof ArcPointSchema>;

export const FingerprintSchema = z.object({
  sourceArc: z.array(ArcPointSchema),
  translationArc: z.array(ArcPointSchema),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

export const MarketSchema = z.object({
  id: z.string(),
  name: z.string(),
  lang: z.string(),
  /** Pixel coords for an equirectangular map, viewBox "0 0 1000 500". */
  x: z.number(),
  y: z.number(),
  origin: z.boolean().optional(),
  /** 0..100 — how ready the localized release is for this market. */
  readiness: z.number(),
  fidelity: FidelitySchema,
  /** Streams change over the trailing 30 days, as a percentage. */
  streamsDelta: z.number(),
  momentum: z.enum(["high", "rising", "flat"]),
  risk: z.string().optional(),
  /**
   * Trailing streams trend (oldest → newest) for a sparkline. Present only when
   * real Songstats market data is available (otherwise the market is estimated).
   */
  streamsHistory: z.array(z.number()).optional(),
  /** Absolute streams total from Songstats, when available. */
  absoluteStreams: z.number().optional(),
});
export type Market = z.infer<typeof MarketSchema>;

export const SingabilitySchema = z.object({
  syllableSource: z.number(),
  syllableLocalized: z.number(),
  rhyme: z.boolean(),
  stressMatch: z.number(),
});
export type Singability = z.infer<typeof SingabilitySchema>;

/** How precise the line timing is: word-synced, line-synced, or unsynced. */
export const TimingLevelSchema = z.enum(["word", "line", "none"]);
export type TimingLevel = z.infer<typeof TimingLevelSchema>;

/** Whether the translation is an official one or model-generated. */
export const TranslationSourceSchema = z.enum(["official", "generated"]);
export type TranslationSource = z.infer<typeof TranslationSourceSchema>;

/**
 * Where the source emotional arc came from. `cyanite` means the arc is derived
 * from real audio emotion analysis; `lyric` means it falls back to the
 * LLM/lyric-derived arc (Cyanite unavailable, still processing, or it failed).
 */
export const EmotionSourceSchema = z.enum(["cyanite", "lyric"]);
export type EmotionSource = z.infer<typeof EmotionSourceSchema>;

/** Where per-market numbers came from: real Songstats data, or estimated. */
export const MarketDataSourceSchema = z.enum(["songstats", "estimated"]);
export type MarketDataSource = z.infer<typeof MarketDataSourceSchema>;

/** Compact audio-emotion summary from Cyanite (valence/arousal are 0..1). */
export const CyaniteSummarySchema = z.object({
  moodTags: z.array(z.string()),
  valence: z.number(),
  arousal: z.number(),
  /** Coarse energy descriptor reported by Cyanite (e.g. "high"). */
  energy: z.string(),
});
export type CyaniteSummary = z.infer<typeof CyaniteSummarySchema>;

/**
 * LALAL.AI stem separation result. Both URLs point to the API server's
 * /api/media route so they are served with proper CORS headers for the
 * Web Audio API AnalyserNode.
 */
export const StemsSchema = z.object({
  instrumentalUrl: z.string(),
  vocalUrl: z.string(),
});
export type Stems = z.infer<typeof StemsSchema>;

/** How the reborn vocal was generated. */
export const RebirthSourceSchema = z.enum(["elevenmusic", "tts"]);
export type RebirthSource = z.infer<typeof RebirthSourceSchema>;

export const SongSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  market: z.string(),
  previewUrl: z.string(),
  previewOffsetMs: z.number(),
  durationMs: z.number(),
  /** Audio for the reborn (localized, singable) rendering. */
  rebirthAudioUrl: z.string(),
  rebirthOffsetMs: z.number(),
  /**
   * LALAL.AI stem-separated audio files (derived from the iTunes 30s preview).
   * Present only when LALAL_LICENSE_KEY is set and stem separation succeeded.
   * Both URLs are served by our backend with CORS headers.
   */
  stems: StemsSchema.optional(),
  /**
   * How the reborn vocal was generated. `elevenmusic` = ElevenLabs sung via
   * precompute; `tts` = ElevenLabs multilingual TTS triggered on demand by the
   * user; absent when no rebirth audio has been generated.
   */
  rebirthSource: RebirthSourceSchema.optional(),
  lines: z.array(LineSchema),
  fingerprint: FingerprintSchema,
  overallFidelity: FidelitySchema,
  /** Proof the localized version can actually be sung to the melody. */
  singability: SingabilitySchema,
  /** Per-market global release readiness for the cockpit view. */
  markets: z.array(MarketSchema),
  /** Timing precision of the lyric lines. */
  timingLevel: TimingLevelSchema,
  /** Provenance of the literal translation. */
  translationSource: TranslationSourceSchema,
  /** True when the lyric provider only returned a partial/preview of the lyrics. */
  lyricsRestricted: z.boolean().optional(),
  /** Lyric copyright / attribution string from the provider, when available. */
  copyright: z.string().optional(),
  /**
   * Provenance of the source emotional arc. Defaults to `lyric`; an async
   * Cyanite enrichment swaps the arc and flips this to `cyanite`.
   */
  emotionSource: EmotionSourceSchema.default("lyric"),
  /** Audio-emotion summary from Cyanite, present once enrichment succeeds. */
  cyaniteSummary: CyaniteSummarySchema.optional(),
  /** Provenance of the per-market numbers. */
  marketDataSource: MarketDataSourceSchema.default("estimated"),
  /** Data partners that contributed to this analysis (e.g. ["MUSIXMATCH"]). */
  partnersUsed: z.array(z.string()).default([]),
});
export type Song = z.infer<typeof SongSchema>;

/** Target languages offered in the ANALYZE menu (ISO 639-1 codes). */
export const SUPPORTED_TARGET_LANGS = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
] as const;
export type TargetLang = (typeof SUPPORTED_TARGET_LANGS)[number];

export const TargetLangSchema = z.enum(SUPPORTED_TARGET_LANGS);

/** Request body for POST /api/analyze. Either `query` or `title` is required. */
export const AnalyzeInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    artist: z.string().trim().min(1).max(200).optional(),
    targetLang: TargetLangSchema,
  })
  .refine((d) => Boolean(d.query) || Boolean(d.title), {
    message: "Provide a song title (artist optional) or a search query.",
    path: ["title"],
  });
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

/**
 * A compact summary of a user's saved analysis, used to render the SAVED list.
 * The full `Song` is fetched separately when an entry is reopened.
 */
export const SavedAnalysisSummarySchema = z.object({
  id: z.string(),
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  sourceLang: z.string(),
  targetLang: z.string(),
  /** ISO-8601 timestamp of when the analysis was saved. */
  savedAt: z.string(),
});
export type SavedAnalysisSummary = z.infer<typeof SavedAnalysisSummarySchema>;

/**
 * Response of POST /api/enrich/cyanite. When `emotionSource` is `cyanite` the
 * client swaps `sourceArc` into the song's fingerprint and stores
 * `cyaniteSummary`; when it is `lyric` the enrichment was unavailable/failed and
 * the client keeps the existing lyric-derived arc (silent fallback).
 */
export const CyaniteEnrichResultSchema = z.object({
  emotionSource: EmotionSourceSchema,
  sourceArc: z.array(ArcPointSchema).optional(),
  cyaniteSummary: CyaniteSummarySchema.optional(),
});
export type CyaniteEnrichResult = z.infer<typeof CyaniteEnrichResultSchema>;

/** Request body for POST /api/enrich/cyanite. */
export const CyaniteEnrichInputSchema = z.object({
  trackId: z.string().min(1).max(120),
  previewUrl: z.string().url(),
  targetLang: TargetLangSchema.optional(),
});
export type CyaniteEnrichInput = z.infer<typeof CyaniteEnrichInputSchema>;

/**
 * Request body for POST /api/rebirth/generate.
 * The client sends the localized lines for a live song; the server runs
 * ElevenLabs TTS and returns a servable audio URL. Credit-gated: only
 * triggered by an explicit user action ("GENERATE REBIRTH").
 */
export const RebirthGenerateInputSchema = z.object({
  /** Localized (reborn) lyric lines, joined server-side for TTS. */
  lyrics: z.array(z.string()).min(1).max(120),
  targetLang: TargetLangSchema,
  /** Stable key used to name the generated audio file (e.g. song id). */
  songId: z.string().min(1).max(200),
});
export type RebirthGenerateInput = z.infer<typeof RebirthGenerateInputSchema>;

/** Response of POST /api/rebirth/generate. */
export const RebirthGenerateResultSchema = z.object({
  rebirthAudioUrl: z.string(),
  rebirthSource: RebirthSourceSchema,
});
export type RebirthGenerateResult = z.infer<typeof RebirthGenerateResultSchema>;

/** Machine-readable failure kinds surfaced by the analyze pipeline. */
export const ANALYZE_ERROR_KINDS = [
  "validation",
  "auth",
  "not_found",
  "restricted",
  "analysis",
  "rate_limit",
  "timeout",
  "internal",
] as const;
export type AnalyzeErrorKind = (typeof ANALYZE_ERROR_KINDS)[number];

export interface AnalyzeErrorBody {
  error: AnalyzeErrorKind;
  message: string;
}
