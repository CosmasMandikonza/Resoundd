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
import type { Emotion, Song } from "@/types";
import showcaseSong from "@/fixtures/showcase";
import { FEATURED, type FeaturedEntry } from "@/fixtures/featured";
import { enrichCyanite, generateRebirth as generateRebirthApi, listFeatured } from "@/lib/api";

/** Recover the Musixmatch track id from a `song-<trackId>-<targetLang>` id. */
function trackIdFromSong(song: Song): string {
  const suffix = `-${song.targetLang}`;
  if (song.id.startsWith("song-") && song.id.endsWith(suffix)) {
    return song.id.slice("song-".length, song.id.length - suffix.length);
  }
  return song.id;
}

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
  /** The featured gallery (server-precomputed, falling back to the fixture). */
  featured: FeaturedEntry[];
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
  /**
   * Merge `partial` into the active song without changing its source. Used by
   * async enrichment paths (Cyanite arc, Rebirth audio) that patch the song
   * after the initial analysis returns.
   */
  patchSong: (partial: Partial<Song>) => void;
  /** True while a rebirth vocal is being generated for the active live song. */
  isGeneratingRebirth: boolean;
  /**
   * Trigger on-demand ElevenLabs TTS generation for a live song. No-op for
   * featured songs or when generation is already in progress. Patches the song
   * with the resulting URL on success; resolves silently on failure so the view
   * can show its own "unavailable" state.
   */
  generateRebirth: () => Promise<void>;
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
  const [featured, setFeatured] = useState<FeaturedEntry[]>(FEATURED);
  const [isGeneratingRebirth, setIsGeneratingRebirth] = useState(false);

  const isLive = source === "user";

  /** Id of the song currently displayed, so a stale async enrich is ignored. */
  const activeSongId = useRef(song.id);
  /** Guards against concurrent rebirth generation requests. */
  const generatingRebirthRef = useRef(false);

  // Load the precomputed featured gallery from the server; keep the built-in
  // fixture if the server has none or the request fails.
  useEffect(() => {
    let cancelled = false;
    void listFeatured().then((items) => {
      if (!cancelled && items.length > 0) setFeatured(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlaying = useCallback(() => setIsPlaying((p) => !p), []);

  /**
   * Fire the async Cyanite audio-emotion enrichment for a freshly-loaded song
   * and swap the real arc in when it returns — but only if the same song is
   * still on screen (guards against a newer analysis having replaced it).
   */
  const enrich = useCallback((next: Song) => {
    if (next.emotionSource === "cyanite" || !next.previewUrl) return;
    void enrichCyanite({
      trackId: trackIdFromSong(next),
      previewUrl: next.previewUrl,
      targetLang: next.targetLang,
    }).then((result) => {
      if (result.emotionSource !== "cyanite" || !result.sourceArc) return;
      if (activeSongId.current !== next.id) return;
      setSong((current) =>
        current.id === next.id
          ? {
              ...current,
              emotionSource: "cyanite",
              cyaniteSummary: result.cyaniteSummary,
              fingerprint: {
                ...current.fingerprint,
                sourceArc: result.sourceArc!,
              },
              partnersUsed: current.partnersUsed.includes("CYANITE")
                ? current.partnersUsed
                : [...current.partnersUsed, "CYANITE"],
            }
          : current,
      );
    });
  }, []);

  const patchSong = useCallback((partial: Partial<Song>) => {
    setSong((current) => ({ ...current, ...partial }));
  }, []);

  const loadSong = useCallback(
    (next: Song) => {
      setIsPlaying(false);
      activeSongId.current = next.id;
      setSong(next);
      setSource("user");
      enrich(next);
    },
    [enrich],
  );

  const resetToShowcase = useCallback(() => {
    setIsPlaying(false);
    activeSongId.current = showcaseSong.id;
    setSong(showcaseSong);
    setSource("featured");
  }, []);

  const openAnalyze = useCallback(() => setAnalyzeOpen(true), []);
  const closeAnalyze = useCallback(() => setAnalyzeOpen(false), []);

  const startAnalysis = useCallback(() => {
    setRoute("instrument");
    setAnalyzeOpen(true);
  }, []);

  const openFeatured = useCallback(
    (id: string) => {
      const entry = featured.find((f) => f.id === id) ?? featured[0];
      if (!entry) return;
      setIsPlaying(false);
      activeSongId.current = entry.song.id;
      setSong(entry.song);
      setSource("featured");
      setView("cast");
      setAnalyzeOpen(false);
      setRoute("instrument");
    },
    [featured],
  );

  const goHome = useCallback(() => {
    setIsPlaying(false);
    setAnalyzeOpen(false);
    setRoute("landing");
  }, []);

  const generateRebirth = useCallback(async () => {
    if (!isLive || generatingRebirthRef.current) return;
    generatingRebirthRef.current = true;
    setIsGeneratingRebirth(true);
    const currentSong = song;
    try {
      const result = await generateRebirthApi({
        songId: currentSong.id,
        targetLang: currentSong.targetLang,
        lyrics: currentSong.lines.map((l) => l.localized),
      });
      if (result && activeSongId.current === currentSong.id) {
        setSong((s) =>
          s.id === currentSong.id
            ? {
                ...s,
                rebirthAudioUrl: result.rebirthAudioUrl,
                rebirthSource: result.rebirthSource,
                partnersUsed: s.partnersUsed.includes("ELEVENLABS")
                  ? s.partnersUsed
                  : [...s.partnersUsed, "ELEVENLABS"],
              }
            : s,
        );
      }
    } finally {
      generatingRebirthRef.current = false;
      setIsGeneratingRebirth(false);
    }
  }, [isLive, song]);

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
      featured,
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
      patchSong,
      isGeneratingRebirth,
      generateRebirth,
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
      featured,
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
      patchSong,
      isGeneratingRebirth,
      generateRebirth,
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
