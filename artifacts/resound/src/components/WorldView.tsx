/**
 * WorldView — Global Release Cockpit
 *
 * MAP lens:    dot-matrix world map (dotted-map canvas), sonar sweep from
 *              origin, animated bezier particle flows (speed/density =
 *              momentum), market nodes (radial ring = readiness,
 *              size = reach, pulse = momentum), reticle on opportunity.
 * MATRIX lens: momentum × readiness scatter, four strategy quadrants.
 * Morph:       600 ms eased flight between lenses; same node identity persists.
 * Rail:        ranked by opportunityScore, search, sort, market detail panel.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import DottedMap from "dotted-map";
import { useResound } from "@/context/useResound";
import type { Market } from "@/types";
import {
  clamp01,
  lerpColor,
  readCssVar,
  resolveDrained,
  resolveEmotionColor,
  withAlpha,
} from "@/lib/colors";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VB_W = 1000;
const VB_H = 500;
const MORPH_DUR = 600; // ms

/** Normalized momentum weight (0-1) used for opportunityScore and matrix X. */
const MOM_W: Record<Market["momentum"], number> = { high: 1, rising: 0.5, flat: 0 };

/** Matrix layout margins (viewBox units). */
const MX = { l: 115, r: 55, t: 52, b: 72 } as const;
const MX_IW = VB_W - MX.l - MX.r;
const MX_IH = VB_H - MX.t - MX.b;

type Lens = "map" | "matrix";
type SortKey = "opportunity" | "momentum" | "readiness" | "reach";

// ─────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** opportunityScore = round(100 × momentumNorm × (1 − readiness/100)) */
function oppScore(m: Market): number {
  return Math.round(100 * MOM_W[m.momentum] * (1 - m.readiness / 100));
}

/** Geographic (map) position — the existing equirectangular coords. */
function mapPos(m: Market): [number, number] {
  return [m.x, m.y];
}

/** Matrix position: X = momentum, Y = readiness (inverted). */
function matrixPos(m: Market): [number, number] {
  return [
    MX.l + MOM_W[m.momentum] * MX_IW,
    VB_H - MX.b - (m.readiness / 100) * MX_IH,
  ];
}

/** Interpolated position for morph (t: 0 = map, 1 = matrix). */
function nodeXY(m: Market, t: number): [number, number] {
  const [mx, my] = mapPos(m);
  const [nx, ny] = matrixPos(m);
  return [lerp(mx, nx, t), lerp(my, ny, t)];
}

/** Inner dot radius scaled by absoluteStreams (reach). */
function innerR(m: Market): number {
  if (!m.absoluteStreams) return 6;
  return Math.max(5, Math.min(15, 6 + (m.absoluteStreams / 20_000_000) * 9));
}

/** Readiness ring radius (outside the inner dot). */
function ringR(m: Market): number {
  return innerR(m) + 7;
}

/** Quadratic bezier point at parameter t. */
function bPt(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
) {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1,
  };
}

/** Arc control point — lifts above the midpoint proportional to distance. */
function arcCtrl(x0: number, y0: number, x1: number, y1: number) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - dist * 0.28 };
}

