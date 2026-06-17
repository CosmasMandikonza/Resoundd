export type Emotion = "joy" | "heat" | "love" | "calm" | "melancholy";

export interface Fidelity {
  meaning: number;
  emotion: number;
  culture: number;
  singability: number;
}

export interface Line {
  id: string;
  tStart: number;
  tEnd: number;
  source: string;
  translation: string;
  /** Resound's faithful, singable English rendering (the "reborn" line). */
  localized: string;
  emotion: Emotion;
  fidelity: Fidelity;
  /** The lifted scores for the localized rendering. */
  rebornFidelity: Fidelity;
  lost?: string;
  risk?: string;
}

export interface ArcPoint {
  t: number;
  valence: number;
  intensity: number;
  emotion: Emotion;
} // 0..1

export interface Fingerprint {
  sourceArc: ArcPoint[];
  translationArc: ArcPoint[];
}

export interface Market {
  id: string;
  name: string;
  lang: string;
  /** Pixel coords for an equirectangular map, viewBox "0 0 1000 500". */
  x: number;
  y: number;
  origin?: boolean;
  /** 0..100 — how ready the localized release is for this market. */
  readiness: number;
  fidelity: Fidelity;
  /** Streams change over the trailing 30 days, as a percentage. */
  streamsDelta: number;
  momentum: "high" | "rising" | "flat";
  risk?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  sourceLang: string;
  targetLang: string;
  market: string;
  previewUrl: string;
  previewOffsetMs: number;
  durationMs: number;
  /** Audio for the reborn (localized, singable) rendering. */
  rebirthAudioUrl: string;
  rebirthOffsetMs: number;
  lines: Line[];
  fingerprint: Fingerprint;
  overallFidelity: Fidelity;
  /** Proof the localized version can actually be sung to the melody. */
  singability: {
    syllableSource: number;
    syllableLocalized: number;
    rhyme: boolean;
    stressMatch: number;
  };
  /** Per-market global release readiness for the cockpit view. */
  markets: Market[];
}
