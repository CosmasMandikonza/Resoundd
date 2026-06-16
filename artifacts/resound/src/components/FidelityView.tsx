import { useMemo, useState } from "react";
import { useResound, type Metric } from "@/context/useResound";
import showcaseSong from "@/fixtures/showcase";
import type { Emotion, Line } from "@/types";

/** Map each emotion to its CSS custom property (source of truth: tokens.css). */
const EMOTION_VAR: Record<Emotion, string> = {
  joy: "--joy",
  heat: "--heat",
  love: "--love",
  calm: "--calm",
  melancholy: "--melancholy",
};

/** Fallbacks used only before the DOM is available; tokens.css remains authoritative. */
const EMOTION_FALLBACK: Record<Emotion, string> = {
  joy: "#e8a33d",
  heat: "#f2683c",
  love: "#d96ba6",
  calm: "#7fb6a1",
  melancholy: "#5e9fcb",
};
const DRAINED_FALLBACK = "#4a4742";

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

type Palette = { emotion: Record<Emotion, string>; drained: string };

const METRICS: Metric[] = ["meaning", "emotion", "culture", "singability"];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const k = clamp01(t);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Safely read a fidelity sub-score (0..1), defaulting to 0. */
function fidelityScore(line: Line, metric: Metric): number {
  return clamp01(line.fidelity?.[metric] ?? 0);
}

/** Score (0..1) -> 0-100 integer. */
function toHundred(score: number): number {
  return Math.round(clamp01(score) * 100);
}

function HeaderReadout({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
          {label}
        </span>
        <span className="font-mono text-xs text-text">{toHundred(score)}</span>
      </div>
      <div className="h-px w-full bg-line">
        <div
          className="h-px"
          style={{
            width: `${toHundred(score)}%`,
            backgroundColor: "var(--joy)",
          }}
        />
      </div>
    </div>
  );
}

function SubScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
          {label}
        </span>
        <span className="font-mono text-[10px] text-text-dim">
          {toHundred(score)}
        </span>
      </div>
      <div className="h-px w-full bg-line">
        <div
          className="h-px bg-text-dim"
          style={{ width: `${toHundred(score)}%` }}
        />
      </div>
    </div>
  );
}

function LossMapRow({
  line,
  metric,
  palette,
  expanded,
  onToggle,
}: {
  line: Line;
  metric: Metric;
  palette: Palette;
  expanded: boolean;
  onToggle: () => void;
}) {
  const score = fidelityScore(line, metric);
  // Saturation bar drains toward grey as the active metric's score drops.
  const barColor = lerpColor(
    palette.emotion[line.emotion],
    palette.drained,
    1 - score,
  );

  const drift = (1 - fidelityScore(line, "meaning")).toFixed(2);
  const arcDeviation = (1 - fidelityScore(line, "emotion")).toFixed(2);

  return (
    <div className="border-b border-line">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="group flex cursor-pointer items-stretch gap-4 py-4 transition-colors duration-[280ms] hover:bg-surface-2/40"
        style={{ transitionTimingFunction: "var(--ease)" }}
      >
        {/* Saturation bar */}
        <div
          className="w-1 shrink-0 self-stretch transition-colors duration-[320ms]"
          style={{
            backgroundColor: barColor,
            transitionTimingFunction: "var(--ease)",
          }}
          aria-hidden
        />

        {/* Source + translation */}
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg leading-snug text-text">
            {line.source}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-text-dim">
            {line.translation}
          </p>
        </div>

        {/* Metric number + risk dot */}
        <div className="flex shrink-0 items-center gap-3 self-start pt-1">
          <span className="font-mono text-xs text-text-dim">
            {toHundred(score)}
          </span>
          {line.risk ? (
            <span
              className="h-2 w-2"
              style={{ backgroundColor: "var(--risk)" }}
              aria-label="cross-cultural risk"
            />
          ) : (
            <span className="h-2 w-2" aria-hidden />
          )}
        </div>
      </div>

      {/* Expanding "What's Lost" panel */}
      <div
        className="grid"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 320ms var(--ease)",
        }}
      >
        <div className="overflow-hidden">
          <div
            className="mb-4 ml-5 border border-line bg-surface p-5"
            style={{ borderRadius: 2 }}
          >
            {/* Sub-scores */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              {METRICS.map((m) => (
                <SubScoreBar
                  key={m}
                  label={m}
                  score={fidelityScore(line, m)}
                />
              ))}
            </div>

            {/* Lost note */}
            {line.lost && (
              <p className="mt-5 text-sm leading-relaxed text-text">
                <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
                  LOST:
                </span>
                {line.lost}
              </p>
            )}

            {/* Evidence */}
            <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
                EVIDENCE
              </span>
              <div className="flex flex-col gap-1 font-mono text-xs text-text-dim">
                <span>BACK-TRANSLATION DRIFT: {drift}</span>
                <span>ARC DEVIATION: {arcDeviation}</span>
              </div>
            </div>

            {/* Cross-cultural risk */}
            {line.risk && (
              <div className="mt-5 border-t border-line pt-4">
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--risk)" }}
                >
                  CROSS-CULTURAL RISK
                </span>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: "var(--text)" }}
                >
                  {line.risk}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FidelityView() {
  const { activeMetric } = useResound();
  const song = showcaseSong;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Resolve accent/drained colors from the CSS tokens (tokens.css is authoritative).
  const palette = useMemo<Palette>(
    () => ({
      emotion: {
        joy: readCssVar(EMOTION_VAR.joy, EMOTION_FALLBACK.joy),
        heat: readCssVar(EMOTION_VAR.heat, EMOTION_FALLBACK.heat),
        love: readCssVar(EMOTION_VAR.love, EMOTION_FALLBACK.love),
        calm: readCssVar(EMOTION_VAR.calm, EMOTION_FALLBACK.calm),
        melancholy: readCssVar(
          EMOTION_VAR.melancholy,
          EMOTION_FALLBACK.melancholy,
        ),
      },
      drained: readCssVar("--drained", DRAINED_FALLBACK),
    }),
    [],
  );

  const lines = song.lines ?? [];
  const overall = song.overallFidelity ?? {
    meaning: 0,
    emotion: 0,
    culture: 0,
    singability: 0,
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 pb-28 pt-20">
      {/* Header strip */}
      <div className="flex flex-col gap-6 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl leading-none text-text">
            {song.title}
          </h1>
          <p className="mt-2 text-sm text-text-dim">
            {song.artist}
            <span className="mx-2 text-text-faint">·</span>
            ES → EN
          </p>
        </div>

        <div className="grid w-full max-w-md grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <HeaderReadout label="meaning" score={overall.meaning} />
          <HeaderReadout label="emotion" score={overall.emotion} />
          <HeaderReadout label="culture" score={overall.culture} />
          <HeaderReadout label="singability" score={overall.singability} />
        </div>
      </div>

      {/* The Loss Map */}
      <div className="mt-2 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
            No lines to map.
          </p>
        ) : (
          lines.map((line) => (
            <LossMapRow
              key={line.id}
              line={line}
              metric={activeMetric}
              palette={palette}
              expanded={expandedId === line.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === line.id ? null : line.id))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

export default FidelityView;
