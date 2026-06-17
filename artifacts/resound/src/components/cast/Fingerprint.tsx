import {
  Component,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Emotion } from "@/types";
import { useResound } from "@/context/useResound";
import {
  TEXT_FALLBACK,
  lerpColor,
  readCssVar,
  resolveDrained,
  resolveEmotionColor,
  resolveVoid,
  withAlpha,
} from "@/lib/colors";

// Vertical FOV of the scene camera (kept in sync with the <Canvas camera>).
const FOV = 42;
// Half-extents of the three-sphere group, with a small margin, so framing can
// guarantee every sphere stays on screen at any container aspect ratio.
const GROUP_HALF_X = 3.6; // flank center (2.45) + radius (0.82) + margin
const GROUP_HALF_Y = 1.7; // central radius (1.4) + margin

export interface ClockState {
  tSec: number;
  emotion: Emotion;
}

/** Whether a WebGL context can actually be created in this environment. */
function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** Catches a failed WebGL/renderer init and shows the CSS fallback instead. */
class WebGLBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * On-brand graceful fallback when WebGL is unavailable: three tinted orbs with
 * a stepped glitch band, driven by the active emotion accent from context.
 */
function CssFingerprint() {
  const { activeAccent } = useResound();
  const orb = (size: number, opacity: number) => (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        opacity,
        background: `radial-gradient(circle at 50% 32%, ${activeAccent}, var(--void) 78%)`,
        transition: "background 280ms var(--ease)",
      }}
    >
      <div
        className="absolute inset-x-0"
        style={{
          top: "33%",
          height: "34%",
          backgroundImage:
            "repeating-linear-gradient(90deg, color-mix(in srgb, var(--void) 55%, transparent) 0 6px, color-mix(in srgb, var(--void) 12%, transparent) 6px 12px)",
        }}
      />
    </div>
  );
  return (
    <div className="flex h-full w-full items-center justify-center gap-8">
      {orb(120, 0.55)}
      {orb(220, 1)}
      {orb(120, 0.7)}
    </div>
  );
}

const EMOTIONS: Emotion[] = ["joy", "heat", "love", "calm", "melancholy"];

/**
 * Grayscale "wash" texture: a vertical gradient (white top -> near-black
 * bottom) with a stepped/blocky glitch band across the middle third. The
 * emotion color comes from per-material tinting, so this single CanvasTexture
 * is reused for every sphere (no GLSL shader, no per-frame redraw).
 */
function makeWashTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Luminance ramp built from brand tokens. The accent is applied via
    // per-material tinting (and a matching emissive), so a luminous near-white
    // top reads as a *hot highlight of the accent hue* that glows, fading
    // through the full accent down to near-black void at the bottom.
    const text = readCssVar("--text", TEXT_FALLBACK);
    const voidColor = resolveVoid();

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "#ffffff"); // hot specular highlight
    grad.addColorStop(0.16, text); // luminous near-white
    grad.addColorStop(0.34, lerpColor(text, voidColor, 0.18)); // top third stays bright
    grad.addColorStop(0.6, lerpColor(text, voidColor, 0.5)); // full accent reads here
    grad.addColorStop(0.82, lerpColor(text, voidColor, 0.82));
    grad.addColorStop(1, voidColor); // near-black void
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Stepped glitch band across the middle third (pixelated equator).
    const bandTop = size / 3;
    const bandH = size / 3;
    const cols = 16;
    const cw = size / cols;
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle =
        i % 2 === 0 ? withAlpha(voidColor, 0.55) : withAlpha(voidColor, 0.18);
      ctx.fillRect(i * cw, bandTop, cw, bandH);
    }
    ctx.fillStyle = withAlpha(text, 0.07);
    ctx.fillRect(0, bandTop, size, 1);
    ctx.fillRect(0, bandTop + bandH, size, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function Spheres({
  clockRef,
  leftFid,
  rightFid,
}: {
  clockRef: RefObject<ClockState>;
  leftFid: number;
  rightFid: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const centralMat = useRef<THREE.MeshStandardMaterial>(null);
  const leftMat = useRef<THREE.MeshStandardMaterial>(null);
  const rightMat = useRef<THREE.MeshStandardMaterial>(null);

  const tex = useMemo(() => makeWashTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);

  // Precompute target colors per emotion (central + each drained flank).
  const { central, left, right } = useMemo(() => {
    const drained = resolveDrained();
    const c: Record<Emotion, THREE.Color> = {} as Record<Emotion, THREE.Color>;
    const l: Record<Emotion, THREE.Color> = {} as Record<Emotion, THREE.Color>;
    const r: Record<Emotion, THREE.Color> = {} as Record<Emotion, THREE.Color>;
    for (const e of EMOTIONS) {
      const hex = resolveEmotionColor(e);
      c[e] = new THREE.Color().setStyle(hex);
      l[e] = new THREE.Color().setStyle(lerpColor(hex, drained, 1 - leftFid));
      r[e] = new THREE.Color().setStyle(lerpColor(hex, drained, 1 - rightFid));
    }
    return { central: c, left: l, right: r };
  }, [leftFid, rightFid]);

  useFrame((_, delta) => {
    const emo = clockRef.current?.emotion ?? "joy";
    const k = Math.min(1, delta * 2.2);
    if (groupRef.current) groupRef.current.rotation.y += 0.1 * delta;
    // Albedo and emissive both track the active emotion so the luminous top of
    // the wash glows in the accent hue rather than reading flat brown.
    centralMat.current?.color.lerp(central[emo], k);
    leftMat.current?.color.lerp(left[emo], k);
    rightMat.current?.color.lerp(right[emo], k);
    centralMat.current?.emissive.lerp(central[emo], k);
    leftMat.current?.emissive.lerp(left[emo], k);
    rightMat.current?.emissive.lerp(right[emo], k);
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <meshStandardMaterial
          ref={centralMat}
          map={tex}
          emissiveMap={tex}
          emissiveIntensity={0.6}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[-2.45, 0, -0.4]}>
        <sphereGeometry args={[0.82, 48, 48]} />
        <meshStandardMaterial
          ref={leftMat}
          map={tex}
          emissiveMap={tex}
          emissiveIntensity={0.5}
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[2.45, 0, -0.4]}>
        <sphereGeometry args={[0.82, 48, 48]} />
        <meshStandardMaterial
          ref={rightMat}
          map={tex}
          emissiveMap={tex}
          emissiveIntensity={0.5}
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

/**
 * Pulls the camera back so the full sphere group fits — and stays centered —
 * at any container aspect ratio (the canvas is nearly square in some layouts,
 * which previously clipped the flanking spheres). Recomputes on resize.
 */
function ResponsiveFraming() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfTan = Math.tan((FOV * Math.PI) / 180 / 2);
    const distForX = GROUP_HALF_X / (halfTan * aspect);
    const distForY = GROUP_HALF_Y / halfTan;
    camera.position.set(0, 0, Math.max(distForX, distForY));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export const Fingerprint = memo(function Fingerprint({
  clockRef,
  leftMarketFidelity,
  rightMarketFidelity,
}: {
  clockRef: RefObject<ClockState>;
  leftMarketFidelity: number;
  rightMarketFidelity: number;
}) {
  const [supported] = useState(detectWebGL);

  if (!supported) return <CssFingerprint />;

  return (
    <WebGLBoundary fallback={<CssFingerprint />}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7], fov: FOV }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <ResponsiveFraming />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <Spheres
          clockRef={clockRef}
          leftFid={leftMarketFidelity}
          rightFid={rightMarketFidelity}
        />
      </Canvas>
    </WebGLBoundary>
  );
});

export default Fingerprint;
