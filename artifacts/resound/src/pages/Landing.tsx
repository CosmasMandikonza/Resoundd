import { useResound } from "@/context/useResound";
import { FEATURED } from "@/fixtures/featured";

const GRID_STYLE = {
  backgroundColor: "var(--void)",
  backgroundImage:
    "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
} as const;

/**
 * Placeholder front door. The full landing is built in a later pass — for now
 * it surfaces the entry actions: start a new analysis, or open a featured
 * example (which routes into the instrument labelled "FEATURED EXAMPLE").
 */
export function Landing() {
  const { startAnalysis, openFeatured } = useResound();

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-12 px-6 text-text"
      style={GRID_STYLE}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-2xl uppercase tracking-[0.3em] text-text">
          RESOUND
        </span>
        <span className="max-w-md font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-text-faint">
          A music-translation instrument — placeholder landing
        </span>
      </div>

      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          onClick={startAnalysis}
          className="border border-text-dim bg-transparent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-text transition-colors duration-[280ms] hover:bg-surface-2"
          style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
        >
          New Analysis
        </button>

        <div className="flex flex-col items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
            Featured
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {FEATURED.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openFeatured(entry.id)}
                className="border border-line bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
                style={{
                  borderRadius: 2,
                  transitionTimingFunction: "var(--ease)",
                }}
              >
                {entry.song.title} — {entry.song.artist}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Landing;
