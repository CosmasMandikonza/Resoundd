import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Emotion } from "@/types";

interface Crossing {
  source: string;
  lang: string;
  english: string;
  emotion: Emotion;
  meaning: number;
  lost?: string;
}

/** Original illustrative lines (not real song lyrics). */
const LINES: Crossing[] = [
  {
    source: "Bajo el neón te vi bailar",
    lang: "ES",
    english: "Neon on your skin, I watched you dance",
    emotion: "love",
    meaning: 93,
  },
  {
    source: "Wir tanzen bis der Himmel brennt",
    lang: "DE",
    english: "We dance till the sky burns",
    emotion: "heat",
    meaning: 90,
  },
  {
    source: "Saudade do que nunca foi",
    lang: "PT",
    english: "Longing for what never was",
    emotion: "melancholy",
    meaning: 71,
    lost: "'saudade' has no English equivalent",
  },
  {
    source: "Je t'aime sous la pluie",
    lang: "FR",
    english: "I love you in the rain",
    emotion: "love",
    meaning: 88,
  },
];

const SOURCE_MS = 1700;
const RESOLVE_MS = 900;
const TOTAL_MS = 4200;
const EASE = [0.22, 1, 0.36, 1] as const;

export function LyricCrossing() {
  const [idx, setIdx] = useState(0);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    setResolved(false);
    const t1 = window.setTimeout(() => setResolved(true), SOURCE_MS);
    const t2 = window.setTimeout(
      () => setIdx((i) => (i + 1) % LINES.length),
      TOTAL_MS,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [idx]);

  const line = LINES[idx];
  const accent = `var(--${line.emotion})`;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5 text-center">
      <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
        <span>{line.lang}</span>
        <span aria-hidden>→</span>
        <span>EN</span>
      </div>

      <div className="relative flex min-h-[5rem] w-full items-center justify-center">
        <AnimatePresence mode="wait">
          {!resolved ? (
            <motion.p
              key={`s-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(5px)" }}
              transition={{ duration: RESOLVE_MS / 1000, ease: EASE }}
              className="font-serif text-[1.7rem] leading-snug md:text-4xl"
              style={{ color: accent }}
            >
              {line.source}
            </motion.p>
          ) : (
            <motion.p
              key={`e-${idx}`}
              initial={{ opacity: 0, filter: "blur(5px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: RESOLVE_MS / 1000, ease: EASE }}
              className="font-serif text-[1.7rem] leading-snug text-text md:text-4xl"
            >
              {line.english}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-[2.5rem] flex-col items-center gap-1.5">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.24em]"
          style={{ color: accent }}
        >
          MEANING {line.meaning}%
        </span>
        <AnimatePresence>
          {line.lost && resolved && (
            <motion.span
              key={`l-${idx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              <span className="mr-1.5 opacity-70">LOST:</span>
              {line.lost}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default LyricCrossing;
