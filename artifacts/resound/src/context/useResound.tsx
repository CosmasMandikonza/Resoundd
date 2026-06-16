import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Emotion } from "@/types";

export type Metric = "meaning" | "emotion" | "culture" | "singability";

export type View = "cast" | "fidelity" | "rebirth" | "world";

/** CSS-variable reference for each emotion accent (source of truth: tokens.css). */
export const ACCENT_VAR: Record<Emotion, string> = {
  joy: "var(--joy)",
  heat: "var(--heat)",
  love: "var(--love)",
  calm: "var(--calm)",
  melancholy: "var(--melancholy)",
};

interface ResoundContextValue {
  /** Active emotion accent as a CSS color value (defaults to var(--joy)). */
  activeAccent: string;
  /** The emotion currently driving the accent. */
  activeEmotion: Emotion;
  setActiveEmotion: (emotion: Emotion) => void;
  /** Monospace timecode readout, e.g. "00:00:00:00". */
  timecode: string;
  isPlaying: boolean;
  togglePlaying: () => void;
  setIsPlaying: (playing: boolean) => void;
  /** Which HUD metric tab is active. */
  activeMetric: Metric;
  setActiveMetric: (metric: Metric) => void;
  /** Which top-level view is active. */
  view: View;
  setView: (view: View) => void;
}

const ResoundContext = createContext<ResoundContextValue | null>(null);

const FPS = 30;

function formatTimecode(frames: number): string {
  const ff = frames % FPS;
  const totalSeconds = Math.floor(frames / FPS);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export function ResoundProvider({ children }: { children: ReactNode }) {
  const [activeEmotion, setActiveEmotion] = useState<Emotion>("joy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [timecode, setTimecode] = useState("00:00:00:00");
  const [activeMetric, setActiveMetric] = useState<Metric>("meaning");
  const [view, setView] = useState<View>("cast");
  const framesRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      framesRef.current += 1;
      setTimecode(formatTimecode(framesRef.current));
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const togglePlaying = useCallback(() => setIsPlaying((p) => !p), []);

  const value = useMemo<ResoundContextValue>(
    () => ({
      activeAccent: ACCENT_VAR[activeEmotion],
      activeEmotion,
      setActiveEmotion,
      timecode,
      isPlaying,
      togglePlaying,
      setIsPlaying,
      activeMetric,
      setActiveMetric,
      view,
      setView,
    }),
    [activeEmotion, timecode, isPlaying, togglePlaying, activeMetric, view],
  );

  return (
    <ResoundContext.Provider value={value}>{children}</ResoundContext.Provider>
  );
}

export function useResound(): ResoundContextValue {
  const ctx = useContext(ResoundContext);
  if (!ctx) {
    throw new Error("useResound must be used within a ResoundProvider");
  }
  return ctx;
}
