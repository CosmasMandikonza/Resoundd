export type Emotion = "joy" | "heat" | "love" | "calm" | "melancholy";

export interface Line {
  id: string;
  tStart: number;
  tEnd: number;
  source: string;
  translation: string;
  emotion: Emotion;
  fidelity: {
    meaning: number;
    emotion: number;
    culture: number;
    singability: number;
  };
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
  lines: Line[];
  fingerprint: Fingerprint;
  overallFidelity: {
    meaning: number;
    emotion: number;
    culture: number;
    singability: number;
  };
}
