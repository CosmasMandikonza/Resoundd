import { useEffect, useMemo, useState } from "react";
import { useResound } from "@/context/useResound";
import type { Fidelity, Market } from "@/types";
import {
  clamp01,
  lerpColor,
  resolveDrained,
  resolveEmotionColor,
  withAlpha,
} from "@/lib/colors";

const VB_W = 1000;
const VB_H = 500;

const MOMENTUM_RANK: Record<Market["momentum"], number> = {
  high: 3,
  rising: 2,
  flat: 1,
};

const FIDELITY_KEYS: (keyof Fidelity)[] = [
  "meaning",
  "emotion",
  "culture",
  "singability",
];

/** Diameter in px for a market node, scaled by its momentum. */
function nodeSize(m: Market): number {
  const base = m.momentum === "high" ? 22 : m.momentum === "rising" ? 17 : 13;
  return m.origin ? base + 2 : base;
}

/** A curved origin -> target path in viewBox space (HarmonicArcs-style). */
function arcPath(o: Market, m: Market): string {
  const dx = m.x - o.x;
  const dy = m.y - o.y;
  const dist = Math.hypot(dx, dy);
  const cx = (o.x + m.x) / 2;
  const cy = (o.y + m.y) / 2 - dist * 0.28;
  return `M ${o.x} ${o.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${m.x} ${m.y}`;
}

