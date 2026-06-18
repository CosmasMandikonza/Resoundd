import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useResound } from "@/context/useResound";
import type { Emotion, Line } from "@/types";
import { resolveDrained, resolveEmotionColor } from "@/lib/colors";

type ABMode = "original" | "reborn";

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

function formatTimecode(t: number): string {
  const safe = Math.max(0, t);
  const mm = Math.floor(safe / 60);
  const ss = Math.floor(safe % 60);
  const mmm = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${pad2(mm)}:${pad2(ss)}:${pad3(mmm)}`;
}

const lineLiteralMeaning = (l: Line) => l.fidelity?.meaning ?? 0;
const lineRebornMeaning = (l: Line) =>
  l.rebornFidelity?.meaning ?? l.fidelity?.meaning ?? 0;

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
      const e = 1 - Math.pow(1 - p, 3);
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

/** Animated stem-deconstruct visualization shown when LALAL stems are available. */
function StemDeconstruct({ accent }: { accent: string }) {
  const [phase, setPhase] = useState<"whole" | "split">("whole");

  useEffect(() => {
    const t = setTimeout(() => setPhase("split"), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="shrink-0 border border-line px-5 py-3">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
        LALAL.AI · Stem Separation
      </p>
      {/* Animated bars */}
      <div
        className="flex h-6 overflow-hidden"
        style={{ gap: phase === "split" ? 3 : 0, borderRadius: 2, transition: "gap 700ms cubic-bezier(0.25,0,0,1)" }}
      >
        {/* Vocal bar */}
        <div
          className="h-full transition-[flex-grow] duration-[700ms]"
          style={{
            flexGrow: phase === "split" ? 0.38 : 0.5,
            backgroundColor: accent,
            opacity: phase === "split" ? 0.8 : 0.55,
            borderRadius: 2,
            transitionTimingFunction: "cubic-bezier(0.25,0,0,1)",
          }}
        />
        {/* Instrumental bar */}
        <div
          className="h-full transition-[flex-grow] duration-[700ms]"
          style={{
            flexGrow: phase === "split" ? 0.62 : 0.5,
            backgroundColor: "var(--text-dim)",
            opacity: phase === "split" ? 0.32 : 0.55,
            borderRadius: 2,
            transitionTimingFunction: "cubic-bezier(0.25,0,0,1)",
          }}
        />
      </div>
      {/* Labels */}
      <div
        className="mt-1.5 flex font-mono text-[9px] uppercase tracking-[0.16em] transition-opacity duration-[400ms]"
        style={{ opacity: phase === "split" ? 1 : 0 }}
      >
        <span style={{ flex: 0.38, color: accent }}>Vocal</span>
        <span
          style={{ flex: 0.62, textAlign: "right", color: "var(--text-faint)" }}
        >
          Instrumental
        </span>
      </div>
    </div>
  );
}

/** Real-time waveform drawn from a Web Audio AnalyserNode. */
function WaveformCanvas({
  analyser,
  accent,
  active,
}: {
  analyser: AnalyserNode | null;
  accent: string;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const canvas = canvasRef.current;
    if (!canvas || !analyser || !active) {
      // Render a flat line when inactive.
      if (canvas) {
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
          ctx2d.beginPath();
          ctx2d.strokeStyle = accent;
          ctx2d.lineWidth = 1;
          ctx2d.globalAlpha = 0.25;
          ctx2d.moveTo(0, canvas.height / 2);
          ctx2d.lineTo(canvas.width, canvas.height / 2);
          ctx2d.stroke();
          ctx2d.globalAlpha = 1;
        }
      }
      return;
    }

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteTimeDomainData(data);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.beginPath();
      ctx2d.strokeStyle = accent;
      ctx2d.lineWidth = 1.5;
      ctx2d.globalAlpha = 0.85;

      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * canvas.width;
        const y = ((data[i] / 128.0) - 1) * (canvas.height / 2) + canvas.height / 2;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [analyser, accent, active]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={36}
      className="w-full"
      style={{ display: "block" }}
      aria-hidden
    />
  );
}

function LyricRow({
  line,
  abMode,
  active,
  accent,
  drained,
}: {
  line: Line;
  abMode: ABMode;
  active: boolean;
  accent: string;
  drained: string;
}) {
  const literalText = line.translation;
  const rebornText = line.localized || line.translation;
  const literalMeaning = lineLiteralMeaning(line);
  const rebornMeaning = lineRebornMeaning(line);
  const delta = Math.round((rebornMeaning - literalMeaning) * 100);

  const isReborn = abMode === "reborn";
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
      <p className="font-serif text-xl leading-snug text-text">{line.source}</p>

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
  const {
    isPlaying,
    setIsPlaying,
    setActiveEmotion,
    setTimecode,
    setResonance,
    song,
    isLive,
    isGeneratingRebirth,
    generateRebirth,
  } = useResound();

  const {
    lines,
    rebirthAudioUrl,
    rebirthOffsetMs,
    durationMs,
    singability,
    stems,
    previewUrl,
    previewOffsetMs,
  } = song;

  const durationSec = durationMs / 1000;
  const rebirthOffsetSec = (rebirthOffsetMs ?? 0) / 1000;
  const previewOffsetSec = (previewOffsetMs ?? 0) / 1000;

  const [abMode, setAbMode] = useState<ABMode>(
    rebirthAudioUrl ? "reborn" : "original",
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [noRebirth, setNoRebirth] = useState(!rebirthAudioUrl);
  const [noOriginal, setNoOriginal] = useState(!previewUrl);
  const [generateError, setGenerateError] = useState(false);

  // Web Audio state.
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceConnectedRef = useRef(false);

  const vocalAudioRef = useRef<HTMLAudioElement>(null);
  const instrAudioRef = useRef<HTMLAudioElement>(null);
  const origAudioRef = useRef<HTMLAudioElement>(null);

  const clockRef = useRef<{ tSec: number; emotion: Emotion }>({
    tSec: 0,
    emotion: lines[0]?.emotion ?? "joy",
  });
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const modeRef = useRef<"audio" | "synthetic">("synthetic");

  // Literal vs reborn average meaning for the headline lift.
  const { literalAvg, rebornAvg } = useMemo(() => {
    if (!lines.length) return { literalAvg: 0, rebornAvg: 0 };
    const lit =
      lines.reduce((s, l) => s + lineLiteralMeaning(l), 0) / lines.length;
    const reb =
      lines.reduce((s, l) => s + lineRebornMeaning(l), 0) / lines.length;
    return { literalAvg: lit, rebornAvg: reb };
  }, [lines]);

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

  const findLineIndex = useCallback(
    (t: number): number => {
      if (!lines.length) return 0;
      const i = lines.findIndex((l) => t >= l.tStart && t < l.tEnd);
      if (i !== -1) return i;
      return t >= lines[lines.length - 1].tEnd ? lines.length - 1 : 0;
    },
    [lines],
  );

  // When song changes (new analysis), reset abMode to match availability.
  useEffect(() => {
    setAbMode(rebirthAudioUrl ? "reborn" : "original");
    setNoRebirth(!rebirthAudioUrl);
    setNoOriginal(!previewUrl);
    setGenerateError(false);
  }, [song.id, rebirthAudioUrl, previewUrl]);

  // Seed HUD.
  useEffect(() => {
    setTimecode(formatTimecode(0));
    setActiveEmotion(lines[0]?.emotion ?? "joy");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // Resonance readout tracks the shown rendering's meaning.
  useEffect(() => {
    setResonance(abMode === "reborn" ? rebornAvg : literalAvg);
  }, [abMode, rebornAvg, literalAvg, setResonance]);

  /** Set up Web Audio analyser on the vocal element (once per element). */
  const setupAudioContext = useCallback(() => {
    const vocalEl = vocalAudioRef.current;
    if (!vocalEl || sourceConnectedRef.current) return;
    try {
      const ctx = new AudioContext();
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 512;
      const source = ctx.createMediaElementSource(vocalEl);
      source.connect(analyserNode);
      analyserNode.connect(ctx.destination);
      audioCtxRef.current = ctx;
      sourceConnectedRef.current = true;
      setAnalyser(analyserNode);
    } catch {
      // Web Audio not available or crossOrigin blocked — waveform degrades silently.
    }
  }, []);

  // Teardown AudioContext on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => null);
    };
  }, []);

  // Main playback driver.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      vocalAudioRef.current?.pause();
      instrAudioRef.current?.pause();
      origAudioRef.current?.pause();
      return;
    }

    lastTsRef.current = performance.now();

    // Determine which audio elements to use.
    const useReborn = abMode === "reborn";
    const masterEl = useReborn ? vocalAudioRef.current : origAudioRef.current;
    const instrEl = useReborn ? instrAudioRef.current : null;
    const offsetSec = useReborn ? rebirthOffsetSec : previewOffsetSec;
    const hasAudio = useReborn ? !noRebirth : !noOriginal;

    if (masterEl && hasAudio) {
      try {
        masterEl.currentTime = offsetSec;
      } catch {
        /* ignore */
      }
      if (instrEl) {
        try {
          instrEl.currentTime = offsetSec;
        } catch {
          /* ignore */
        }
      }

      if (useReborn) {
        // Set up Web Audio analyser on first REBORN play.
        setupAudioContext();
        if (audioCtxRef.current?.state === "suspended") {
          audioCtxRef.current.resume().catch(() => null);
        }
      }

      const startPromises: Promise<void>[] = [
        masterEl.play().catch(() => {
          modeRef.current = "synthetic";
          if (useReborn) setNoRebirth(true);
          else setNoOriginal(true);
        }),
      ];
      if (instrEl) {
        startPromises.push(instrEl.play().catch(() => undefined));
      }

      void Promise.all(startPromises).then(() => {
        modeRef.current = "audio";
      });
    } else {
      modeRef.current = "synthetic";
    }

    const tick = (ts: number) => {
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      let t = clockRef.current.tSec;
      const el = useReborn ? vocalAudioRef.current : origAudioRef.current;
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

        // Keep instrumental in sync with vocal (correct >150ms drift).
        if (instrEl && !instrEl.paused && instrEl.readyState >= 2) {
          const drift = Math.abs(instrEl.currentTime - el.currentTime);
          if (drift > 0.15) {
            try {
              instrEl.currentTime = el.currentTime;
            } catch {
              /* ignore */
            }
          }
        }
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
  }, [isPlaying, abMode, noRebirth, noOriginal]);

  const handleGenerate = useCallback(async () => {
    setGenerateError(false);
    await generateRebirth();
    // After generation, check if a URL is now available.
    // The context patches song.rebirthAudioUrl on success.
  }, [generateRebirth]);

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
  const hasRebirthAudio = !noRebirth && !!rebirthAudioUrl;
  const showGenerate =
    isLive && !hasRebirthAudio && !isGeneratingRebirth;
  const waveformActive = isPlaying && abMode === "reborn" && hasRebirthAudio;

  return (
    <div className="relative flex h-screen w-full flex-col px-8 pb-24 pt-20 md:px-14">
      {/* Hidden audio elements */}
      {/* Vocal: crossOrigin="anonymous" required for Web Audio AnalyserNode on /api/media files */}
      <audio
        ref={vocalAudioRef}
        src={rebirthAudioUrl ?? undefined}
        preload={rebirthAudioUrl ? "auto" : "none"}
        crossOrigin="anonymous"
        onError={() => setNoRebirth(true)}
        className="hidden"
      >
        <track kind="captions" />
      </audio>
      {/* Instrumental stem */}
      <audio
        ref={instrAudioRef}
        src={stems?.instrumentalUrl ?? undefined}
        preload={stems?.instrumentalUrl ? "auto" : "none"}
        className="hidden"
      >
        <track kind="captions" />
      </audio>
      {/* Original iTunes preview */}
      <audio
        ref={origAudioRef}
        src={previewUrl ?? undefined}
        preload={previewUrl ? "auto" : "none"}
        onError={() => setNoOriginal(true)}
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
          <span className="font-mono uppercase tracking-[0.12em]">{langPair}</span>
        </p>
      </header>

      {/* STEM DECONSTRUCT — shown when LALAL stems are available */}
      {stems && (
        <div className="mt-5">
          <StemDeconstruct accent={accent} />
        </div>
      )}

      {/* CONTROLS */}
      <div className="mt-5 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-4">
        {/* A/B toggle: ORIGINAL | REBORN */}
        <div
          className="inline-flex border border-line"
          style={{ borderRadius: 2 }}
          role="group"
          aria-label="Audio mode"
        >
          {(["original", "reborn"] as ABMode[]).map((m) => {
            const isActive = abMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (!isPlaying) setAbMode(m);
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

        {/* Play / Generate button */}
        {showGenerate ? (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="border border-line bg-transparent px-5 py-2 font-mono text-xs uppercase tracking-[0.16em] text-text transition-colors duration-[280ms] hover:bg-surface-2"
            style={{ borderRadius: 2, borderColor: accent }}
          >
            Generate Rebirth
          </button>
        ) : isGeneratingRebirth ? (
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
            Generating…
          </span>
        ) : (
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
            {isPlaying
              ? "Pause"
              : abMode === "reborn"
                ? "Hear the Rebirth"
                : "Hear the Original"}
          </button>
        )}

        {/* Fidelity-lift readout */}
        <div className="font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
          Meaning {Math.round(literalAvg * 100)}{" "}
          <span className="text-text-faint">→</span>{" "}
          <span style={{ color: accent }}>{Math.round(rebornAvg * 100)}</span>
        </div>

        {generateError && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            Generation unavailable — follow-along mode
          </span>
        )}

        {abMode === "reborn" && noRebirth && !isLive && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            No Rebirth Audio — Follow-Along Mode
          </span>
        )}

        {abMode === "original" && noOriginal && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            No Preview Audio — Follow-Along Mode
          </span>
        )}
      </div>

      {/* WAVEFORM CANVAS — real-time Web Audio waveform (REBORN + playing) */}
      <div
        className="mt-4 shrink-0 overflow-hidden border border-line px-5 py-2 transition-opacity duration-[400ms]"
        style={{ opacity: waveformActive ? 1 : 0.2, borderRadius: 2 }}
        aria-hidden
      >
        <WaveformCanvas analyser={analyser} accent={accent} active={waveformActive} />
      </div>

      {/* SINGABILITY PANEL */}
      <div className="mt-4 flex shrink-0 flex-wrap gap-x-8 gap-y-2 border border-line px-5 py-3 font-mono text-xs uppercase tracking-[0.12em] text-text-dim">
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

      {/* LYRIC TRANSFORM FEED */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col">
          {lines.map((line, i) => (
            <LyricRow
              key={line.id}
              line={line}
              abMode={abMode}
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
