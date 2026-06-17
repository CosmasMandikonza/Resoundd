import { useEffect, useRef, useState } from "react";
import { resolveEmotionColor, toRgb } from "@/lib/colors";
import type { Emotion } from "@/types";

const ORDER: Emotion[] = ["joy", "heat", "love", "calm", "melancholy"];
const CYCLE_SEC = 20;

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** On-brand fallback when 2D canvas is unavailable: a slow CSS gradient drift. */
function CssColorField() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{
        background:
          "radial-gradient(60% 60% at 30% 30%, color-mix(in srgb, var(--melancholy) 16%, transparent), transparent 70%), radial-gradient(55% 55% at 70% 65%, color-mix(in srgb, var(--love) 14%, transparent), transparent 70%), var(--void)",
        animation: "cf-drift 20s var(--ease) infinite alternate",
      }}
    />
  );
}

/**
 * A slow generative flowing color field on the void — soft accent blobs drift
 * like ink in water, their hue cycling through the five emotion accents over
 * ~20s. Always renders (canvas, with a CSS gradient fallback). Caps DPR at 2
 * and disposes its rAF + observer on unmount. Reduced-motion paints one frame.
 */
export function ColorField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed(true);
      return;
    }

    const colors = ORDER.map((e) => toRgb(resolveEmotionColor(e)));
    const voidRgb = toRgb(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--void")
        .trim() || "#001209",
    );
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const N = 5;
    const blobs = Array.from({ length: N }, (_, i) => ({
      phase: (i / N) * Math.PI * 2,
      cphase: i,
      sx: 0.5 + 0.22 * Math.cos((i / N) * Math.PI * 2),
      sy: 0.5 + 0.22 * Math.sin((i / N) * Math.PI * 2),
      ax: 0.16 + 0.1 * ((i * 0.29) % 1),
      ay: 0.14 + 0.12 * ((i * 0.53) % 1),
      sp: 0.045 + 0.022 * i,
    }));

    const colorAt = (t: number, off: number): [number, number, number] => {
      const f = (((t / CYCLE_SEC) + off / N) % 1) * N;
      const i = Math.floor(f) % N;
      const n = (i + 1) % N;
      const k = f - Math.floor(f);
      const a = colors[i];
      const b = colors[n];
      return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
      ];
    };

    const draw = (t: number) => {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgb(${voidRgb[0]}, ${voidRgb[1]}, ${voidRgb[2]})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const rad = Math.max(w, h) * 0.6;
      for (let i = 0; i < N; i++) {
        const bl = blobs[i];
        const cx = (bl.sx + Math.sin(t * bl.sp + bl.phase) * bl.ax) * w;
        const cy = (bl.sy + Math.cos(t * bl.sp * 0.8 + bl.phase) * bl.ay) * h;
        const [r, g, b] = colorAt(t, bl.cphase);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.13)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.045)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      draw((performance.now() - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    if (prefersReduced()) {
      draw(5);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  if (failed) return <CssColorField />;
  return (
    <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
  );
}

export default ColorField;
