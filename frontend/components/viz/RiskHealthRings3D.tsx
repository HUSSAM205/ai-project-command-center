"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { useVizPalette } from "@/lib/useVizPalette";
import { riskLevelVizColor, type VizPalette } from "@/lib/vizTheme";

interface RingSpec {
  key: string;
  count: number;
  color: string;
  radius: number;
  speed: number;
}

function Ring({ spec, reduceMotion }: { spec: RingSpec; reduceMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const particlePositions = useMemo(() => {
    // A handful of points riding the ring, not a dense particle system -- enough to read as
    // "alive" without the per-frame cost (or visual noise) of hundreds of sprites.
    const count = 10;
    const points: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push([Math.cos(angle) * spec.radius, Math.sin(angle) * spec.radius, 0]);
    }
    return points;
  }, [spec.radius]);

  useFrame((_, delta) => {
    if (!ref.current || reduceMotion) return;
    ref.current.rotation.z += delta * spec.speed;
  });

  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[spec.radius, 0.05 + Math.min(0.11, spec.count * 0.012), 12, 64]} />
        <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={0.4} roughness={0.5} />
      </mesh>
      {particlePositions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function RingsScene({
  entries,
  palette,
  reduceMotion,
}: {
  entries: [string, number][];
  palette: VizPalette;
  reduceMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  const specs: RingSpec[] = useMemo(
    () =>
      entries.map(([severity, count], i) => ({
        key: severity,
        count,
        color: riskLevelVizColor(severity, palette),
        radius: 1.1 + i * 0.55,
        speed: 0.12 + i * 0.05,
      })),
    [entries, palette],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current || reduceMotion) return;
    groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.2) * 0.15;
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 6]} intensity={0.6} />
      <group ref={groupRef} rotation={[0.5, 0, 0]}>
        {specs.map((spec) => (
          <Ring key={spec.key} spec={spec} reduceMotion={reduceMotion} />
        ))}
        <Text fontSize={0.42} color={palette.textTertiary} anchorX="center" anchorY="middle">
          {total}
        </Text>
      </group>
    </>
  );
}

/**
 * Replaces the 2D donut chart for open-risk severity with concentric 3D rings -- one ring per
 * severity that has at least one open risk, real counts driving both which rings exist and their
 * thickness, colored identically to the Badge/pie-chart mapping elsewhere on this page. Small
 * particle points ride each ring for the "alive" texture the feature request asked for, capped at
 * 10 per ring rather than a dense system. Dynamically imported with `ssr: false`.
 */
export default function RiskHealthRings3D({ entries }: { entries: [string, number][] }) {
  const palette = useVizPalette();
  const reduceMotion = !!useReducedMotion();

  return (
    <div className="h-40 w-full overflow-hidden rounded-lg" style={{ background: palette.canvas }}>
      <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={[palette.canvas]} />
        <RingsScene entries={entries} palette={palette} reduceMotion={reduceMotion} />
      </Canvas>
    </div>
  );
}
