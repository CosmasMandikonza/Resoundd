import type { ArcPoint, Emotion, Line, Market, Song } from "@/types";

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
    localized: "Neon on your skin, you danced and never looked back",
    emotion: "heat",
    fidelity: { meaning: 0.82, emotion: 0.78, culture: 0.71, singability: 0.74 },
    rebornFidelity: {
      meaning: 0.93,
      emotion: 0.91,
      culture: 0.84,
      singability: 0.9,
    },
  },
  {
    id: "l02",
    tStart: 6.4,
    tEnd: 12.1,
    source: "Tu perreo me tiene loco, no me sueltes ya",
    translation: "Your dancing has me crazy, don't let me go now",
    localized: "The way you wind on me drives me wild — don't let go",
    emotion: "heat",
    fidelity: { meaning: 0.55, emotion: 0.62, culture: 0.34, singability: 0.58 },
    rebornFidelity: {
      meaning: 0.88,
      emotion: 0.89,
      culture: 0.8,
      singability: 0.85,
    },
    lost: "\"Perreo\" carries a whole reggaetón dance subculture that \"dancing\" erases entirely.",
  },
  {
    id: "l03",
    tStart: 12.1,
    tEnd: 18.0,
    source: "En la disco se prende la noche, suena el bajo",
    translation: "At the club the night lights up, the bass plays",
    localized: "The club ignites the night, the bassline takes control",
    emotion: "joy",
    fidelity: { meaning: 0.88, emotion: 0.8, culture: 0.76, singability: 0.69 },
    rebornFidelity: {
      meaning: 0.94,
      emotion: 0.92,
      culture: 0.85,
      singability: 0.88,
    },
  },
  {
    id: "l04",
    tStart: 18.0,
    tEnd: 24.3,
    source: "Tú eres mi gata fina, de la vieja escuela",
    translation: "You are my fine cat, of the old school",
    localized: "You're my classy thing, straight out of the old school",
    emotion: "love",
    fidelity: { meaning: 0.41, emotion: 0.66, culture: 0.22, singability: 0.6 },
    rebornFidelity: {
      meaning: 0.86,
      emotion: 0.88,
      culture: 0.79,
      singability: 0.84,
    },
    lost: "\"Gata fina\" is affectionate Caribbean slang; the literal \"fine cat\" reads as nonsense in English.",
    risk: "Literal \"my cat\" can land as belittling or objectifying outside the source culture.",
  },
  {
    id: "l05",
    tStart: 24.3,
    tEnd: 30.5,
    source: "Te escribo a las tres, ya no aguanto la espera",
    translation: "I text you at three, I can't stand the wait",
    localized: "I text at three a.m., I can't take the waiting",
    emotion: "love",
    fidelity: { meaning: 0.85, emotion: 0.83, culture: 0.7, singability: 0.72 },
    rebornFidelity: {
      meaning: 0.93,
      emotion: 0.91,
      culture: 0.82,
      singability: 0.89,
    },
  },
  {
    id: "l06",
    tStart: 30.5,
    tEnd: 36.8,
    source: "Recuerdo el caserío, las escaleras, mi gente",
    translation: "I remember the projects, the stairs, my people",
    localized: "I still see the block, those stairwells, my people",
    emotion: "melancholy",
    fidelity: { meaning: 0.78, emotion: 0.74, culture: 0.52, singability: 0.55 },
    rebornFidelity: {
      meaning: 0.9,
      emotion: 0.89,
      culture: 0.83,
      singability: 0.86,
    },
  },
  {
    id: "l07",
    tStart: 36.8,
    tEnd: 43.0,
    source: "Lloré en silencio pa' que nadie me viera",
    translation: "I cried in silence so no one would see me",
    localized: "I cried in the quiet where nobody could see",
    emotion: "melancholy",
    fidelity: { meaning: 0.9, emotion: 0.86, culture: 0.79, singability: 0.7 },
    rebornFidelity: {
      meaning: 0.95,
      emotion: 0.94,
      culture: 0.86,
      singability: 0.9,
    },
  },
  {
    id: "l08",
    tStart: 43.0,
    tEnd: 49.4,
    source: "Pero hoy me levanto, corona en la frente",
    translation: "But today I rise, crown on my forehead",
    localized: "But today I rise up, a crown on my brow",
    emotion: "joy",
    fidelity: { meaning: 0.87, emotion: 0.84, culture: 0.66, singability: 0.68 },
    rebornFidelity: {
      meaning: 0.94,
      emotion: 0.93,
      culture: 0.84,
      singability: 0.89,
    },
  },
  {
    id: "l09",
    tStart: 49.4,
    tEnd: 55.9,
    source: "Que hablen lo que quieran, yo sigo de frente",
    translation: "Let them say what they want, I keep going forward",
    localized: "Let them talk all they want, I keep pushing ahead",
    emotion: "heat",
    fidelity: { meaning: 0.83, emotion: 0.8, culture: 0.64, singability: 0.71 },
    rebornFidelity: {
      meaning: 0.92,
      emotion: 0.9,
      culture: 0.82,
      singability: 0.88,
    },
  },
  {
    id: "l10",
    tStart: 55.9,
    tEnd: 62.2,
    source: "Tranquilo, suave, dejo que fluya la marea",
    translation: "Calm, smooth, I let the tide flow",
    localized: "Easy now, gentle, I let the tide roll in",
    emotion: "calm",
    fidelity: { meaning: 0.79, emotion: 0.77, culture: 0.6, singability: 0.66 },
    rebornFidelity: {
      meaning: 0.91,
      emotion: 0.9,
      culture: 0.81,
      singability: 0.87,
    },
  },
  {
    id: "l11",
    tStart: 62.2,
    tEnd: 68.6,
    source: "Respira conmigo, que el mundo se quede afuera",
    translation: "Breathe with me, let the world stay outside",
    localized: "Breathe here with me, let the world wait outside",
    emotion: "calm",
    fidelity: { meaning: 0.86, emotion: 0.82, culture: 0.74, singability: 0.73 },
    rebornFidelity: {
      meaning: 0.94,
      emotion: 0.92,
      culture: 0.85,
      singability: 0.9,
    },
  },
  {
    id: "l12",
    tStart: 68.6,
    tEnd: 75.0,
    source: "Y si te vas, que sea bailando, sin pena",
    translation: "And if you leave, let it be dancing, without sorrow",
    localized: "And if you go, go dancing, with no regret",
    emotion: "love",
    fidelity: { meaning: 0.8, emotion: 0.81, culture: 0.68, singability: 0.7 },
    rebornFidelity: {
      meaning: 0.92,
      emotion: 0.91,
      culture: 0.83,
      singability: 0.88,
    },
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

/**
 * Six release markets plotted on an equirectangular world map
 * (viewBox "0 0 1000 500"). Spain is the origin (source language, fully
 * native); fidelity sub-scores track each market's readiness — the further
 * the culture/language is from the source, the more meaning has drained.
 */
const markets: Market[] = [
  {
    id: "es",
    name: "Spain",
    lang: "es",
    x: 490,
    y: 138,
    origin: true,
    readiness: 100,
    fidelity: { meaning: 1, emotion: 1, culture: 1, singability: 1 },
    streamsDelta: 3,
    momentum: "flat",
  },
  {
    id: "br",
    name: "Brazil",
    lang: "pt",
    x: 371,
    y: 315,
    readiness: 54,
    fidelity: {
      meaning: 0.61,
      emotion: 0.58,
      culture: 0.42,
      singability: 0.5,
    },
    streamsDelta: 34,
    momentum: "high",
    risk: "Reggaetón slang lands differently against Brazilian funk culture — \"perreo\" has no clean Portuguese equivalent and can read as crude.",
  },
  {
    id: "mx",
    name: "Mexico",
    lang: "es",
    x: 225,
    y: 196,
    readiness: 82,
    fidelity: {
      meaning: 0.87,
      emotion: 0.85,
      culture: 0.8,
      singability: 0.82,
    },
    streamsDelta: 18,
    momentum: "rising",
  },
  {
    id: "us",
    name: "United States",
    lang: "en",
    x: 294,
    y: 137,
    readiness: 88,
    fidelity: {
      meaning: 0.9,
      emotion: 0.88,
      culture: 0.82,
      singability: 0.86,
    },
    streamsDelta: 12,
    momentum: "rising",
  },
  {
    id: "de",
    name: "Germany",
    lang: "de",
    x: 537,
    y: 104,
    readiness: 76,
    fidelity: {
      meaning: 0.8,
      emotion: 0.76,
      culture: 0.7,
      singability: 0.72,
    },
    streamsDelta: 4,
    momentum: "flat",
  },
  {
    id: "jp",
    name: "Japan",
    lang: "ja",
    x: 888,
    y: 151,
    readiness: 61,
    fidelity: {
      meaning: 0.66,
      emotion: 0.62,
      culture: 0.5,
      singability: 0.55,
    },
    streamsDelta: 9,
    momentum: "rising",
  },
];

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
  rebirthAudioUrl: "/audio/placeholder-rebirth.mp3",
  rebirthOffsetMs: 0,
  lines,
  fingerprint: { sourceArc, translationArc },
  overallFidelity: {
    meaning: avg("meaning"),
    emotion: avg("emotion"),
    culture: avg("culture"),
    singability: avg("singability"),
  },
  singability: {
    syllableSource: 11,
    syllableLocalized: 11,
    rhyme: true,
    stressMatch: 88,
  },
  markets,
  timingLevel: "line",
  translationSource: "official",
};

export default showcaseSong;
