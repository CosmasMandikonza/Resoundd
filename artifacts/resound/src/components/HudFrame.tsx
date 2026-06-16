import { useEffect, useState, type ReactNode } from "react";
import {
  useResound,
  type Metric,
  type View,
} from "@/context/useResound";
import FidelityView from "@/components/FidelityView";

interface HudFrameProps {
  children?: ReactNode;
  /** Override the active metric tab; defaults to context value. */
  activeMetric?: Metric;
}

const METRICS: Metric[] = ["meaning", "emotion", "culture", "singability"];

const MENU_ITEMS: { view: View; label: string }[] = [
  { view: "cast", label: "MEANING-CAST" },
  { view: "fidelity", label: "FIDELITY" },
  { view: "rebirth", label: "REBIRTH" },
  { view: "world", label: "WORLD" },
];

const GRID_STYLE = {
  backgroundColor: "var(--void)",
  backgroundImage:
    "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
} as const;

function HudButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-line bg-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
      style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
    >
      {label}
    </button>
  );
}

function MenuOverlay({
  current,
  accent,
  onSelect,
  onClose,
}: {
  current: View;
  accent: string;
  onSelect: (view: View) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={GRID_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="absolute right-6 top-4 border border-line bg-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
        style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
      >
        Close
      </button>

      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 px-6 font-mono text-xl uppercase tracking-[0.2em]">
        {MENU_ITEMS.map((item, i) => {
          const isActive = item.view === current;
          return (
            <span key={item.view} className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => onSelect(item.view)}
                className="bg-transparent uppercase tracking-[0.2em] transition-colors duration-[280ms] hover:text-text"
                style={{
                  color: isActive ? accent : "var(--text-faint)",
                  transitionTimingFunction: "var(--ease)",
                }}
              >
                {item.label}
              </button>
              {i < MENU_ITEMS.length - 1 && (
                <span className="text-text-faint" aria-hidden>
                  ·
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

export function HudFrame({ children, activeMetric }: HudFrameProps) {
  const {
    activeAccent,
    timecode,
    isPlaying,
    togglePlaying,
    activeMetric: ctxMetric,
    setActiveMetric,
    view,
    setView,
  } = useResound();

  const [menuOpen, setMenuOpen] = useState(false);
  const currentMetric = activeMetric ?? ctxMetric;

  const renderView = () => {
    switch (view) {
      case "fidelity":
        return <FidelityView />;
      default:
        return children ?? null;
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-void text-text">
      {/* Fixed graph-paper grid background — 64px cells, behind all content. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={GRID_STYLE}
      />

      {/* TOP CHROME */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4">
        {/* Top-left: timecode + status square */}
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 shrink-0"
            style={{ backgroundColor: activeAccent }}
          >
            {isPlaying && (
              <span
                className="hud-pulse block h-full w-full"
                style={{ backgroundColor: activeAccent }}
              />
            )}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
            {timecode}
          </span>
        </div>

        {/* Top-center: wordmark */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <span className="text-sm uppercase tracking-[0.2em] text-text">
            RESOUND
          </span>
        </div>

        {/* Top-right: PLAY/PAUSE + MENU */}
        <div className="flex items-center gap-2">
          <HudButton
            label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlaying}
          />
          <HudButton label="Menu" onClick={() => setMenuOpen(true)} />
        </div>
      </header>

      {/* CONTENT */}
      <main className="relative z-10 min-h-screen w-full">{renderView()}</main>

      {/* BOTTOM CHROME */}
      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between px-6 py-4">
        {/* Bottom-left: resonance readout */}
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-faint">
          RESONANCE 00.0%
        </span>

        {/* Bottom-center: interactive metric state row */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3 font-mono text-xs uppercase tracking-[0.16em]">
          {METRICS.map((metric, i) => {
            const isActive = metric === currentMetric;
            return (
              <span key={metric} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveMetric(metric)}
                  className="bg-transparent uppercase tracking-[0.16em] transition-colors duration-[280ms] hover:text-text"
                  style={{
                    color: isActive ? activeAccent : "var(--text-faint)",
                    transitionTimingFunction: "var(--ease)",
                  }}
                >
                  {metric}
                </button>
                {i < METRICS.length - 1 && (
                  <span className="text-text-faint" aria-hidden>
                    ·
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Bottom-right spacer to balance the readout. */}
        <span
          aria-hidden
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-faint opacity-0"
        >
          RESONANCE 00.0%
        </span>
      </footer>

      {menuOpen && (
        <MenuOverlay
          current={view}
          accent={activeAccent}
          onSelect={(v) => {
            setView(v);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

export default HudFrame;
