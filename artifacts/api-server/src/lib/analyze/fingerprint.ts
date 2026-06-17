import type { ArcPoint, Emotion, Market } from "@workspace/shared-types";
import type { LlmAnalysis } from "./llm";

/** Representative equirectangular (viewBox "0 0 1000 500") coords by language. */
const LANG_COORDS: Record<string, { x: number; y: number }> = {
  en: { x: 250, y: 150 }, // North America
  es: { x: 240, y: 240 }, // Latin America
  pt: { x: 360, y: 280 }, // Brazil
  fr: { x: 506, y: 120 },
  de: { x: 529, y: 110 },
  it: { x: 535, y: 134 },
  ja: { x: 883, y: 150 },
  ko: { x: 855, y: 150 },
  zh: { x: 820, y: 165 },
  hi: { x: 730, y: 185 },
  ar: { x: 580, y: 175 },
  ru: { x: 650, y: 95 },
};

function coordsFor(lang: string, index: number): { x: number; y: number } {
  const base = LANG_COORDS[lang.toLowerCase()] ?? { x: 500, y: 250 };
  // Deterministic jitter so markets sharing a language don't fully overlap.
  const angle = index * 1.3;
  return {
    x: Math.round(base.x + Math.cos(angle) * 18),
    y: Math.round(base.y + Math.sin(angle) * 14),
  };
}

function streamsDeltaFrom(
  readiness: number,
  momentum: "high" | "rising" | "flat",
): number {
  const bias = momentum === "high" ? 14 : momentum === "rising" ? 6 : -2;
  const raw = (readiness - 55) / 2 + bias;
  return Math.round(Math.max(-40, Math.min(60, raw)));
}

const f01 = (n: number) => Math.round(n) / 100;

/** Map LLM markets to the Market[] contract (fidelity 0..1, readiness 0..100). */
export function buildMarkets(analysis: LlmAnalysis): Market[] {
  return analysis.markets.map((m, i) => {
    const { x, y } = coordsFor(m.lang, i);
    return {
      id: `mkt-${i}-${m.lang.toLowerCase()}`,
      name: m.name,
      lang: m.lang.toLowerCase(),
      x,
      y,
      origin: m.lang.toLowerCase() === analysis.sourceLang.toLowerCase(),
      readiness: Math.round(m.readiness),
      fidelity: {
        meaning: f01(m.fidelity.meaning),
        emotion: f01(m.fidelity.emotion),
        culture: f01(m.fidelity.culture),
        singability: f01(m.fidelity.singability),
      },
      streamsDelta: streamsDeltaFrom(m.readiness, m.momentum),
      momentum: m.momentum,
      ...(m.risk ? { risk: m.risk } : {}),
    };
  });
}

/** Build the source/translation emotional arcs from per-line valence/intensity. */
export function buildFingerprint(
  analysis: LlmAnalysis,
  times: number[], // normalized 0..1 per line
): { sourceArc: ArcPoint[]; translationArc: ArcPoint[] } {
  const sourceArc: ArcPoint[] = [];
  const translationArc: ArcPoint[] = [];

  analysis.lines.forEach((line, i) => {
    const t = times[i] ?? (analysis.lines.length > 1 ? i / (analysis.lines.length - 1) : 0);
    const emotion = line.emotion as Emotion;
    sourceArc.push({
      t,
      valence: f01(line.sourceValence),
      intensity: f01(line.sourceIntensity),
      emotion,
    });
    translationArc.push({
      t,
      valence: f01(line.transValence),
      intensity: f01(line.transIntensity),
      emotion,
    });
  });

  return { sourceArc, translationArc };
}
