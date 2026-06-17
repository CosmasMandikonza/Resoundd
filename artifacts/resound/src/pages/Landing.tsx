import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useResound } from "@/context/useResound";
import { FEATURED } from "@/fixtures/featured";
import AmbientSphere from "@/components/landing/AmbientSphere";
import LyricCrossing from "@/components/landing/LyricCrossing";

gsap.registerPlugin(ScrollTrigger);

const GRID_STYLE = {
  backgroundColor: "var(--void)",
  backgroundImage:
    "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
} as const;

const LANDING_CSS = `
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-stopped { overflow: hidden; }
.cta {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid; border-radius: 2px;
  padding: 0.75rem 1.5rem;
  font-family: var(--font-mono);
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.18em;
  background: transparent; cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.cta-primary { border-color: var(--joy); color: var(--text); }
.cta-primary:hover { background: color-mix(in srgb, var(--joy) 18%, transparent); }
.cta-secondary { border-color: var(--line-bright); color: var(--text-dim); }
.cta-secondary:hover { background: var(--surface-2); color: var(--text); }
.link-quiet {
  font-family: var(--font-mono); font-size: 0.62rem; text-transform: uppercase;
  letter-spacing: 0.18em; color: var(--text-faint); background: transparent;
  cursor: pointer; transition: color var(--dur-fast) var(--ease);
}
.link-quiet:hover { color: var(--text-dim); }
`;

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

