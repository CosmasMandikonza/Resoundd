import { useEffect, useRef, useState } from "react";
import { useResound } from "@/context/useResound";
import { analyzeSong, AnalyzeRequestError } from "@/lib/api";
import {
  SUPPORTED_TARGET_LANGS,
  type Song,
  type TargetLang,
} from "@/types";

/** Human-readable names for the supported target languages. */
const LANG_LABEL: Record<TargetLang, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
};

/** One-tap demo songs that pre-fill the form. */
const QUICK_PICKS: { title: string; artist: string; targetLang: TargetLang }[] =
  [
    { title: "Tití Me Preguntó", artist: "Bad Bunny", targetLang: "en" },
    { title: "Despacito", artist: "Luis Fonsi", targetLang: "en" },
    { title: "99 Luftballons", artist: "Nena", targetLang: "en" },
    { title: "La Vie En Rose", artist: "Édith Piaf", targetLang: "en" },
  ];

/** Instrument-style status labels cycled while the pipeline runs. */
const STEP_LABELS = [
  "LOCATING TRACK",
  "RETRIEVING LYRICS",
  "READING EMOTION",
  "MEASURING BACK-TRANSLATION DRIFT",
  "MAPPING MARKETS",
  "RENDERING FINGERPRINT",
];

type Status = "idle" | "loading" | "error";

interface PendingInput {
  title: string;
  artist: string;
  targetLang: TargetLang;
}

export function AnalyzePanel({ onAnalyzed }: { onAnalyzed: (song: Song) => void }) {
  const { loadSong } = useResound();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [targetLang, setTargetLang] = useState<TargetLang>("en");

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [stepIndex, setStepIndex] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const lastInputRef = useRef<PendingInput | null>(null);

  // Cycle the instrument step labels while loading.
  useEffect(() => {
    if (status !== "loading") return;
    setStepIndex(0);
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % STEP_LABELS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [status]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (input: PendingInput) => {
    lastInputRef.current = input;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setErrorMsg("");

    try {
      const song = await analyzeSong(
        {
          title: input.title.trim(),
          artist: input.artist.trim() || undefined,
          targetLang: input.targetLang,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      loadSong(song);
      setStatus("idle");
      onAnalyzed(song);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message =
        err instanceof AnalyzeRequestError
          ? err.message
          : "Something went wrong during analysis.";
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Enter a song title to analyze.");
      setStatus("error");
      return;
    }
    void run({ title, artist, targetLang });
  };

  const onRetry = () => {
    if (lastInputRef.current) void run(lastInputRef.current);
    else setStatus("idle");
  };

  const fieldClass =
    "w-full border border-line bg-transparent px-3 py-2 font-mono text-sm text-text placeholder:text-text-faint focus:border-text-dim focus:outline-none";

  if (status === "loading") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 py-4">
        <span className="hud-pulse h-2 w-2 bg-text" />
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-text">
          {STEP_LABELS[stepIndex]}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
          ANALYZING — THIS CAN TAKE UP TO 30 SECONDS
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
        ANALYZE A SONG
      </span>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <input
          className={fieldClass}
          style={{ borderRadius: 2 }}
          placeholder="SONG TITLE"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Song title"
        />
        <input
          className={fieldClass}
          style={{ borderRadius: 2 }}
          placeholder="ARTIST (OPTIONAL)"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          aria-label="Artist"
        />

        <label className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
          TRANSLATE TO
          <select
            className={fieldClass + " max-w-[10rem]"}
            style={{ borderRadius: 2 }}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as TargetLang)}
            aria-label="Target language"
          >
            {SUPPORTED_TARGET_LANGS.map((lang) => (
              <option key={lang} value={lang} className="bg-void text-text">
                {LANG_LABEL[lang]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="border border-text-dim bg-transparent px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-text transition-colors duration-[280ms] hover:bg-surface-2"
          style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
        >
          Analyze
        </button>
      </form>

      {status === "error" && (
        <div className="flex flex-col gap-2 border border-line px-3 py-2">
          <span
            className="font-mono text-xs leading-relaxed"
            style={{ color: "var(--risk)" }}
          >
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="self-start bg-transparent font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim underline-offset-4 hover:text-text hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
          TRY
        </span>
        <div className="flex flex-wrap gap-2">
          {QUICK_PICKS.map((pick) => (
            <button
              key={`${pick.title}-${pick.artist}`}
              type="button"
              onClick={() => {
                setTitle(pick.title);
                setArtist(pick.artist);
                setTargetLang(pick.targetLang);
                void run(pick);
              }}
              className="border border-line bg-transparent px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
              style={{ borderRadius: 2, transitionTimingFunction: "var(--ease)" }}
            >
              {pick.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AnalyzePanel;
