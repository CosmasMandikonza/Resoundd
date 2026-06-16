import type { Emotion } from "@/types";

/** Map each emotion to its CSS custom property (source of truth: tokens.css). */
export const EMOTION_VAR: Record<Emotion, string> = {
  joy: "--joy",
  heat: "--heat",
  love: "--love",
  calm: "--calm",
  melancholy: "--melancholy",
};

/** Fallbacks used only before the DOM is available; tokens.css stays authoritative. */
export const EMOTION_FALLBACK: Record<Emotion, string> = {
  joy: "#e8a33d",
  heat: "#f2683c",
  love: "#d96ba6",
  calm: "#7fb6a1",
  melancholy: "#5e9fcb",
};

export const DRAINED_FALLBACK = "#4a4742";
export const VOID_FALLBACK = "#001209";
export const TEXT_FALLBACK = "#d0beb6";

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Read a CSS custom property off :root, falling back when the DOM is absent. */
export function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** Resolve an emotion accent to a concrete color string from the tokens. */
export function resolveEmotionColor(emotion: Emotion): string {
  return readCssVar(EMOTION_VAR[emotion], EMOTION_FALLBACK[emotion]);
}

export function resolveDrained(): string {
  return readCssVar("--drained", DRAINED_FALLBACK);
}

export function resolveVoid(): string {
  return readCssVar("--void", VOID_FALLBACK);
}

/** Parse "#rgb", "#rrggbb", or "rgb(r,g,b)" into [r,g,b]. */
export function toRgb(color: string): [number, number, number] {
  const c = color.trim();
  if (c.startsWith("rgb")) {
    const nums = c
      .replace(/rgba?\(/, "")
      .replace(")", "")
      .split(",")
      .map((s) => parseFloat(s.trim()));
    return [nums[0] || 0, nums[1] || 0, nums[2] || 0];
  }
  let h = c.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Build an "rgba(r, g, b, a)" string from any parseable color and an alpha. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

/** Linearly interpolate between two colors; returns an "rgb(r, g, b)" string. */
export function lerpColor(from: string, to: string, t: number): string {
  const a = toRgb(from);
  const b = toRgb(to);
  const k = clamp01(t);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
