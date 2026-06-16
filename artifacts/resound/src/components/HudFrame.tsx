import type { ReactNode } from "react";
import { useResound, type Metric } from "@/context/useResound";

interface HudFrameProps {
  children?: ReactNode;
  /** Override the active metric tab; defaults to context value. */
  activeMetric?: Metric;
}

const METRICS: Metric[] = ["meaning", "emotion", "culture", "singability"];

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

export function HudFrame({ children, activeMetric }: HudFrameProps) {
  const {
    activeAccent,
    timecode,
    isPlaying,
    togglePlaying,
    activeMetric: ctxMetric,
  } = useResound();

  const currentMetric = activeMetric ?? ctxMetric;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-void text-text">
      {/* Fixed graph-paper grid background — 64px cells, behind all content. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundColor: "var(--void)",
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* TOP CHROME */}
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4">
        {/* Top-left: timecode + status square */}
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 shrink-0"
            style={{
              backgroundColor: activeAccent,
            }}
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
          <HudButton label="Menu" />
        </div>
      </header>

      {/* CONTENT — the empty void shell for now */}
      <main className="relative z-10 min-h-screen w-full">{children}</main>

      {/* BOTTOM CHROME */}
      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 py-4">
        {/* Bottom-left: resonance readout */}
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-faint">
          RESONANCE 00.0%
        </span>

        {/* Bottom-center: metric state row */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3 font-mono text-xs uppercase tracking-[0.16em]">
          {METRICS.map((metric, i) => {
            const isActive = metric === currentMetric;
            return (
              <span key={metric} className="flex items-center gap-3">
                <span
                  style={isActive ? { color: activeAccent } : undefined}
                  className={isActive ? "" : "text-text-faint"}
                >
                  {metric}
                </span>
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
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-faint opacity-0">
          RESONANCE 00.0%
        </span>
      </footer>
    </div>
  );
}

export default HudFrame;
