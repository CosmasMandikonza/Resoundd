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
import { FEATURED } from "@/fixtures/featured";

export type Metric = "meaning" | "emotion" | "culture" | "singability";

export type View = "cast" | "fidelity" | "rebirth" | "world";

/** Top-level route: the front door vs. the instrument. */
export type Route = "landing" | "instrument";

/** Where the active analysis came from. */
export type Source = "featured" | "user";

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
  /** The song currently rendered by every view (defaults to a featured one). */
  song: Song;
  /** Where the active analysis came from: a featured example or a user run. */
  source: Source;
  /** True when the active analysis is a user (live) run. Derived from source. */
  isLive: boolean;
  /** The top-level route. The app boots to "landing". */
  route: Route;
  setRoute: (route: Route) => void;
  /** Whether the ANALYZE panel overlay is open inside the instrument. */
  analyzeOpen: boolean;
  openAnalyze: () => void;
  closeAnalyze: () => void;
  /** Entry action: route into the instrument and open the ANALYZE panel. */
  startAnalysis: () => void;
  /** Entry action: load a featured analysis and route into the instrument. */
  openFeatured: (id: string) => void;
  /** Route back to the front door. */
  goHome: () => void;
  /** Load a freshly-analyzed song; marks the session as a USER run. */
  loadSong: (song: Song) => void;
  /** Return to the built-in showcase song (a featured example). */
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
  const [source, setSource] = useState<Source>("featured");
  const [route, setRoute] = useState<Route>("landing");
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  const isLive = source === "user";

  const togglePlaying = useCallback(() => setIsPlaying((p) => !p), []);

  const loadSong = useCallback((next: Song) => {
    setIsPlaying(false);
    setSong(next);
    setSource("user");
  }, []);

  const resetToShowcase = useCallback(() => {
    setIsPlaying(false);
    setSong(showcaseSong);
    setSource("featured");
  }, []);

  const openAnalyze = useCallback(() => setAnalyzeOpen(true), []);
  const closeAnalyze = useCallback(() => setAnalyzeOpen(false), []);

  const startAnalysis = useCallback(() => {
    setRoute("instrument");
    setAnalyzeOpen(true);
  }, []);

  const openFeatured = useCallback((id: string) => {
    const entry = FEATURED.find((f) => f.id === id) ?? FEATURED[0];
    if (!entry) return;
    setIsPlaying(false);
    setSong(entry.song);
    setSource("featured");
    setView("cast");
    setAnalyzeOpen(false);
    setRoute("instrument");
  }, []);

  const goHome = useCallback(() => {
    setIsPlaying(false);
    setAnalyzeOpen(false);
    setRoute("landing");
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
      source,
      isLive,
      route,
      setRoute,
      analyzeOpen,
      openAnalyze,
      closeAnalyze,
      startAnalysis,
      openFeatured,
      goHome,
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
      source,
      isLive,
      route,
      analyzeOpen,
      openAnalyze,
      closeAnalyze,
      startAnalysis,
      openFeatured,
      goHome,
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
