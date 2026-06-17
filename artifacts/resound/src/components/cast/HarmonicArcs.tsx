import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { curveCatmullRom, line as d3Line } from "d3-shape";
import type { ArcPoint, Line } from "@/types";
import { clamp01, lerpColor } from "@/lib/colors";

const VB_W = 1000;
const VB_H = 320;
const PAD_Y = 28;

// Smooth spline through the arc points (Catmull-Rom), replacing straight `L`
// segments so the valence curves read as continuous lines.
const splineGen = d3Line<ArcPoint>()
  .x((p) => pointXY(p)[0])
  .y((p) => pointXY(p)[1])
  .curve(curveCatmullRom.alpha(0.5));

interface Props {
  sourceArc: ArcPoint[];
  translationArc: ArcPoint[];
  lines: Line[];
  durationSec: number;
  playheadFrac: number;
  currentLine: Line | null;
  accent: string;
  drained: string;
}

function pointXY(p: ArcPoint): [number, number] {
  const x = clamp01(p.t) * VB_W;
  const y = PAD_Y + (1 - clamp01(p.valence)) * (VB_H - PAD_Y * 2);
  return [x, y];
}

function arcPath(arc: ArcPoint[]): string {
  if (!arc.length) return "";
  return splineGen(arc) ?? "";
}

function divergePath(source: ArcPoint[], translation: ArcPoint[]): string {
  if (!source.length || !translation.length) return "";
  const top = source.map((p) => {
    const [x, y] = pointXY(p);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const bottom = [...translation].reverse().map((p) => {
    const [x, y] = pointXY(p);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
}

/** Drain amount (0..1) at a normalized position, from the line meaning scores. */
function drainAt(lines: Line[], t: number): number {
  if (!lines.length) return 0;
  const idx = Math.min(
    lines.length - 1,
    Math.max(0, Math.floor(clamp01(t) * lines.length)),
  );
  return 1 - clamp01(lines[idx].fidelity?.meaning ?? 0);
}

export function HarmonicArcs({
  sourceArc,
  translationArc,
  lines,
  durationSec,
  playheadFrac,
  currentLine,
  accent,
  drained,
}: Props) {
  const [sliderFrac, setSliderFrac] = useState(1);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const sourceD = useMemo(() => arcPath(sourceArc), [sourceArc]);
  const transD = useMemo(() => arcPath(translationArc), [translationArc]);
  const divergeD = useMemo(
    () => divergePath(sourceArc, translationArc),
    [sourceArc, translationArc],
  );

  const gradStops = useMemo(
    () =>
      translationArc.map((p, i) => ({
        key: i,
        offset: clamp01(p.t),
        color: lerpColor(accent, drained, drainAt(lines, p.t)),
      })),
    [translationArc, accent, drained, lines],
  );

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSliderFrac(clamp01((clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSliderFrac((s) => clamp01(s - 0.02));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSliderFrac((s) => clamp01(s + 0.02));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSliderFrac(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSliderFrac(1);
    }
  };

  const drawStyle = {
    strokeDasharray: 1,
    strokeDashoffset: mounted ? 0 : 1,
    transition: "stroke-dashoffset 900ms var(--ease)",
  } as const;

  return (
    <div className="flex h-full w-full flex-col">
      <div
        ref={containerRef}
        className="relative w-full flex-1"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="resound-trans-grad"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={VB_W}
              y2="0"
            >
              {gradStops.map((s) => (
                <stop key={s.key} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
            <clipPath id="resound-reveal-clip">
              <rect
                x="0"
                y="0"
                width={(sliderFrac * VB_W).toFixed(2)}
                height={VB_H}
              />
            </clipPath>
          </defs>

          {/* Divergence shading (only within the revealed region). */}
          <path
            d={divergeD}
            fill={accent}
            opacity={0.08}
            clipPath="url(#resound-reveal-clip)"
          />

          {/* Source arc — always visible. */}
          <path
            d={sourceD}
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            style={drawStyle}
          />

          {/* Translation arc — wiped in by the slider, color drained by fidelity. */}
          <g clipPath="url(#resound-reveal-clip)">
            <path
              d={transD}
              fill="none"
              stroke="url(#resound-trans-grad)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              style={drawStyle}
            />
          </g>
        </svg>

        {/* Tick marks at each line's tStart (crisp HTML overlay). */}
        {lines.map((l, i) => {
          const frac = durationSec > 0 ? clamp01(l.tStart / durationSec) : 0;
          return (
            <div
              key={l.id}
              className="pointer-events-none absolute bottom-0 top-0"
              style={{ left: `${frac * 100}%` }}
            >
              <div
                className="absolute bottom-0 h-2 w-px"
                style={{ backgroundColor: "var(--line-bright)" }}
              />
              <div className="absolute bottom-3 -translate-x-1/2 font-mono text-[9px] text-text-faint">
                {String(i + 1).padStart(2, "0")}
              </div>
            </div>
          );
        })}

        {/* Playhead. */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{
            left: `${clamp01(playheadFrac) * 100}%`,
            backgroundColor: "var(--line-bright)",
          }}
        />

        {/* Border slider (pointer + keyboard). */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Source / translation border"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sliderFrac * 100)}
          onKeyDown={onKeyDown}
          className="absolute bottom-0 top-0 z-10 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${sliderFrac * 100}%`, width: 18 }}
        >
          <div
            className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2"
            style={{ backgroundColor: "var(--line-bright)" }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
            style={{
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--line-bright)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>

      {/* Current line. */}
      <div className="mt-4 min-h-[76px] px-1">
        {currentLine ? (
          <>
            <p className="font-serif text-xl leading-snug text-text">
              {currentLine.source}
            </p>
            <p className="mt-1 text-sm text-text-dim">
              {currentLine.translation}
            </p>
            {currentLine.lost && (
              <p
                className="mt-2 font-mono text-[11px] leading-relaxed"
                style={{ color: accent }}
              >
                <span className="mr-1 uppercase tracking-[0.16em]">LOST:</span>
                {currentLine.lost}
              </p>
            )}
          </>
        ) : (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
            No line at playhead.
          </p>
        )}
      </div>
    </div>
  );
}

export default HarmonicArcs;
