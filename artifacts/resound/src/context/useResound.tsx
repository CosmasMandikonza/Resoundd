import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Emotion, Song } from "@/types";
import showcaseSong from "@/fixtures/showcase";

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
  /** Monospace timecode readout, e.g. "00:00:000". Driven by the active view. */
  timecode: string;
  setTimecode: (timecode: string) => void;
  isPlaying: boolean;
  togglePlaying: () => void;
  setIsPlaying: (playing: boolean) => void;
  /** Which HUD metric tab is active. */
  activeMetric: Metric;
  setActiveMetric: (metric: Metric) => void;
  /** Which top-level view is active. */
  view: View;
  setView: (view: View) => void;
  /** Resonance readout, 0..1 (defaults to 0). Shown bottom-left in the HUD. */
  resonance: number;
  setResonance: (value: number) => void;
  /** The song currently rendered by every view (defaults to the showcase). */
  song: Song;
  /** True once a live analysis result has been loaded (vs. the showcase fixture). */
  isLive: boolean;
  /** Load a freshly-analyzed song; marks the session LIVE and resets playback. */
  loadSong: (song: Song) => void;
  /** Return to the built-in showcase song. */
  resetToShowcase: () => void;
}

const ResoundContext = createContext<ResoundContextValue | null>(null);

export function ResoundProvider({ children }: { children: ReactNode }) {
  const [activeEmotion, setActiveEmotion] = useState<Emotion>("joy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [timecode, setTimecode] = useState("00:00:000");
  const [activeMetric, setActiveMetric] = useState<Metric>("meaning");
  const [view, setView] = useState<View>("cast");
  const [resonance, setResonance] = useState(0);
  const [song, setSong] = useState<Song>(showcaseSong);
  const [isLive, setIsLive] = useState(false);

  const togglePlaying = useCallback(() => setIsPlaying((p) => !p), []);

  const loadSong = useCallback((next: Song) => {
    setIsPlaying(false);
    setSong(next);
    setIsLive(true);
  }, []);

  const resetToShowcase = useCallback(() => {
    setIsPlaying(false);
    setSong(showcaseSong);
    setIsLive(false);
  }, []);

  const value = useMemo<ResoundContextValue>(
    () => ({
      activeAccent: ACCENT_VAR[activeEmotion],
      activeEmotion,
      setActiveEmotion,
      timecode,
      setTimecode,
      isPlaying,
      togglePlaying,
      setIsPlaying,
      activeMetric,
      setActiveMetric,
      view,
      setView,
      resonance,
      setResonance,
      song,
      isLive,
      loadSong,
      resetToShowcase,
    }),
    [
      activeEmotion,
      timecode,
      isPlaying,
      togglePlaying,
      activeMetric,
      view,
      resonance,
      song,
      isLive,
      loadSong,
      resetToShowcase,
    ],
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
