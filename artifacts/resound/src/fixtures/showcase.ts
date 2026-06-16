import type { ArcPoint, Emotion, Line, Song } from "@/types";

/**
 * One realistic Spanish -> English crossover track (Bad Bunny-style).
 * ~12 authored lines with plausible source + flat English translation,
 * an emotion per line, fidelity sub-scores (some high, some clearly drained),
 * two lines flagged with `lost` and one with `risk`.
 */
const lines: Line[] = [
  {
    id: "l01",
    tStart: 0,
    tEnd: 6.4,
    source: "Bajo el neón te vi bailar, mami, sin mirar atrás",
    translation: "Under the neon I saw you dance, baby, no looking back",
    emotion: "heat",
    fidelity: { meaning: 0.82, emotion: 0.78, culture: 0.71, singability: 0.74 },
  },
  {
    id: "l02",
    tStart: 6.4,
    tEnd: 12.1,
    source: "Tu perreo me tiene loco, no me sueltes ya",
    translation: "Your dancing has me crazy, don't let me go now",
    emotion: "heat",
    fidelity: { meaning: 0.55, emotion: 0.62, culture: 0.34, singability: 0.58 },
    lost: "\"Perreo\" carries a whole reggaetón dance subculture that \"dancing\" erases entirely.",
  },
  {
    id: "l03",
    tStart: 12.1,
    tEnd: 18.0,
    source: "En la disco se prende la noche, suena el bajo",
    translation: "At the club the night lights up, the bass plays",
    emotion: "joy",
    fidelity: { meaning: 0.88, emotion: 0.8, culture: 0.76, singability: 0.69 },
  },
  {
    id: "l04",
    tStart: 18.0,
    tEnd: 24.3,
    source: "Tú eres mi gata fina, de la vieja escuela",
    translation: "You are my fine cat, of the old school",
    emotion: "love",
    fidelity: { meaning: 0.41, emotion: 0.66, culture: 0.22, singability: 0.6 },
    lost: "\"Gata fina\" is affectionate Caribbean slang; the literal \"fine cat\" reads as nonsense in English.",
    risk: "Literal \"my cat\" can land as belittling or objectifying outside the source culture.",
  },
  {
    id: "l05",
    tStart: 24.3,
    tEnd: 30.5,
    source: "Te escribo a las tres, ya no aguanto la espera",
    translation: "I text you at three, I can't stand the wait",
    emotion: "love",
    fidelity: { meaning: 0.85, emotion: 0.83, culture: 0.7, singability: 0.72 },
  },
  {
    id: "l06",
    tStart: 30.5,
    tEnd: 36.8,
    source: "Recuerdo el caserío, las escaleras, mi gente",
    translation: "I remember the projects, the stairs, my people",
    emotion: "melancholy",
    fidelity: { meaning: 0.78, emotion: 0.74, culture: 0.52, singability: 0.55 },
  },
  {
    id: "l07",
    tStart: 36.8,
    tEnd: 43.0,
    source: "Lloré en silencio pa' que nadie me viera",
    translation: "I cried in silence so no one would see me",
    emotion: "melancholy",
    fidelity: { meaning: 0.9, emotion: 0.86, culture: 0.79, singability: 0.7 },
  },
  {
    id: "l08",
    tStart: 43.0,
    tEnd: 49.4,
    source: "Pero hoy me levanto, corona en la frente",
    translation: "But today I rise, crown on my forehead",
    emotion: "joy",
    fidelity: { meaning: 0.87, emotion: 0.84, culture: 0.66, singability: 0.68 },
  },
  {
    id: "l09",
    tStart: 49.4,
    tEnd: 55.9,
    source: "Que hablen lo que quieran, yo sigo de frente",
    translation: "Let them say what they want, I keep going forward",
    emotion: "heat",
    fidelity: { meaning: 0.83, emotion: 0.8, culture: 0.64, singability: 0.71 },
  },
  {
    id: "l10",
    tStart: 55.9,
    tEnd: 62.2,
    source: "Tranquilo, suave, dejo que fluya la marea",
    translation: "Calm, smooth, I let the tide flow",
    emotion: "calm",
    fidelity: { meaning: 0.79, emotion: 0.77, culture: 0.6, singability: 0.66 },
  },
  {
    id: "l11",
    tStart: 62.2,
    tEnd: 68.6,
    source: "Respira conmigo, que el mundo se quede afuera",
    translation: "Breathe with me, let the world stay outside",
    emotion: "calm",
    fidelity: { meaning: 0.86, emotion: 0.82, culture: 0.74, singability: 0.73 },
  },
  {
    id: "l12",
    tStart: 68.6,
    tEnd: 75.0,
    source: "Y si te vas, que sea bailando, sin pena",
    translation: "And if you leave, let it be dancing, without sorrow",
    emotion: "love",
    fidelity: { meaning: 0.8, emotion: 0.81, culture: 0.68, singability: 0.7 },
  },
];

