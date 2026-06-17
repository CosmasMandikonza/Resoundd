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
