import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useResound } from "@/context/useResound";
import showcaseSong from "@/fixtures/showcase";
import type { Emotion, Line } from "@/types";
import { resolveDrained, resolveEmotionColor } from "@/lib/colors";

type Mode = "literal" | "reborn";

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

/** Seconds -> "MM:SS:mmm". */
function formatTimecode(t: number): string {
  const safe = Math.max(0, t);
  const mm = Math.floor(safe / 60);
  const ss = Math.floor(safe % 60);
  const mmm = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${pad2(mm)}:${pad2(ss)}:${pad3(mmm)}`;
}

/** Per-line meaning fallback: reborn lift if present, else the literal score. */
const lineLiteralMeaning = (l: Line) => l.fidelity?.meaning ?? 0;
const lineRebornMeaning = (l: Line) =>
  l.rebornFidelity?.meaning ?? l.fidelity?.meaning ?? 0;

/** A percentage that eases to its target whenever the target changes (the
 * "rolling" meaning number judges watch lift on toggle). */
function RollingPercent({
  target,
  className,
  style,
}: {
  target: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = display;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    const dur = 320;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out, mirrors var(--ease)
      setDisplay(from + (to - from) * e);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <span className={className} style={style}>
      {Math.round(display * 100)}
    </span>
  );
}

function LyricRow({
  line,
  mode,
  active,
  accent,
  drained,
}: {
  line: Line;
  mode: Mode;
  active: boolean;
  accent: string;
  drained: string;
}) {
  const literalText = line.translation;
  const rebornText = line.localized || line.translation;
  const literalMeaning = lineLiteralMeaning(line);
  const rebornMeaning = lineRebornMeaning(line);
  const delta = Math.round((rebornMeaning - literalMeaning) * 100);

  const isReborn = mode === "reborn";
  const barFrac = isReborn ? rebornMeaning : literalMeaning;
  const targetMeaning = isReborn ? rebornMeaning : literalMeaning;

  return (
    <div
      className="border-l-2 py-4 pl-5 pr-4 transition-colors duration-[280ms]"
      style={{
        borderLeftColor: active ? accent : "var(--line)",
        backgroundColor: active ? "var(--surface)" : "transparent",
        transitionTimingFunction: "var(--ease)",
      }}
    >
      {/* SOURCE line — always shown. */}
      <p className="font-serif text-xl leading-snug text-text">{line.source}</p>

      {/* Rendering crossfade: literal + reborn stacked in the same grid cell. */}
      <div className="mt-1 grid">
        <p
          className="font-sans text-base leading-snug text-text-dim transition-opacity duration-[320ms]"
          style={{
            gridArea: "1 / 1",
            opacity: isReborn ? 0 : 1,
            transitionTimingFunction: "var(--ease)",
          }}
          aria-hidden={isReborn}
        >
          {literalText}
        </p>
        <p
          className="font-sans text-base leading-snug transition-opacity duration-[320ms]"
          style={{
            gridArea: "1 / 1",
            opacity: isReborn ? 1 : 0,
            color: accent,
            transitionTimingFunction: "var(--ease)",
          }}
          aria-hidden={!isReborn}
        >
          {rebornText}
        </p>
      </div>

      {/* Saturation bar + meaning score. */}
      <div className="mt-3 flex items-center gap-4">
        <div className="h-[3px] flex-1 overflow-hidden bg-surface-2">
          <div
            className="h-full transition-[width,background-color] duration-[320ms]"
            style={{
              width: `${Math.round(barFrac * 100)}%`,
              backgroundColor: isReborn ? accent : drained,
              transitionTimingFunction: "var(--ease)",
            }}
          />
        </div>
        <div className="flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
          <RollingPercent
            target={targetMeaning}
            style={{ color: isReborn ? accent : "var(--text-dim)" }}
          />
          <span style={{ color: isReborn ? accent : "var(--text-dim)" }}>%</span>
          {isReborn && delta > 0 && (
            <span className="text-[10px]" style={{ color: accent }}>
              ↑{delta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RebirthView() {
  const { isPlaying, setIsPlaying, setActiveEmotion, setTimecode, setResonance } =
    useResound();

  const song = showcaseSong;
  const { lines, rebirthAudioUrl, rebirthOffsetMs, durationMs, singability } =
    song;
  const durationSec = durationMs / 1000;
  const offsetSec = (rebirthOffsetMs ?? 0) / 1000;

  const [mode, setMode] = useState<Mode>("literal");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [noAudio, setNoAudio] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const clockRef = useRef<{ tSec: number; emotion: Emotion }>({
    tSec: 0,
    emotion: lines[0]?.emotion ?? "joy",
  });
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const modeRef = useRef<"audio" | "synthetic">("synthetic");

  // Literal vs reborn average meaning (the headline lift).
  const { literalAvg, rebornAvg } = useMemo(() => {
    if (!lines.length) return { literalAvg: 0, rebornAvg: 0 };
    const lit =
      lines.reduce((s, l) => s + lineLiteralMeaning(l), 0) / lines.length;
    const reb =
      lines.reduce((s, l) => s + lineRebornMeaning(l), 0) / lines.length;
    return { literalAvg: lit, rebornAvg: reb };
  }, [lines]);

  // Resolve every emotion accent once (helper reads computed CSS vars; keep it
  // out of the per-frame render path).
  const emotionColors = useMemo(() => {
    const all: Emotion[] = ["joy", "heat", "love", "calm", "melancholy"];
    return all.reduce(
      (acc, e) => {
        acc[e] = resolveEmotionColor(e);
        return acc;
      },
      {} as Record<Emotion, string>,
    );
  }, []);
  const accent = emotionColors[lines[currentIndex]?.emotion ?? "joy"];
  const drained = useMemo(() => resolveDrained(), []);

  // Playback always shows the reborn rendering; the toggle is locked while playing.
  const effectiveMode: Mode = isPlaying ? "reborn" : mode;

  const findLineIndex = (t: number): number => {
    if (!lines.length) return 0;
    const i = lines.findIndex((l) => t >= l.tStart && t < l.tEnd);
    if (i !== -1) return i;
    return t >= lines[lines.length - 1].tEnd ? lines.length - 1 : 0;
  };

  // On mount: seed HUD readouts and detect missing/broken rebirth audio.
  useEffect(() => {
    setTimecode(formatTimecode(0));
    setActiveEmotion(lines[0]?.emotion ?? "joy");
    if (!rebirthAudioUrl) setNoAudio(true);

    const audio = audioRef.current;
    const onMediaError = () => {
      modeRef.current = "synthetic";
      setNoAudio(true);
    };
    audio?.addEventListener("error", onMediaError);

    return () => {
      audio?.removeEventListener("error", onMediaError);
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resonance readout tracks the currently shown rendering's meaning.
  useEffect(() => {
    setResonance(effectiveMode === "reborn" ? rebornAvg : literalAvg);
  }, [effectiveMode, rebornAvg, literalAvg, setResonance]);

  // Drive the clock while playing (rebirth audio, else synthetic RAF).
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.pause();
      return;
    }

    lastTsRef.current = performance.now();

    const audio = audioRef.current;
    if (audio && !noAudio) {
      try {
        audio.currentTime = offsetSec;
      } catch {
        /* setting currentTime before metadata can throw; ignore */
      }
      audio
        .play()
        .then(() => {
          modeRef.current = "audio";
        })
        .catch(() => {
          modeRef.current = "synthetic";
          setNoAudio(true);
        });
    } else {
      modeRef.current = "synthetic";
    }

    const tick = (ts: number) => {
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      let t = clockRef.current.tSec;
      const el = audioRef.current;
      const audioUsable =
        modeRef.current === "audio" &&
        el != null &&
        !el.paused &&
        !el.error &&
        el.readyState >= 2;

      if (audioUsable) {
        const raw = el.currentTime - offsetSec;
        t =
          durationSec > 0
            ? ((raw % durationSec) + durationSec) % durationSec
            : 0;
      } else {
        t = durationSec > 0 ? (t + dt) % durationSec : 0;
      }

      clockRef.current.tSec = t;
      const idx = findLineIndex(t);
      const emo = lines[idx]?.emotion ?? clockRef.current.emotion;
      clockRef.current.emotion = emo;

      setActiveEmotion(emo);
      setTimecode(formatTimecode(t));
      setCurrentIndex(idx);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, noAudio]);

  if (!lines.length) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
          No lyric data.
        </p>
      </div>
    );
  }

  const langPair = `${song.sourceLang.toUpperCase()} → ${song.targetLang.toUpperCase()}`;

  return (
    <div className="relative flex h-screen w-full flex-col px-8 pb-24 pt-20 md:px-14">
      <audio
        ref={audioRef}
        src={rebirthAudioUrl}
        preload="auto"
        className="hidden"
      >
        <track kind="captions" />
      </audio>

      {/* HEADER */}
      <header className="shrink-0">
        <h1 className="font-serif text-4xl leading-none text-text md:text-5xl">
          Rebirth
        </h1>
        <p className="mt-2 font-sans text-sm text-text-dim">
          <span className="text-text">{song.title}</span>
          <span className="mx-2 text-text-faint">·</span>
          {song.artist}
          <span className="mx-2 text-text-faint">·</span>
          <span className="font-mono uppercase tracking-[0.12em]">
            {langPair}
          </span>
        </p>
      </header>

      {/* CONTROLS */}
      <div className="mt-6 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-4">
        {/* Segmented toggle */}
        <div
          className="inline-flex border border-line"
          style={{ borderRadius: 2 }}
          role="group"
          aria-label="Rendering mode"
        >
          {(["literal", "reborn"] as Mode[]).map((m) => {
            const isActive = effectiveMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (!isPlaying) setMode(m);
                }}
                disabled={isPlaying}
                aria-pressed={isActive}
                className="px-4 py-1.5 font-mono text-xs uppercase transition-colors duration-[280ms] disabled:cursor-not-allowed"
                style={{
                  letterSpacing: "0.12em",
                  color: isActive ? accent : "var(--text-faint)",
                  backgroundColor: isActive ? "var(--surface-2)" : "transparent",
                  transitionTimingFunction: "var(--ease)",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>

        {/* HEAR THE REBIRTH */}
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-pressed={isPlaying}
          className="border border-line bg-transparent px-5 py-2 font-mono text-xs uppercase tracking-[0.16em] text-text transition-colors duration-[280ms] hover:bg-surface-2"
          style={{
            borderRadius: 2,
            borderColor: isPlaying ? accent : undefined,
            transitionTimingFunction: "var(--ease)",
          }}
        >
          {isPlaying ? "Pause Rebirth" : "Hear the Rebirth"}
        </button>

        {/* FIDELITY-LIFT readout */}
        <div className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
          Meaning {Math.round(literalAvg * 100)}{" "}
          <span className="text-text-faint">→</span>{" "}
          <span style={{ color: accent }}>{Math.round(rebornAvg * 100)}</span>
        </div>

        {noAudio && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            No Rebirth Audio — Follow-Along Mode
          </span>
        )}
      </div>

      {/* SINGABILITY PANEL */}
      <div className="mt-5 flex shrink-0 flex-wrap gap-x-8 gap-y-2 border border-line px-5 py-3 font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
        <span>
          Syllables{" "}
          <span className="text-text">
            {singability.syllableSource}/{singability.syllableLocalized}
          </span>
        </span>
        <span>
          Rhyme{" "}
          <span style={{ color: singability.rhyme ? accent : "var(--drained)" }}>
            {singability.rhyme ? "✓" : "✗"}
          </span>
        </span>
        <span>
          Stress Match{" "}
          <span className="text-text">{singability.stressMatch}%</span>
        </span>
      </div>

      {/* LYRIC TRANSFORM */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col">
          {lines.map((line, i) => (
            <LyricRow
              key={line.id}
              line={line}
              mode={effectiveMode}
              active={isPlaying && i === currentIndex}
              accent={emotionColors[line.emotion]}
              drained={drained}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default RebirthView;