function fmtN(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────
// DotMatrix canvas (land masses as faint dots)
// ─────────────────────────────────────────────────────────────

function DotMatrix({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;

    const id = setTimeout(() => {
      if (cancelled) return;
      const map = new DottedMap({ height: 60, grid: "diagonal" });
      const pts = map.getPoints();
      if (cancelled || !pts.length) return;

      let maxX = 0,
        maxY = 0;
      for (const p of pts) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      ctx.clearRect(0, 0, VB_W, VB_H);
      ctx.fillStyle = color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(
          (p.x / maxX) * VB_W,
          (p.y / maxY) * VB_H,
          1.35,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }, 30);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [color]);

  return (
    <canvas
      ref={ref}
      width={VB_W}
      height={VB_H}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Sonar sweep (SVG animateTransform, fades in MAP mode)
// ─────────────────────────────────────────────────────────────

function SonarSweep({
  ox,
  oy,
  accent,
  opacity,
}: {
  ox: number;
  oy: number;
  accent: string;
  opacity: number;
}) {
  const R = 960;
  const span = Math.PI / 3;
  const x1 = ox + R;
  const y1 = oy;
  const x2 = ox + R * Math.cos(span);
  const y2 = oy + R * Math.sin(span);
  const gid = `sg${Math.round(ox)}x${Math.round(oy)}`;

  return (
    <g opacity={opacity} style={{ transition: "opacity 450ms var(--ease)" }}>
      <defs>
        <radialGradient
          id={gid}
          cx="0"
          cy="0"
          r={R}
          gradientUnits="userSpaceOnUse"
          gradientTransform={`translate(${ox} ${oy})`}
        >
          <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
          <stop offset="55%" stopColor={accent} stopOpacity={0.07} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      <path
        d={`M${ox},${oy} L${x1},${y1} A${R},${R} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`}
        fill={`url(#${gid})`}
      >
          <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${ox} ${oy}`}
          to={`360 ${ox} ${oy}`}
          dur="10s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Market node (SVG, readiness ring + inner dot + pulse)
// ─────────────────────────────────────────────────────────────

function MarketNode({
  m,
  x,
  y,
  accent,
  drained,
  joy,
  isOpp,
  isActive,
  isHovered,
  reduced,
  onSelect,
  onHover,
}: {
  m: Market;
  x: number;
  y: number;
  accent: string;
  drained: string;
  joy: string;
  isOpp: boolean;
  isActive: boolean;
  isHovered: boolean;
  reduced: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const ir = innerR(m);
  const rr = ringR(m);
  const circ = 2 * Math.PI * rr;
  const readFrac = m.readiness / 100;
  const fillColor = lerpColor(joy, drained, 1 - readFrac);
  const readDash = readFrac * circ;
  const gapDash = circ - readDash;

  // Label goes right if node is in left half; left if in right half
  const lblRight = x < VB_W / 2;

  const highlighted = isActive || isHovered;
  const doPulse = !reduced && (isOpp || m.momentum === "high");

  return (
    <g
      role="button"
      aria-label={`${m.name}, readiness ${m.readiness}%, momentum ${m.momentum}`}
      aria-pressed={isActive}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(m.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      {/* Pulsing outer ring */}
      {doPulse && (
        <circle
          cx={x}
          cy={y}
          r={rr + 8}
          fill="none"
          stroke={accent}
          strokeWidth={0.9}
          style={{
            animation: `wv-pulse ${isOpp ? 1.8 : 2.5}s ease-in-out infinite`,
          }}
        />
      )}

      {/* Reticle crosshairs for the opportunity market */}
      {isOpp &&
        (
          [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ] as [number, number][]
        ).map(([dx, dy], i) => (
          <line
            key={i}
            x1={x + dx * (rr + 8)}
            y1={y + dy * (rr + 8)}
            x2={x + dx * (rr + 16)}
            y2={y + dy * (rr + 16)}
            stroke={accent}
            strokeWidth={1.2}
            opacity={0.92}
            vectorEffect="non-scaling-stroke"
          />
        ))}

      {/* Background ring (drained) */}
      <circle
        cx={x}
        cy={y}
        r={rr}
        fill="none"
        stroke={drained}
        strokeWidth={3}
        opacity={0.32}
      />

      {/* Readiness arc (accent → drained) */}
      <circle
        cx={x}
        cy={y}
        r={rr}
        fill="none"
        stroke={fillColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${readDash.toFixed(2)} ${gapDash.toFixed(2)}`}
        strokeDashoffset={(circ / 4).toFixed(2)}
        style={{ transition: "stroke 500ms var(--ease)" }}
      />

      {/* Inner filled dot */}
      <circle
        cx={x}
        cy={y}
        r={ir}
        fill={fillColor}
        opacity={highlighted ? 1 : 0.72}
        style={{
          transition: "opacity 180ms",
          filter: isOpp
            ? `drop-shadow(0 0 6px ${withAlpha(fillColor, 0.75)})`
            : undefined,
        }}
      />

      {/* Origin ring */}
      {m.origin && (
        <circle
          cx={x}
          cy={y}
          r={ir + 2.5}
          fill="none"
          stroke="var(--text)"
          strokeWidth={0.8}
          opacity={0.45}
        />
      )}

      {/* Label */}
      <text
        x={lblRight ? x + rr + 10 : x - rr - 10}
        y={y + 4}
        style={
          {
            fontFamily: "Space Mono, monospace",
            fontSize: 8.5,
            fill: highlighted ? "var(--text)" : "var(--text-dim)",
            textAnchor: lblRight ? "start" : "end",
            pointerEvents: "none",
            userSelect: "none",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            transition: "fill 150ms",
          } as CSSProperties
        }
      >
        {m.name}
        <tspan
          style={
            { fill: "var(--text-faint)", fontSize: 7.5 } as CSSProperties
          }
        >
          {" "}
          · {m.readiness}%
        </tspan>
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Matrix axes + quadrant labels
// ─────────────────────────────────────────────────────────────

function MatrixAxes({ opacity, accent }: { opacity: number; accent: string }) {
  const mono: CSSProperties = {
    fontFamily: "Space Mono, monospace",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.13em",
    fill: "var(--text-faint)",
    pointerEvents: "none",
    userSelect: "none",
  };
  const midX = MX.l + MX_IW / 2;
  const midY = MX.t + MX_IH / 2;

  return (
    <g opacity={opacity} style={{ transition: "opacity 500ms var(--ease)" }}>
      {/* Axes */}
      <line
        x1={MX.l}
        y1={VB_H - MX.b}
        x2={VB_W - MX.r}
        y2={VB_H - MX.b}
        stroke="var(--line-bright)"
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={MX.l}
        y1={MX.t}
        x2={MX.l}
        y2={VB_H - MX.b}
        stroke="var(--line-bright)"
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />

      {/* X ticks */}
      {(["FLAT", "RISING", "HIGH"] as const).map((label, i) => {
        const x = MX.l + [0, 0.5, 1][i] * MX_IW;
        return (
          <g key={label}>
            <line
              x1={x}
              y1={VB_H - MX.b}
              x2={x}
              y2={VB_H - MX.b + 5}
              stroke="var(--line-bright)"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={VB_H - MX.b + 17}
              style={{ ...mono, fontSize: 8 }}
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}
      <text
        x={MX.l + MX_IW / 2}
        y={VB_H - MX.b + 30}
        style={{ ...mono, fontSize: 7.5 }}
        textAnchor="middle"
      >
        MOMENTUM — SONGSTATS
      </text>

      {/* Y ticks */}
      {[0, 50, 100].map((pct) => {
        const y = VB_H - MX.b - (pct / 100) * MX_IH;
        return (
          <g key={pct}>
            <line
              x1={MX.l - 5}
              y1={y}
              x2={MX.l}
              y2={y}
              stroke="var(--line-bright)"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={MX.l - 9}
              y={y + 3.5}
              style={{ ...mono, fontSize: 8 }}
              textAnchor="end"
            >
              {pct}%
            </text>
          </g>
        );
      })}
      <text
        x={MX.l - 38}
        y={MX.t + MX_IH / 2}
        style={{ ...mono, fontSize: 7.5 }}
        textAnchor="middle"
        transform={`rotate(-90, ${MX.l - 38}, ${MX.t + MX_IH / 2})`}
      >
        READINESS
      </text>

      {/* Quadrant dividers */}
      <line
        x1={midX}
        y1={MX.t}
        x2={midX}
        y2={VB_H - MX.b}
        stroke="var(--line)"
        strokeDasharray="3 7"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={MX.l}
        y1={midY}
        x2={VB_W - MX.r}
        y2={midY}
        stroke="var(--line)"
        strokeDasharray="3 7"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* LOCALIZE FIRST quadrant glow (bottom-right = high momentum, low readiness) */}
      <rect
        x={midX}
        y={midY}
        width={VB_W - MX.r - midX}
        height={VB_H - MX.b - midY}
        fill={withAlpha(accent, 0.055)}
        stroke={withAlpha(accent, 0.22)}
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* Quadrant labels */}
      <text
        x={midX + 7}
        y={VB_H - MX.b - 8}
        style={{ ...mono, fill: accent, fontSize: 9 }}
      >
        LOCALIZE FIRST
      </text>
      <text x={midX + 7} y={MX.t + 16} style={mono}>
        SHIP NOW
      </text>
      <text x={MX.l + 7} y={MX.t + 16} style={mono}>
        NURTURE
      </text>
      <text x={MX.l + 7} y={VB_H - MX.b - 8} style={mono}>
        DEPRIORITIZE
      </text>
      <text
        x={(midX + VB_W - MX.r) / 2}
        y={VB_H - MX.b - 18}
        style={{ ...mono, fontSize: 7 }}
        textAnchor="middle"
      >
        where to spend the localization budget
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Sparkline (mini inline chart for the strategy rail)
// ─────────────────────────────────────────────────────────────

function Sparkline({
  vals,
  color,
  w = 54,
  h = 18,
}: {
  vals: number[];
  color: string;
  w?: number;
  h?: number;
}) {
  if (vals.length < 2)
    return (
      <span
        style={{ display: "inline-block", width: w, height: h, flexShrink: 0 }}
      />
    );
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: h - ((v - min) / span) * (h - 3) - 1.5,
  }));
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("");
  const last = pts[pts.length - 1];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {last && <circle cx={last.x} cy={last.y} r={1.5} fill={color} />}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Strategy rail row
// ─────────────────────────────────────────────────────────────

function MarketRow({
  m,
  score,
  accent,
  drained,
  joy,
  isActive,
  isOpp,
  onSelect,
  onHover,
}: {
  m: Market;
  score: number;
  accent: string;
  drained: string;
  joy: string;
  isActive: boolean;
  isOpp: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const mc =
    m.momentum === "high"
      ? accent
      : m.momentum === "rising"
        ? withAlpha(accent, 0.7)
        : drained;
  const sym =
    m.momentum === "high" ? "▲▲" : m.momentum === "rising" ? "▲" : "–";
  const barColor = lerpColor(joy, drained, 1 - m.readiness / 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(m.id)}
      onMouseLeave={() => onHover(null)}
      className="w-full border-b border-line text-left transition-colors duration-200 hover:bg-surface-2"
      style={{
        backgroundColor: isActive ? "var(--surface-2)" : undefined,
        borderLeftWidth: 2,
        borderLeftStyle: "solid",
        borderLeftColor: isOpp ? accent : "transparent",
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 12,
        paddingRight: 12,
        transitionTimingFunction: "var(--ease)",
      }}
    >
      <div className="flex items-center gap-2">
        {/* Sparkline */}
        {(m.streamsHistory?.length ?? 0) >= 2 && (
          <Sparkline
            vals={m.streamsHistory!}
            color={withAlpha(accent, 0.75)}
          />
        )}

        {/* Name + delta */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.13em] text-text">
            {m.name}
            {m.origin && (
              <span className="ml-1 text-text-faint">· origin</span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[9px] tabular-nums">
            <span style={{ color: mc }}>{sym}</span>
            <span className="ml-1 text-text-faint">
              {m.streamsDelta > 0 ? "+" : ""}
              {m.streamsDelta}%
            </span>
          </p>
        </div>

        {/* Opportunity score + readiness bar */}
        <div className="shrink-0 text-right">
          <p
            className="font-mono text-xs tabular-nums leading-none"
            style={{ color: accent }}
          >
            {score}
          </p>
          <div
            className="mt-1 h-[2px] w-14 overflow-hidden"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full"
              style={{
                width: `${m.readiness}%`,
                backgroundColor: barColor,
                transition: "width 600ms var(--ease)",
              }}
            />
          </div>
          <p className="mt-0.5 font-mono text-[9px] tabular-nums text-text-faint">
            {m.readiness}%
          </p>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Market detail (drill-down panel)
// ─────────────────────────────────────────────────────────────

const FIDELITY_KEYS = [
  "meaning",
  "emotion",
  "culture",
  "singability",
] as const;

function MarketDetail({
  m,
  marketDataSource,
  accent,
  drained,
  joy,
  onClose,
  onRebirth,
}: {
  m: Market;
  marketDataSource: string;
  accent: string;
  drained: string;
  joy: string;
  onClose: () => void;
  onRebirth: () => void;
}) {
  const fillColor = lerpColor(joy, drained, 1 - m.readiness / 100);
  const sym =
    m.momentum === "high" ? "▲▲" : m.momentum === "rising" ? "▲" : "–";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-line bg-surface p-4">
        <div>
          <h3 className="font-serif text-2xl leading-none text-text">
            {m.name}
          </h3>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-text-faint">
            {m.lang.toUpperCase()}
            {m.origin ? " · ORIGIN" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 border border-line bg-transparent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-dim hover:bg-surface-2"
          style={{ borderRadius: 2 }}
          aria-label="Close detail"
        >
          esc
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Big readiness */}
        <div className="flex items-baseline gap-1">
          <span
            className="font-mono text-5xl tabular-nums leading-none"
            style={{ color: fillColor }}
          >
            {m.readiness}
          </span>
          <span className="font-mono text-base text-text-dim">% ready</span>
        </div>

        {/* Momentum + streams */}
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
          <span style={{ color: accent }}>{sym}</span>{" "}
          <span className="text-text">
            {m.streamsDelta > 0 ? "+" : ""}
            {m.streamsDelta}%
          </span>
          <span className="text-text-faint"> / 30 days</span>
        </p>

        {/* Absolute streams + sparkline */}
        {(m.absoluteStreams != null ||
          (m.streamsHistory?.length ?? 0) >= 2) && (
          <div>
            {m.absoluteStreams != null && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                  Total Streams
                </span>
                <span className="font-mono text-sm text-text">
                  {fmtN(m.absoluteStreams)}
                </span>
              </div>
            )}
            {(m.streamsHistory?.length ?? 0) >= 2 && (
              <div className="mt-2">
                <Sparkline
                  vals={m.streamsHistory!}
                  color={accent}
                  w={220}
                  h={38}
                />
              </div>
            )}
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-text-faint">
              {marketDataSource === "songstats"
                ? "SONGSTATS · LIVE"
                : "ESTIMATED"}
            </p>
          </div>
        )}

        {/* Fidelity sub-scores */}
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            Fidelity breakdown
          </p>
          <div className="flex flex-col gap-2.5">
            {FIDELITY_KEYS.map((k) => {
              const v = clamp01(m.fidelity[k] ?? 0);
              const c = lerpColor(joy, drained, 1 - v);
              return (
                <div key={k}>
                  <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.12em]">
                    <span className="text-text-dim">{k}</span>
                    <span style={{ color: c }}>{Math.round(v * 100)}%</span>
                  </div>
                  <div
                    className="h-[2px] w-full overflow-hidden"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full"
                      style={{ width: `${v * 100}%`, backgroundColor: c }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Localized lyric preview */}
        {m.localizedPreview && (
          <div>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
              Localized Preview
            </p>
            <p
              className="font-serif text-sm italic leading-relaxed text-text-dim"
              style={{ borderLeft: `1.5px solid ${withAlpha(accent, 0.5)}`, paddingLeft: 10 }}
            >
              "{m.localizedPreview}"
            </p>
          </div>
        )}

        {/* Cross-cultural risk */}
        {m.risk && (
          <div>
            <p
              className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: "var(--risk)" }}
            >
              Cross-Cultural Risk
            </p>
            <p className="text-xs leading-relaxed text-text-dim">{m.risk}</p>
          </div>
        )}

        {/* CTA */}
        {!m.origin && (
          <button
            type="button"
            onClick={onRebirth}
            className="w-full bg-transparent px-3 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-text transition-colors duration-200 hover:bg-surface-2"
            style={{
              borderRadius: 2,
              border: `1px solid ${accent}`,
              transitionTimingFunction: "var(--ease)",
            }}
          >
            Generate Localization →
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WorldView — main component
// ─────────────────────────────────────────────────────────────

export function WorldView() {
  const { song, setView, setResonance } = useResound();
  const { markets, marketDataSource } = song;

  const [lens, setLens] = useState<Lens>("map");
  const [morphT, setMorphT] = useState(0);
  const morphTRef = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [shown, setShown] = useState<Market | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [mounted, setMounted] = useState(false); // arc entrance

  const morphRafRef = useRef<number | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleRafRef = useRef<number | null>(null);

  // ── Color tokens ──────────────────────────────────────────
  const joy = useMemo(() => resolveEmotionColor("joy"), []);
  const accent = joy;
  const drained = useMemo(() => resolveDrained(), []);
  const lineColor = useMemo(
    () => readCssVar("--line", "#1d3028"),
    [],
  );

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // ── Derived data ──────────────────────────────────────────
  const origin = useMemo(
    () => markets.find((m) => m.origin) ?? markets[0] ?? null,
    [markets],
  );

  const scores = useMemo(() => {
    const map = new Map<string, number>();
    markets.forEach((m) => map.set(m.id, oppScore(m)));
    return map;
  }, [markets]);

  const opportunity = useMemo(() => {
    if (!markets.length) return null;
    return markets.reduce(
      (best, m) =>
        (scores.get(m.id) ?? 0) > (scores.get(best.id) ?? 0) ? m : best,
      markets[0],
    );
  }, [markets, scores]);

  const railMarkets = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? markets.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.lang.toLowerCase().includes(q),
        )
      : [...markets];
    list.sort((a, b) => {
      switch (sortKey) {
        case "opportunity":
          return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
        case "momentum":
          return MOM_W[b.momentum] - MOM_W[a.momentum];
        case "readiness":
          return b.readiness - a.readiness;
        case "reach":
          return (b.absoluteStreams ?? 0) - (a.absoluteStreams ?? 0);
      }
    });
    return list;
  }, [markets, query, sortKey, scores]);

  const selected = selectedId
    ? (markets.find((m) => m.id === selectedId) ?? null)
    : null;
  const open = selected !== null;

  // Keep last shown for slide-out animation
  useEffect(() => {
    if (selected) setShown(selected);
  }, [selected]);

  // Arc entrance
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Resonance = top opportunity score normalised
  useEffect(() => {
    setResonance(opportunity ? (scores.get(opportunity.id) ?? 0) / 100 : 0);
  }, [opportunity, scores, setResonance]);

  // Escape → close detail
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  // ── Morph animation ───────────────────────────────────────
  const startMorph = useCallback((target: number) => {
    if (morphRafRef.current !== null)
      cancelAnimationFrame(morphRafRef.current);
    const from = morphTRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / MORPH_DUR);
      const val = lerp(from, target, easeInOut(p));
      morphTRef.current = val;
      setMorphT(val);
      if (p < 1) morphRafRef.current = requestAnimationFrame(step);
    };
    morphRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      if (morphRafRef.current !== null)
        cancelAnimationFrame(morphRafRef.current);
    },
    [],
  );

  const toggleLens = useCallback(() => {
    const next: Lens = lens === "map" ? "matrix" : "map";
    setLens(next);
    startMorph(next === "matrix" ? 1 : 0);
  }, [lens, startMorph]);

  // ── Particle animation (canvas, RAF) ──────────────────────
  useEffect(() => {
    if (reduced || !origin) return;

    interface Particle {
      arcId: string;
      t: number;
      speed: number;
      alpha: number;
    }
    const particles: Particle[] = [];

    markets.forEach((m) => {
      if (m.id === origin.id) return;
      const spd =
        m.momentum === "high" ? 0.38 : m.momentum === "rising" ? 0.22 : 0.1;
      const cnt =
        m.momentum === "high" ? 7 : m.momentum === "rising" ? 4 : 2;
      const alpha =
        m.momentum === "high" ? 0.95 : m.momentum === "rising" ? 0.6 : 0.35;
      for (let i = 0; i < cnt; i++) {
        particles.push({ arcId: m.id, t: i / cnt, speed: spd, alpha });
      }
    });

    let last = 0;
    const frame = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;

      const canvas = particleCanvasRef.current;
      if (!canvas) {
        particleRafRef.current = requestAnimationFrame(frame);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        particleRafRef.current = requestAnimationFrame(frame);
        return;
      }

      ctx.clearRect(0, 0, VB_W, VB_H);
      const mt = morphTRef.current;
      const [ox, oy] = nodeXY(origin, mt);

      for (const p of particles) {
        p.t = (p.t + p.speed * dt) % 1;
        const mkt = markets.find((mk) => mk.id === p.arcId);
        if (!mkt) continue;
        const [tx, ty] = nodeXY(mkt, mt);
        const { cx, cy } = arcCtrl(ox, oy, tx, ty);
        const pt = bPt(p.t, ox, oy, cx, cy, tx, ty);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(accent, p.alpha);
        ctx.fill();
      }

      particleRafRef.current = requestAnimationFrame(frame);
    };

    particleRafRef.current = requestAnimationFrame(frame);
    return () => {
      if (particleRafRef.current !== null)
        cancelAnimationFrame(particleRafRef.current);
    };
  }, [markets, origin, accent, reduced]);

  // ── Empty state ───────────────────────────────────────────
  if (!markets.length) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
          No market data.
        </p>
      </div>
    );
  }

  const mapOp = 1 - morphT;
  const matOp = morphT;

  return (
    <div className="relative flex h-screen flex-col pb-24 pt-20">
      {/* CSS keyframes — scoped names to avoid collisions */}
      <style>{`
        @keyframes wv-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.85; }
        }
        @keyframes wv-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* ── TOP BAR ──────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-8 py-3 md:px-12">
        {/* Opportunity callout */}
        {opportunity && opportunity.id !== origin?.id && (
          <div
            className="flex items-center gap-2 pl-3 font-mono text-[10px] uppercase tracking-[0.13em]"
            style={{ borderLeft: `2px solid ${accent}` }}
          >
            <span className="text-text-faint">Opp</span>
            <span className="text-text">{opportunity.name}</span>
            <span className="text-text-faint">·</span>
            <span style={{ color: accent }}>
              {opportunity.momentum === "high" ? "▲▲" : "▲"}{" "}
              {opportunity.momentum}
            </span>
            <span className="text-text-faint">·</span>
            <span className="text-text">
              {scores.get(opportunity.id)} pts
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Lens toggle */}
        <div
          className="inline-flex border border-line"
          style={{ borderRadius: 2 }}
          role="group"
          aria-label="Lens selector"
        >
          {(["map", "matrix"] as Lens[]).map((l) => {
            const active = lens === l;
            return (
              <button
                key={l}
                type="button"
                onClick={toggleLens}
                aria-pressed={active}
                className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-200"
                style={{
                  color: active ? accent : "var(--text-faint)",
                  backgroundColor: active
                    ? "var(--surface-2)"
                    : "transparent",
                  borderRight:
                    l === "map" ? "1px solid var(--line)" : undefined,
                  transitionTimingFunction: "var(--ease)",
                }}
              >
                {l}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Filter markets"
          className="w-36 border border-line bg-transparent py-1.5 pl-3 pr-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text placeholder:text-text-faint focus:border-line-bright focus:outline-none"
          style={{ borderRadius: 2 }}
        />

        {/* Data source liveness badge */}
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-text-faint">
          {marketDataSource === "songstats" && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: accent,
                animation: "wv-blink 2s ease-in-out infinite",
              }}
            />
          )}
          {marketDataSource === "songstats" ? "Songstats · Live" : "Estimated"}
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* ── LENS CANVAS ───────────────────────────── */}
        <div className="relative min-w-0 flex-1">
          {/* Layer 0: Dot-matrix world map */}
          <DotMatrix color={withAlpha(lineColor, 0.5)} />

          {/* Layer 1: Particles (canvas, RAF) */}
          <canvas
            ref={particleCanvasRef}
            width={VB_W}
            height={VB_H}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          />

          {/* Layer 2: SVG — arcs, sonar, nodes, matrix axes */}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-label="Global release cockpit"
          >
            {/* GRATICULE — MAP mode only */}
            <g
              opacity={mapOp * 0.55}
              style={{ transition: "opacity 400ms var(--ease)" }}
              aria-hidden
            >
              {[2, 4, 6, 8].map((i) => (
                <line
                  key={`m${i}`}
                  x1={i * 100}
                  y1={0}
                  x2={i * 100}
                  y2={VB_H}
                  stroke="var(--line)"
                  strokeDasharray="2 10"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {[1, 2, 3].map((i) => (
                <line
                  key={`p${i}`}
                  x1={0}
                  y1={i * 125}
                  x2={VB_W}
                  y2={i * 125}
                  stroke="var(--line)"
                  strokeDasharray="2 10"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* Equator + prime meridian */}
              <line
                x1={0}
                y1={250}
                x2={VB_W}
                y2={250}
                stroke="var(--line-bright)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={500}
                y1={0}
                x2={500}
                y2={VB_H}
                stroke="var(--line-bright)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* STATIC ARCS — MAP mode, fade out first */}
            {origin && (
              <g
                opacity={Math.max(0, mapOp * 2 - 1)}
                style={{ transition: "opacity 200ms" }}
                aria-hidden
              >
                {markets
                  .filter((m) => m.id !== origin.id)
                  .map((m, i) => {
                    const isOpp = opportunity?.id === m.id;
                    const { cx, cy } = arcCtrl(
                      origin.x,
                      origin.y,
                      m.x,
                      m.y,
                    );
                    const d = `M${origin.x},${origin.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${m.x},${m.y}`;
                    return (
                      <path
                        key={`arc-${m.id}`}
                        d={d}
                        fill="none"
                        stroke={accent}
                        strokeWidth={isOpp ? 1.5 : 0.8}
                        opacity={isOpp ? 0.55 : 0.22}
                        vectorEffect="non-scaling-stroke"
                        pathLength={1}
                        style={{
                          strokeDasharray: 1,
                          strokeDashoffset: mounted ? 0 : 1,
                          transition: `stroke-dashoffset 900ms var(--ease) ${i * 80}ms`,
                        }}
                      />
                    );
                  })}
              </g>
            )}

            {/* SONAR SWEEP — MAP mode */}
            {origin && !reduced && (
              <SonarSweep
                ox={origin.x}
                oy={origin.y}
                accent={accent}
                opacity={mapOp}
              />
            )}

            {/* MATRIX AXES — MATRIX mode */}
            <MatrixAxes opacity={matOp} accent={accent} />

            {/* MARKET NODES — always visible, morph between positions */}
            {markets.map((m) => {
              const [x, y] = nodeXY(m, morphT);
              return (
                <MarketNode
                  key={m.id}
                  m={m}
                  x={x}
                  y={y}
                  accent={accent}
                  drained={drained}
                  joy={joy}
                  isOpp={opportunity?.id === m.id}
                  isActive={selectedId === m.id}
                  isHovered={hoveredId === m.id}
                  reduced={reduced}
                  onSelect={() =>
                    setSelectedId((prev) => (prev === m.id ? null : m.id))
                  }
                  onHover={(id) => setHoveredId(id)}
                />
              );
            })}
          </svg>
        </div>

        {/* ── STRATEGY RAIL ─────────────────────────── */}
        <div
          className="relative flex shrink-0 flex-col border-l border-line"
          style={{ width: 300 }}
        >
          {/* Sort toggle */}
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-line p-2.5">
            {(
              [
                "opportunity",
                "momentum",
                "readiness",
                "reach",
              ] as SortKey[]
            ).map((k) => {
              const active = sortKey === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSortKey(k)}
                  aria-pressed={active}
                  className="px-2 py-1 font-mono text-[8px] uppercase tracking-[0.13em] transition-colors duration-200"
                  style={{
                    borderRadius: 2,
                    color: active ? accent : "var(--text-faint)",
                    backgroundColor: active
                      ? "var(--surface-2)"
                      : "transparent",
                    border: `1px solid ${active ? accent : "var(--line)"}`,
                    transitionTimingFunction: "var(--ease)",
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>

          {/* Market list */}
          <div className="flex-1 overflow-y-auto">
            {railMarkets.length === 0 && (
              <p className="p-4 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                No markets match.
              </p>
            )}
            {railMarkets.map((m) => (
              <MarketRow
                key={m.id}
                m={m}
                score={scores.get(m.id) ?? 0}
                accent={accent}
                drained={drained}
                joy={joy}
                isActive={selectedId === m.id}
                isOpp={opportunity?.id === m.id}
                onSelect={() =>
                  setSelectedId((prev) => (prev === m.id ? null : m.id))
                }
                onHover={(id) => setHoveredId(id)}
              />
            ))}
          </div>

          {/* Market detail — slides in from right, covers rail */}
          <div
            role="dialog"
            aria-label={shown ? `${shown.name} market detail` : "Market detail"}
            aria-hidden={!open}
            className="absolute inset-0 overflow-hidden"
            style={{
              backgroundColor: "var(--surface)",
              borderLeft: "1px solid var(--line)",
              transform: open ? "translateX(0)" : "translateX(100%)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition:
                "transform 380ms var(--ease), opacity 380ms var(--ease)",
            }}
          >
            {shown && (
              <MarketDetail
                m={shown}
                marketDataSource={marketDataSource}
                accent={accent}
                drained={drained}
                joy={joy}
                onClose={() => setSelectedId(null)}
                onRebirth={() => setView("rebirth")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorldView;