/** Ticking Space-Mono timecode, mm:ss:mmm from mount. */
function Timecode() {
  const [t, setT] = useState("00:00:000");
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const ms = performance.now() - start;
      const mm = Math.floor(ms / 60000);
      const ss = Math.floor((ms % 60000) / 1000);
      const mmm = Math.floor(ms % 1000);
      setT(`${pad(mm, 2)}:${pad(ss, 2)}:${pad(mmm, 3)}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
      {t}
    </span>
  );
}

/** Faint two-curve harmonic-arc motif, used as a background flourish. */
function HarmonicMotif({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1000 320"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M 0 200 C 250 120, 420 110, 560 150 C 720 196, 850 210, 1000 180"
        fill="none"
        stroke="var(--line-bright)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M 0 210 C 250 180, 420 200, 560 230 C 720 262, 850 286, 1000 300"
        fill="none"
        stroke="var(--drained)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const PILLARS: { key: string; title: string; body: string; accent: string }[] =
  [
    {
      key: "see",
      title: "See",
      body: "The Meaning-Cast — watch emotion diverge as a song crosses a language.",
      accent: "var(--love)",
    },
    {
      key: "prove",
      title: "Prove",
      body: "The Fidelity map — exactly what's lost, line by line, with grounded evidence.",
      accent: "var(--melancholy)",
    },
    {
      key: "carry",
      title: "Carry",
      body: "Rebirth — a faithful, singable version, reborn.",
      accent: "var(--calm)",
    },
  ];

export function Landing() {
  const { startAnalysis, openFeatured } = useResound();
  const firstFeaturedId = FEATURED[0]?.id;
  const rootRef = useRef<HTMLDivElement>(null);

  const onFeatured = () => {
    if (firstFeaturedId) openFeatured(firstFeaturedId);
  };

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !rootRef.current) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      reveals.forEach((el) => {
        // Explicit hidden state + a one-shot tween. `once`/`refresh` keep the
        // element from ever being stranded at opacity 0 if a trigger misfires.
        gsap.set(el, { opacity: 0, y: 42 });
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });
      ScrollTrigger.refresh();
    }, rootRef);

    return () => {
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative w-full text-text">
      <style>{LANDING_CSS}</style>

      {/* ============================= HERO ============================= */}
      <section
        className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-20"
        style={GRID_STYLE}
      >
        {/* Minimal HUD */}
        <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4">
          <Timecode />
          <span className="absolute left-1/2 -translate-x-1/2 text-sm uppercase tracking-[0.28em] text-text">
            RESOUND
          </span>
          <div className="pointer-events-auto flex items-center gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              MUSICATHON 2026
            </span>
            <button type="button" className="link-quiet">
              Sign in
            </button>
          </div>
        </header>

        {/* Hero stack */}
        <div className="flex w-full max-w-3xl flex-col items-center gap-7">
          <h1
            className="text-center font-serif leading-[1.05] tracking-tight text-text"
            style={{ fontSize: "clamp(2.5rem, 7vw, 6rem)" }}
          >
            Every song, alive in every language.
          </h1>
          <p className="max-w-xl text-center text-base leading-relaxed text-text-dim md:text-lg">
            Resound measures whether a song's meaning, emotion, and culture
            survive translation — and carries them across when they don't.
          </p>

          <div className="my-2 h-[clamp(220px,38vh,360px)] w-full max-w-[460px]">
            <AmbientSphere />
          </div>

          <LyricCrossing />

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={startAnalysis}
              className="cta cta-primary"
            >
              Analyze a song
            </button>
            <button
              type="button"
              onClick={onFeatured}
              className="cta cta-secondary"
            >
              See a featured analysis
            </button>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-text-faint">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em]">
            Scroll
          </span>
          <ChevronDown size={14} className="hud-pulse" strokeWidth={1.25} />
        </div>
      </section>

      {/* ====================== SECTION 1 — STAKES ===================== */}
      <section className="relative w-full overflow-hidden px-6 py-32">
        <HarmonicMotif className="pointer-events-none absolute inset-x-0 top-1/2 h-64 w-full -translate-y-1/2 opacity-40" />
        <div className="relative mx-auto flex max-w-3xl flex-col gap-8" data-reveal>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
            The stakes
          </span>
          <h2
            className="font-serif leading-[1.08] tracking-tight text-text"
            style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.4rem)" }}
          >
            The fastest-growing music on Earth isn't in English.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-text-dim md:text-lg">
            Latin America is the fastest-growing region in recorded music, and
            global charts no longer require singing in English. The lyrics are
            crossing borders — the meaning isn't.
          </p>
        </div>
      </section>

      {/* ================== SECTION 2 — SEE/PROVE/CARRY ================ */}
      <section className="relative w-full px-6 py-32" style={GRID_STYLE}>
        <div className="mx-auto flex max-w-5xl flex-col gap-16">
          <h2
            className="max-w-2xl font-serif leading-[1.08] tracking-tight text-text"
            style={{ fontSize: "clamp(1.9rem, 4.5vw, 3.4rem)" }}
            data-reveal
          >
            See it. Prove it. Carry it across.
          </h2>
          <div className="grid grid-cols-1 gap-px overflow-hidden border border-line md:grid-cols-3">
            {PILLARS.map((p) => (
              <div
                key={p.key}
                data-reveal
                className="flex flex-col gap-5 bg-void p-8"
              >
                <span
                  className="h-2 w-2"
                  style={{ backgroundColor: p.accent }}
                />
                <span
                  className="font-mono text-xs uppercase tracking-[0.24em]"
                  style={{ color: p.accent }}
                >
                  {p.title}
                </span>
                <p className="text-sm leading-relaxed text-text-dim">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ FOOTER =========================== */}
      <footer className="relative w-full overflow-hidden px-6 py-32">
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-10 text-center"
          data-reveal
        >
          <h2
            className="font-serif leading-[1.1] tracking-tight text-text"
            style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}
          >
            Hear what survives.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={startAnalysis}
              className="cta cta-primary"
            >
              Analyze a song
            </button>
            <button
              type="button"
              onClick={onFeatured}
              className="cta cta-secondary"
            >
              See a featured analysis
            </button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              Built for Musicathon 2026 · Powered by Musixmatch
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-faint/70">
              ElevenLabs · Cyanite · Songstats
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
