import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Emotion } from "@/types";

interface Crossing {
  source: string;
  lang: string;
  english: string;
  emotion: Emotion;
  meaning: number;
  /** A flagged source word with no clean English equivalent — it resists. */
  lostWord?: string;
  lost?: string;
}

/** Original illustrative lines (NOT real song lyrics). */
const LINES: Crossing[] = [
  {
    source: "Bajo el neón te vi bailar",
    lang: "ES",
    english: "Neon on your skin, I watched you dance",
    emotion: "love",
    meaning: 93,
  },
  {
    source: "Saudade do que nunca foi",
    lang: "PT",
    english: "Longing for what never was",
    emotion: "melancholy",
    meaning: 71,
    lostWord: "Saudade",
    lost: "no English equivalent",
  },
  {
    source: "Wir tanzen bis der Himmel brennt",
    lang: "DE",
    english: "We dance till the sky burns",
    emotion: "heat",
    meaning: 90,
  },
  {
    source: "Je t'aime sous la pluie",
    lang: "FR",
    english: "I love you in the rain",
    emotion: "love",
    meaning: 88,
  },
];

const LINE_MS = 6000;
const HALF = 40; // half the ~80px transition band
const EASE = 0.12; // border catch-up toward target
const IDLE_MS = 2000;
const RESIST_PX = 72;

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function stripWord(w: string): string {
  return w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

/** The source line, splitting out a flagged word into a measurable span. */
function SourceText({
  line,
  wordRef,
}: {
  line: Crossing;
  wordRef: React.RefObject<HTMLSpanElement | null>;
}) {
  if (!line.lostWord) return <>{line.source}</>;
  const target = stripWord(line.lostWord);
  const tokens = line.source.split(/(\s+)/);
  let tagged = false;
  return (
    <>
      {tokens.map((tok, i) => {
        if (!tagged && stripWord(tok) === target) {
          tagged = true;
          return (
            <span key={i} ref={wordRef} data-lost-word>
              {tok}
            </span>
          );
        }
        return <span key={i}>{tok}</span>;
      })}
    </>
  );
}

/**
 * THE BORDER — one massive lyric rendered as two overlaid layers (source +
 * English) split by a vertical border whose X follows the cursor / touch-drag.
 * Left of the border shows the source language, right shows English, revealed by
 * clip-masks. An ~80px transition band blurs, RGB-splits, and washes the active
 * emotion accent through the letters crossing it. Idle ~2s → slow auto-sweep.
 * A flagged untranslatable word resists (glitches, never cleanly resolves) and
 * raises a LOST tag. Reduced-motion shows the fully-resolved English statically.
 */
export function KineticBorder() {
  const [idx, setIdx] = useState(0);
  const [reduce] = useState(prefersReduced);
  const line = LINES[idx];
  const accent = `var(--${line.emotion})`;

  const contRef = useRef<HTMLDivElement>(null);
  const srcRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<HTMLDivElement>(null);
  const bandSrcRef = useRef<HTMLDivElement>(null);
  const bandEngRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const meaningNumRef = useRef<HTMLSpanElement>(null);
  const lostRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);

  // Per-frame state held in refs so the animation never re-renders React.
  const wRef = useRef(0);
  const curRef = useRef(0);
  const tgtRef = useRef(0);
  const lastMoveRef = useRef(0);
  const downRef = useRef(false);
  const wordCenterRef = useRef<number | null>(null);
  const meaningRef = useRef(line.meaning);

  // Advance the line on a fixed cadence — never in reduced-motion (stays static).
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % LINES.length),
      LINE_MS,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  // Keep the meaning target current for the readout, and re-measure the word.
  useLayoutEffect(() => {
    meaningRef.current = line.meaning;
    const measure = () => {
      const cont = contRef.current;
      if (!cont) return;
      wRef.current = cont.clientWidth;
      if (wordRef.current) {
        const wr = wordRef.current.getBoundingClientRect();
        const cr = cont.getBoundingClientRect();
        wordCenterRef.current = wr.left - cr.left + wr.width / 2;
      } else {
        wordCenterRef.current = null;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (contRef.current) ro.observe(contRef.current);
    return () => ro.disconnect();
  }, [idx, line.meaning]);

  // The kinetic loop — only in full-motion mode.
  useEffect(() => {
    if (reduce) return;
    const cont = contRef.current;
    if (!cont) return;

    wRef.current = cont.clientWidth;
    curRef.current = wRef.current * 0.5;
    tgtRef.current = wRef.current * 0.5;
    lastMoveRef.current = performance.now();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && !downRef.current) return;
      const r = cont.getBoundingClientRect();
      tgtRef.current = Math.max(0, Math.min(r.width, e.clientX - r.left));
      lastMoveRef.current = performance.now();
    };
    const onDown = (e: PointerEvent) => {
      downRef.current = true;
      const r = cont.getBoundingClientRect();
      tgtRef.current = Math.max(0, Math.min(r.width, e.clientX - r.left));
      lastMoveRef.current = performance.now();
    };
    const onUp = () => {
      downRef.current = false;
    };
    cont.addEventListener("pointermove", onMove);
    cont.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    const setClip = (
      el: HTMLDivElement | null,
      l: number,
      r: number,
      w: number,
    ) => {
      if (!el) return;
      el.style.clipPath = `inset(0 ${Math.max(0, w - r)}px 0 ${Math.max(0, l)}px)`;
    };

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const now = performance.now();
      const t = (now - start) / 1000;
      const w = wRef.current;

      // Idle → slow auto-sweep so the border is alive on its own.
      if (now - lastMoveRef.current > IDLE_MS) {
        tgtRef.current = w * (0.5 + 0.36 * Math.sin(t * 0.6));
      }

      // Resistance near a flagged untranslatable word.
      const wc = wordCenterRef.current;
      let glitch = 0;
      let damp = 1;
      if (wc != null) {
        const d = curRef.current - wc;
        if (Math.abs(d) < RESIST_PX) {
          glitch = 1 - Math.abs(d) / RESIST_PX;
          damp = 0.22;
        }
      }
      curRef.current += (tgtRef.current - curRef.current) * EASE * damp;
      const x = curRef.current;

      setClip(srcRef.current, 0, x - HALF, w);
      setClip(engRef.current, x + HALF, w, w);
      setClip(bandSrcRef.current, x - HALF, x, w);
      setClip(bandEngRef.current, x, x + HALF, w);

      if (washRef.current) {
        washRef.current.style.transform = `translateX(${x - HALF}px)`;
      }
      if (lineRef.current) {
        lineRef.current.style.transform = `translateX(${x}px)`;
      }

      // Glitch jitter on the band + word while resisting.
      const jx = glitch > 0 ? (Math.random() - 0.5) * 7 * glitch : 0;
      const flick = glitch > 0 ? 0.55 + Math.random() * 0.45 : 1;
      if (bandSrcRef.current) {
        bandSrcRef.current.style.transform = `translateX(${jx}px)`;
        bandSrcRef.current.style.opacity = String(flick);
      }
      if (bandEngRef.current) {
        bandEngRef.current.style.transform = `translateX(${-jx}px)`;
        bandEngRef.current.style.opacity = String(flick);
      }
      if (wordRef.current) {
        wordRef.current.style.opacity = String(0.4 + 0.6 * (1 - glitch));
        wordRef.current.style.textShadow =
          glitch > 0
            ? `${2 * glitch}px 0 rgba(255,77,128,0.7), ${-2 * glitch}px 0 rgba(94,159,203,0.7)`
            : "none";
      }
      if (lostRef.current) {
        lostRef.current.style.opacity = String(glitch);
        if (wc != null) {
          lostRef.current.style.transform = `translateX(${wc}px)`;
        }
      }

      // MEANING readout ticks by border progress, tracking with the seam.
      const progress = w > 0 ? Math.max(0, Math.min(1, x / w)) : 0;
      if (meaningNumRef.current) {
        meaningNumRef.current.textContent = `${Math.round(progress * meaningRef.current)}%`;
      }
      if (readoutRef.current) {
        const rx = Math.max(64, Math.min(w - 64, x));
        readoutRef.current.style.transform = `translateX(${rx}px)`;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      cont.removeEventListener("pointermove", onMove);
      cont.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [reduce]);

  // Reduced motion: fully-resolved English, statically.
  if (reduce) {
    return (
      <div className="flex w-full max-w-4xl flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
          <span>{line.lang}</span>
          <span aria-hidden>→</span>
          <span>EN</span>
        </div>
        <p
          className="font-serif leading-[1.06] text-text"
          style={{ fontSize: "clamp(2rem, 6vw, 5rem)" }}
        >
          {line.english}
        </p>
        <span
          className="font-mono text-[11px] uppercase tracking-[0.24em]"
          style={{ color: accent }}
        >
          MEANING {line.meaning}%
        </span>
        {line.lost && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            <span className="mr-1.5 opacity-70">LOST:</span>
            {line.lostWord} — {line.lost}
          </span>
        )}
      </div>
    );
  }

  const layerClass =
    "pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center font-serif leading-[1.06]";
  const layerStyle = { fontSize: "clamp(2rem, 6vw, 5rem)" } as const;

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-6">
      {/* lang pair */}
      <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
        <span>{line.lang}</span>
        <span aria-hidden>→</span>
        <span>EN</span>
      </div>

      {/* The crossing field — pointer target */}
      <div
        ref={contRef}
        className="relative w-full cursor-ew-resize select-none"
        style={{ height: "clamp(8rem, 22vh, 16rem)", touchAction: "pan-y" }}
        role="img"
        aria-label={`${line.source} — ${line.english}`}
      >
        {/* SOURCE layer (left of border) */}
        <div
          ref={srcRef}
          className={layerClass}
          style={{ ...layerStyle, color: "var(--text-dim)" }}
        >
          <p>
            <SourceText line={line} wordRef={wordRef} />
          </p>
        </div>

        {/* ENGLISH layer (right of border) */}
        <div
          ref={engRef}
          className={layerClass}
          style={{ ...layerStyle, color: "var(--text)" }}
        >
          <p>{line.english}</p>
        </div>

        {/* transition-band wash: blurs + accent-washes the seam */}
        <div
          ref={washRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: `${HALF * 2}px`,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            background: `color-mix(in srgb, ${accent} 22%, transparent)`,
            mixBlendMode: "screen",
          }}
        />

        {/* band letters — accent + RGB split (crisp, over the blurred wash) */}
        <div
          ref={bandSrcRef}
          className={layerClass}
          style={{
            ...layerStyle,
            color: accent,
            textShadow:
              "2px 0 rgba(255,77,128,0.55), -2px 0 rgba(94,159,203,0.55)",
          }}
        >
          <p>
            <SourceText line={line} wordRef={null as never} />
          </p>
        </div>
        <div
          ref={bandEngRef}
          className={layerClass}
          style={{
            ...layerStyle,
            color: accent,
            textShadow:
              "2px 0 rgba(255,77,128,0.55), -2px 0 rgba(94,159,203,0.55)",
          }}
        >
          <p>{line.english}</p>
        </div>

        {/* the border line + handle */}
        <div
          ref={lineRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-px"
          style={{
            background: `linear-gradient(to bottom, transparent, ${accent}, transparent)`,
            boxShadow: `0 0 12px 1px color-mix(in srgb, ${accent} 60%, transparent)`,
          }}
        >
          <span
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: accent }}
          />
        </div>

        {/* MEANING readout, riding the seam */}
        <div
          ref={readoutRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 -translate-x-1/2"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
            MEANING{" "}
            <span ref={meaningNumRef} style={{ color: accent }}>
              0%
            </span>
          </span>
        </div>

        {/* LOST tag, fading in as the border nears the untranslatable word */}
        {line.lost && (
          <div
            ref={lostRef}
            aria-hidden
            className="pointer-events-none absolute bottom-1 left-0 -translate-x-1/2 whitespace-nowrap opacity-0"
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              <span className="mr-1.5 opacity-70">LOST:</span>
              {line.lost}
            </span>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        Drag across the line — watch it cross
      </p>
    </div>
  );
}

export default KineticBorder;
