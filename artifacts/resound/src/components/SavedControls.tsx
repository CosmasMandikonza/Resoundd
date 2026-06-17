import { useEffect, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useResound } from "@/context/useResound";
import {
  listSavedAnalyses,
  openSavedAnalysis,
  saveAnalysis,
} from "@/lib/api";
import type { SavedAnalysisSummary } from "@/types";

export type Auth = ReturnType<typeof useAuth>;

const GRID_STYLE = {
  backgroundColor: "var(--void)",
  backgroundImage:
    "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
} as const;

const BTN =
  "border border-line bg-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text";
const BTN_STYLE = {
  borderRadius: 2,
  transitionTimingFunction: "var(--ease)",
} as const;

function HudButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        disabled
          ? "border border-line bg-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-text-faint opacity-40"
          : BTN
      }
      style={{
        ...BTN_STYLE,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** SAVE the current analysis. Logged-out: disabled with a quiet "Sign in to save" hint. */
export function SaveButton({ auth }: { auth: Auth }) {
  const { song } = useResound();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  if (!auth.isAuthenticated) {
    return <HudButton label="Save" disabled title="Sign in to save" />;
  }

  const onSave = async () => {
    setState("saving");
    try {
      await saveAnalysis(song);
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2400);
    }
  };

  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Retry"
          : "Save";

  return (
    <HudButton label={label} onClick={onSave} disabled={state === "saving"} />
  );
}

/** Opens the SAVED list. Logged-in only. */
export function SavedButton({
  auth,
  onOpen,
}: {
  auth: Auth;
  onOpen: () => void;
}) {
  if (!auth.isAuthenticated) return null;
  return <HudButton label="Saved" onClick={onOpen} />;
}

/** SIGN IN (logged-out) or handle + SIGN OUT (logged-in). */
export function AuthControl({ auth }: { auth: Auth }) {
  if (auth.isLoading) return null;
  if (!auth.isAuthenticated) {
    return <HudButton label="Sign in" onClick={auth.login} />;
  }
  const handle =
    auth.user?.firstName?.trim() ||
    auth.user?.email?.split("@")[0] ||
    "Account";
  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-[10rem] truncate font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint sm:inline"
        title={auth.user?.email ?? undefined}
      >
        {handle}
      </span>
      <HudButton label="Sign out" onClick={auth.logout} />
    </div>
  );
}

function langPair(s: SavedAnalysisSummary): string {
  return `${s.sourceLang.toUpperCase()} → ${s.targetLang.toUpperCase()}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** Full-screen overlay listing saved analyses; selecting one reopens it in the instrument. */
export function SavedOverlay({ onClose }: { onClose: () => void }) {
  const { loadSong, setView } = useResound();
  const [items, setItems] = useState<SavedAnalysisSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedAnalyses()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError("Couldn't load your saved analyses.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onReopen = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const song = await openSavedAnalysis(id);
      loadSong(song);
      setView("cast");
      onClose();
    } catch {
      setError("Couldn't reopen that analysis.");
      setOpeningId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center"
      style={GRID_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label="Saved analyses"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close saved analyses"
        className="absolute right-6 top-4 border border-line bg-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-text-dim transition-colors duration-[280ms] hover:bg-surface-2 hover:text-text"
        style={BTN_STYLE}
      >
        Close
      </button>

      <div className="flex max-h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto px-6 py-20">
        <h2 className="font-mono text-sm uppercase tracking-[0.24em] text-text">
          Saved analyses
        </h2>

        {error && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-heat">
            {error}
          </p>
        )}

        {items === null && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            Loading…
          </p>
        )}

        {items !== null && items.length === 0 && !error && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            Nothing saved yet — run an analysis and press SAVE.
          </p>
        )}

        {items && items.length > 0 && (
          <ul className="flex flex-col divide-y divide-line border border-line">
            {items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onReopen(s.id)}
                  disabled={openingId !== null}
                  className="flex w-full items-center justify-between gap-4 bg-transparent px-4 py-4 text-left transition-colors duration-[280ms] hover:bg-surface-2 disabled:opacity-50"
                  style={{ transitionTimingFunction: "var(--ease)" }}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm text-text">
                      {s.title}
                    </span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim">
                      {s.artist}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
                    <span>
                      {openingId === s.id ? "Opening…" : langPair(s)}
                    </span>
                    <span>{formatDate(s.savedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