const TOTAL_POINTS = 40;

const emotionForT = (t: number): Emotion => {
  const idx = Math.min(
    lines.length - 1,
    Math.floor(t * lines.length),
  );
  return lines[idx].emotion;
};

/** Average fidelity (meaning+emotion) at a normalized position 0..1. */
const fidelityForT = (t: number): number => {
  const idx = Math.min(lines.length - 1, Math.floor(t * lines.length));
  const f = lines[idx].fidelity;
  return (f.meaning + f.emotion + f.culture + f.singability) / 4;
};

/** Expressive source arc: a song that rises, dips into melancholy, then lifts. */
const buildSourceArc = (): ArcPoint[] => {
  const pts: ArcPoint[] = [];
  for (let i = 0; i < TOTAL_POINTS; i++) {
    const t = i / (TOTAL_POINTS - 1);
    // Valence sweeps low->high with a melancholic dip around the bridge.
    const valence =
      0.5 +
      0.32 * Math.sin(t * Math.PI * 1.5 - 0.4) -
      0.18 * Math.exp(-Math.pow((t - 0.52) / 0.09, 2));
    // Intensity builds across the track with rhythmic swells.
    const intensity =
      0.4 + 0.4 * t + 0.16 * Math.sin(t * Math.PI * 6);
    pts.push({
      t,
      valence: clamp(valence),
      intensity: clamp(intensity),
      emotion: emotionForT(t),
    });
  }
  return pts;
};

/**
 * Translation arc: tracks the source, but visibly FLATTENS toward the
 * neutral midline wherever line fidelity is low (meaning is being lost).
 */
const buildTranslationArc = (source: ArcPoint[]): ArcPoint[] =>
  source.map((p) => {
    const fid = fidelityForT(p.t);
    // Low fidelity => pull valence & intensity toward 0.5 (drained, flat).
    const flatten = 1 - fid; // 0 = faithful, 1 = fully drained
    const valence = lerp(p.valence, 0.5, flatten * 0.85);
    const intensity = lerp(p.intensity, 0.5, flatten * 0.85);
    return {
      t: p.t,
      valence: clamp(valence),
      intensity: clamp(intensity),
      emotion: p.emotion,
    };
  });

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const sourceArc = buildSourceArc();
const translationArc = buildTranslationArc(sourceArc);

const avg = (key: keyof Line["fidelity"]): number =>
  Math.round(
    (lines.reduce((sum, l) => sum + l.fidelity[key], 0) / lines.length) * 100,
  ) / 100;

export const showcaseSong: Song = {
  id: "song-neon-tide",
  title: "Neón y Marea",
  artist: "El Bajo",
  sourceLang: "es",
  targetLang: "en",
  market: "US Latin Crossover",
  previewUrl: "/audio/placeholder-preview.mp3",
  previewOffsetMs: 30000,
  durationMs: 75000,
  lines,
  fingerprint: { sourceArc, translationArc },
  overallFidelity: {
    meaning: avg("meaning"),
    emotion: avg("emotion"),
    culture: avg("culture"),
    singability: avg("singability"),
  },
};

export default showcaseSong;