export function WorldView() {
  const { setView, song } = useResound();
  const { title, markets } = song;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shown, setShown] = useState<Market | null>(null);
  const [mounted, setMounted] = useState(false);

  // Colors resolved once (helpers read computed CSS vars).
  const joy = useMemo(() => resolveEmotionColor("joy"), []);
  const drained = useMemo(() => resolveDrained(), []);

  const nodeColor = useMemo(
    () => (readiness: number) =>
      readiness >= 75
        ? joy
        : lerpColor(joy, drained, clamp01((75 - readiness) / 50)),
    [joy, drained],
  );

  const origin = useMemo(
    () => markets.find((m) => m.origin) ?? markets[0] ?? null,
    [markets],
  );

  // The dormant-revenue play: highest momentum among under-ready markets.
  const opportunity = useMemo(() => {
    const cands = markets.filter((m) => m.readiness < 70);
    if (!cands.length) return null;
    return cands.reduce((best, m) => {
      const r = MOMENTUM_RANK[m.momentum];
      const rb = MOMENTUM_RANK[best.momentum];
      if (r > rb) return m;
      if (r === rb && m.streamsDelta > best.streamsDelta) return m;
      return best;
    }, cands[0]);
  }, [markets]);

  const selected = selectedId
    ? (markets.find((m) => m.id === selectedId) ?? null)
    : null;
  const open = selected != null;

  // Keep the last selection visible while the panel slides out.
  useEffect(() => {
    if (selected) setShown(selected);
  }, [selected]);

  // Draw the arcs in after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Escape closes the open panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!markets.length) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
          No market data.
        </p>
      </div>
    );
  }

  const meridians = Array.from({ length: 9 }, (_, i) => (i + 1) * (VB_W / 10));
  const parallels = Array.from({ length: 7 }, (_, i) => (i + 1) * (VB_H / 8));

  return (
    <div className="relative flex h-screen w-full flex-col px-8 pb-24 pt-20 md:px-14">
      {/* HEADER */}
      <header className="shrink-0">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <h1 className="font-serif text-5xl leading-[0.85] text-text md:text-6xl">
            Global Release
          </h1>
          <span className="font-serif text-2xl text-text-dim md:text-3xl">
            {title}
          </span>
        </div>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-text-dim">
          Readiness by Market
        </p>
      </header>

      {/* OPPORTUNITY CALLOUT — the money insight. */}
      {opportunity && (
        <div
          className="mt-4 flex shrink-0 items-center gap-3 py-2 pl-3 font-mono text-xs uppercase tracking-[0.16em] text-text-dim md:text-sm"
          style={{ borderLeft: "2px solid var(--joy)" }}
        >
          <span className="text-text">Opportunity</span>
          <span className="text-text-faint">·</span>
          <span className="text-text">{opportunity.name}</span>
          <span className="text-text-faint">·</span>
          <span>
            Momentum <span style={{ color: "var(--joy)" }}>▲</span>{" "}
            {opportunity.momentum.toUpperCase()}
          </span>
          <span className="text-text-faint">·</span>
          <span>
            Readiness{" "}
            <span style={{ color: "var(--joy)" }}>{opportunity.readiness}</span>
          </span>
          <span className="text-text-faint">·</span>
          <span className="text-text">Localize First</span>
        </div>
      )}

      {/* THE MAP */}
      <div className="relative mt-4 min-h-0 flex-1">
        {/* Graticule + arcs (decorative SVG, stretched to fill). */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {/* Faint equirectangular frame + graticule. */}
          <rect
            x="0.5"
            y="0.5"
            width={VB_W - 1}
            height={VB_H - 1}
            fill="none"
            stroke="var(--line)"
            vectorEffect="non-scaling-stroke"
          />
          {meridians.map((x) => (
            <line
              key={`m${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={VB_H}
              stroke="var(--line)"
              strokeDasharray="2 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {parallels.map((y) => (
            <line
              key={`p${y}`}
              x1={0}
              y1={y}
              x2={VB_W}
              y2={y}
              stroke="var(--line)"
              strokeDasharray="2 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Equator + prime meridian, a touch brighter. */}
          <line
            x1={0}
            y1={VB_H / 2}
            x2={VB_W}
            y2={VB_H / 2}
            stroke="var(--line-bright)"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={VB_W / 2}
            y1={0}
            x2={VB_W / 2}
            y2={VB_H}
            stroke="var(--line-bright)"
            vectorEffect="non-scaling-stroke"
          />

          {/* Origin -> market arcs, drawn on after mount. */}
          {origin &&
            markets
              .filter((m) => m.id !== origin.id)
              .map((m, i) => {
                const isOpp = opportunity?.id === m.id;
                return (
                  <path
                    key={`arc-${m.id}`}
                    d={arcPath(origin, m)}
                    fill="none"
                    stroke="var(--joy)"
                    strokeWidth={isOpp ? 1.6 : 1}
                    opacity={isOpp ? 0.85 : 0.35}
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: mounted ? 0 : 1,
                      transition: "stroke-dashoffset 900ms var(--ease)",
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                );
              })}
        </svg>

        {/* Market nodes + labels (HTML overlay keeps circles round + text crisp). */}
        <div className="pointer-events-none absolute inset-0">
          {markets.map((m) => {
            const color = nodeColor(m.readiness);
            const size = nodeSize(m);
            const isOpp = opportunity?.id === m.id;
            const isActive = selectedId === m.id;
            const showArrow = m.momentum === "high" || m.momentum === "rising";
            const labelLeft = m.x > 800;
            return (
              <div
                key={m.id}
                className="pointer-events-none absolute"
                style={{
                  left: `${(m.x / VB_W) * 100}%`,
                  top: `${(m.y / VB_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {/* Pulsing opportunity ring. */}
                {isOpp && (
                  <span
                    aria-hidden
                    className="world-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: size + 16,
                      height: size + 16,
                      border: "1.5px solid var(--joy)",
                    }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  aria-label={`${m.name}, readiness ${m.readiness} percent, momentum ${m.momentum}`}
                  aria-pressed={isActive}
                  className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-transform duration-[280ms]"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    boxShadow: `0 0 14px ${withAlpha(color, 0.55)}`,
                    border: m.origin
                      ? "1.5px solid var(--text)"
                      : isActive
                        ? "1.5px solid var(--text)"
                        : "none",
                    transitionTimingFunction: "var(--ease)",
                  }}
                />

                {/* Label beside the node. */}
                <span
                  className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim"
                  style={
                    labelLeft
                      ? { right: size / 2 + 8, textAlign: "right" }
                      : { left: size / 2 + 8 }
                  }
                >
                  {m.name}{" "}
                  <span className="text-text-faint">· {m.readiness}%</span>
                  {showArrow && (
                    <span style={{ color: "var(--joy)" }}> ▲</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* DETAIL PANEL — slides in from the right, one at a time. */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[320px] max-w-[88%] overflow-y-auto p-5"
          role="dialog"
          aria-label={shown ? `${shown.name} release detail` : "Market detail"}
          aria-hidden={!open}
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 2,
            transform: open ? "translateX(0)" : "translateX(110%)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transition:
              "transform 420ms var(--ease), opacity 420ms var(--ease)",
          }}
        >
          {shown && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-3xl leading-none text-text">
                    {shown.name}
                  </h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
                    {shown.lang}
                    {shown.origin ? " · Origin" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close detail"
                  className="border border-line bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
                  style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
                >
                  Esc
                </button>
              </div>

              {/* Big readiness number. */}
              <div className="mt-5 flex items-baseline gap-1">
                <span
                  className="font-mono text-6xl leading-none"
                  style={{ color: nodeColor(shown.readiness) }}
                >
                  {shown.readiness}
                </span>
                <span className="font-mono text-lg text-text-dim">%</span>
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
                  Ready
                </span>
              </div>

              {/* Momentum / streams line. */}
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-text-dim">
                Streams <span style={{ color: "var(--joy)" }}>▲</span>{" "}
                <span className="text-text">{shown.streamsDelta}%</span> / 30D
              </p>

              {/* Fidelity sub-scores as mini bars. */}
              <div className="mt-5 flex flex-col gap-3">
                {FIDELITY_KEYS.map((k) => {
                  const v = clamp01(shown.fidelity?.[k] ?? 0);
                  return (
                    <div key={k}>
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                        <span className="text-text-dim">{k}</span>
                        <span style={{ color: lerpColor(joy, drained, 1 - v) }}>
                          {Math.round(v * 100)}%
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1 w-full overflow-hidden"
                        style={{ backgroundColor: "var(--surface-2)" }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${v * 100}%`,
                            backgroundColor: lerpColor(joy, drained, 1 - v),
                            transition: "width 600ms var(--ease)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cross-cultural risk. */}
              {shown.risk && (
                <div className="mt-5">
                  <p
                    className="font-mono text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: "var(--risk)" }}
                  >
                    Cross-Cultural Risk
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-text-dim">
                    {shown.risk}
                  </p>
                </div>
              )}

              {/* Action. */}
              <button
                type="button"
                onClick={() => setView("rebirth")}
                className="mt-6 w-full border border-line bg-transparent px-3 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-text transition-colors duration-[280ms] hover:bg-surface-2"
                style={{
                  borderRadius: 2,
                  transitionTimingFunction: "var(--ease)",
                }}
              >
                Rebirth for {shown.name}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorldView;
