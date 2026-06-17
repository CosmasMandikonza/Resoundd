import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { motion } from "framer-motion";
import * as THREE from "three";
import type { Emotion } from "@/types";
import {
  TEXT_FALLBACK,
  lerpColor,
  readCssVar,
  resolveEmotionColor,
  resolveVoid,
  withAlpha,
} from "@/lib/colors";

// --- Composition ---
const FOV = 42;
const R = 1.4;
const MARGIN = 0.5;
// The breathing scale peaks slightly above 1, so reserve frame for it.
const MAX_SCALE = 1.04;
const HALF = R * MAX_SCALE + MARGIN;
// Full pass through all five emotion accents, then loop.
const CYCLE_SEC = 20;
const EMOTION_ORDER: Emotion[] = ["joy", "heat", "love", "calm", "melancholy"];

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
 * Grayscale wash texture: a luminance ramp (hot highlight -> void) with a
 * stepped glitch band across the equator. The accent hue is applied via
 * per-material tinting, so this single CanvasTexture is reused unchanged.
 */
function makeWashTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const text = readCssVar("--text", TEXT_FALLBACK);
    const voidColor = resolveVoid();

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.16, text);
    grad.addColorStop(0.34, lerpColor(text, voidColor, 0.18));
    grad.addColorStop(0.6, lerpColor(text, voidColor, 0.5));
    grad.addColorStop(0.82, lerpColor(text, voidColor, 0.82));
    grad.addColorStop(1, voidColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

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

/** On-brand CSS fallback: a single breathing orb cycling through the accents. */
function CssAmbientSphere() {
  const accents = EMOTION_ORDER.map((e) => `var(--${e})`);
  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        className="relative aspect-square w-[68%] max-w-[360px] overflow-hidden rounded-full"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            background: accents.map(
              (a) => `radial-gradient(circle at 50% 32%, ${a}, var(--void) 78%)`,
            ),
          }}
          transition={{
            duration: CYCLE_SEC,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <div
          className="absolute inset-x-0"
          style={{
            top: "33%",
            height: "34%",
            backgroundImage:
              "repeating-linear-gradient(90deg, color-mix(in srgb, var(--void) 55%, transparent) 0 6px, color-mix(in srgb, var(--void) 12%, transparent) 6px 12px)",
          }}
        />
      </motion.div>
    </div>
  );
}

function AmbientMesh() {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  const tex = useMemo(() => makeWashTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);

  const colors = useMemo(
    () =>
      EMOTION_ORDER.map((e) => new THREE.Color().setStyle(resolveEmotionColor(e))),
    [],
  );
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y += delta * 0.08;
      group.current.scale.setScalar(1 + Math.sin(t * 0.6) * 0.035);
    }
    // Continuous hue lerp through the five accents over CYCLE_SEC.
    const n = colors.length;
    const f = ((t / CYCLE_SEC) % 1) * n;
    const i = Math.floor(f) % n;
    const next = (i + 1) % n;
    target.copy(colors[i]).lerp(colors[next], f - Math.floor(f));
    const k = Math.min(1, delta * 2.2);
    mat.current?.color.lerp(target, k);
    mat.current?.emissive.lerp(target, k);
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[R, 64, 64]} />
        <meshStandardMaterial
          ref={mat}
          map={tex}
          emissiveMap={tex}
          emissiveIntensity={0.6}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

/** Keep the single sphere centered and fully framed at any aspect ratio. */
function Framing() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useLayoutEffect(() => {
    const aspect = width / Math.max(1, height);
    const halfTan = Math.tan((FOV * Math.PI) / 180 / 2);
    const distForWidth = HALF / (halfTan * aspect);
    const distForHeight = HALF / halfTan;
    camera.position.set(0, 0, Math.max(distForWidth, distForHeight));
    camera.aspect = aspect;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}

export function AmbientSphere() {
  const [supported] = useState(detectWebGL);

  if (!supported) return <CssAmbientSphere />;

  return (
    <WebGLBoundary fallback={<CssAmbientSphere />}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7], fov: FOV }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Framing />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <AmbientMesh />
      </Canvas>
    </WebGLBoundary>
  );
}

export default AmbientSphere;
