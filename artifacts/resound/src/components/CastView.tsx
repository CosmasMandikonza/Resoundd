import { useEffect, useMemo, useRef, useState } from "react";
import { useResound } from "@/context/useResound";
import { resolveDrained, resolveEmotionColor } from "@/lib/colors";
import Fingerprint, { type ClockState } from "@/components/cast/Fingerprint";
import HarmonicArcs from "@/components/cast/HarmonicArcs";

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

export function CastView() {
  const {
    isPlaying,
    togglePlaying,
    setActiveEmotion,
    setTimecode,
    setResonance,
    song,
  } = useResound();

  const { lines, fingerprint, durationMs, previewUrl, overallFidelity } = song;
  const emotionSource = song.emotionSource;
  const durationSec = durationMs / 1000;

  // Two derived market fidelities so the flanking spheres visibly differ.
  const { leftMarketFidelity, rightMarketFidelity } = useMemo(() => {
    if (!lines.length) return { leftMarketFidelity: 1, rightMarketFidelity: 1 };
    const meanOf = (key: "meaning" | "culture") =>
      lines.reduce((s, l) => s + (l.fidelity?.[key] ?? 0), 0) / lines.length;
    return {
      leftMarketFidelity: meanOf("meaning"),
      rightMarketFidelity: meanOf("culture"),
    };
  }, [lines]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const clockRef = useRef<ClockState>({
    tSec: 0,
    emotion: lines[0]?.emotion ?? "joy",
  });
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const modeRef = useRef<"audio" | "synthetic">("synthetic");

  const [playheadSec, setPlayheadSec] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [noPreview, setNoPreview] = useState(false);

  const findLineIndex = (t: number): number => {
    if (!lines.length) return 0;
    const i = lines.findIndex((l) => t >= l.tStart && t < l.tEnd);
    if (i !== -1) return i;
    return t >= lines[lines.length - 1].tEnd ? lines.length - 1 : 0;
  };

  // On mount: seed HUD readouts and detect a missing/broken preview.
  useEffect(() => {
    setResonance(overallFidelity.meaning);
    setTimecode(formatTimecode(0));
    setActiveEmotion(lines[0]?.emotion ?? "joy");
    if (!previewUrl) setNoPreview(true);

    // Any media load failure drops to synthetic follow-along mode.
    const audio = audioRef.current;
    const onMediaError = () => {
      modeRef.current = "synthetic";
      setNoPreview(true);
    };
    audio?.addEventListener("error", onMediaError);

    return () => {
      audio?.removeEventListener("error", onMediaError);
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the clock while playing (audio currentTime, else synthetic RAF).
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.pause();
      return;
    }

    lastTsRef.current = performance.now();
    const audio = audioRef.current;
    if (audio && !noPreview) {
      audio
        .play()
        .then(() => {
          modeRef.current = "audio";
        })
        .catch(() => {
          modeRef.current = "synthetic";
          setNoPreview(true);
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
        const dur =
          Number.isFinite(el.duration) && el.duration > 0
            ? el.duration
            : durationSec;
        t = dur > 0 ? ((el.currentTime % dur) / dur) * durationSec : 0;
      } else {
        t = durationSec > 0 ? (t + dt) % durationSec : 0;
      }

      clockRef.current.tSec = t;
      const idx = findLineIndex(t);
      const emo = lines[idx]?.emotion ?? clockRef.current.emotion;
      clockRef.current.emotion = emo;

      setActiveEmotion(emo);
      setTimecode(formatTimecode(t));
      setPlayheadSec(t);
      setCurrentIndex(idx);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, noPreview]);

  const currentLine = lines[currentIndex] ?? null;
  const accent = useMemo(
    () => resolveEmotionColor(currentLine?.emotion ?? "joy"),
    [currentLine?.emotion],
  );
  const drained = useMemo(() => resolveDrained(), []);
  const playheadFrac = durationSec > 0 ? playheadSec / durationSec : 0;

  return (
    <div className="relative flex h-screen w-full flex-col px-8 pb-24 pt-20 md:px-14">
      <audio ref={audioRef} src={previewUrl} preload="auto" className="hidden">
        <track kind="captions" />
      </audio>

      {/* The Resonance Fingerprint — top ~55%. */}
      <section className="relative min-h-0 basis-[55%]">
        <Fingerprint
          clockRef={clockRef}
          leftMarketFidelity={leftMarketFidelity}
          rightMarketFidelity={rightMarketFidelity}
        />
      </section>

      {/* Transport row. */}
      <div className="flex items-center justify-center gap-4 py-3">
        <button
          type="button"
          onClick={togglePlaying}
          aria-pressed={isPlaying}
          className="border border-line px-6 py-2 font-mono text-xs uppercase tracking-[0.2em] text-text transition-colors duration-200 hover:border-line-bright hover:bg-surface-2"
          style={{ borderColor: isPlaying ? accent : undefined }}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        {noPreview && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            No Preview — Follow-Along Mode
          </span>
        )}
      </div>

      {/* The Harmonic Arcs — bottom ~45%. */}
      <section className="min-h-0 basis-[45%]">
        {lines.length ? (
          <HarmonicArcs
            sourceArc={fingerprint.sourceArc}
            translationArc={fingerprint.translationArc}
            lines={lines}
            durationSec={durationSec}
            playheadFrac={playheadFrac}
            currentLine={currentLine}
            accent={accent}
            drained={drained}
            emotionSource={emotionSource}
          />
        ) : (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-faint">
            No lyric data.
          </p>
        )}
      </section>
    </div>
  );
}

export default CastView;
