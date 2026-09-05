"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import Link from "next/link";
import type { Project, Risk } from "@/lib/types";
import { useVizPalette } from "@/lib/useVizPalette";
import { riskLevelVizColor, type VizPalette } from "@/lib/vizTheme";
import { formatCompactCurrency } from "@/lib/utils";

/** Every project sharing at least one open risk category with another -- computed client-side
 * from data this page already fetches (GET /projects, GET /risks), zero new requests. Deliberately
 * NOT labeled "blockers" or "dependencies": this app has no cross-project dependency data at all
 * (task_dependencies only link tasks within one project), so an edge here means exactly what its
 * tooltip says -- shared risk exposure -- not an invented blocking relationship. */
interface ConstellationEdge {
  a: string;
  b: string;
  sharedCategories: string[];
}

function buildEdges(projects: Project[], risks: Risk[]): ConstellationEdge[] {
  const categoriesByProject = new Map<string, Set<string>>();
  for (const r of risks) {
    if (!categoriesByProject.has(r.project_id)) categoriesByProject.set(r.project_id, new Set());
    categoriesByProject.get(r.project_id)!.add(r.category);
  }
  const edges: ConstellationEdge[] = [];
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i];
      const b = projects[j];
      const catsA = categoriesByProject.get(a.id);
      const catsB = categoriesByProject.get(b.id);
      if (!catsA || !catsB) continue;
      const shared = [...catsA].filter((c) => catsB.has(c));
      if (shared.length > 0) edges.push({ a: a.id, b: b.id, sharedCategories: shared });
    }
  }
  return edges;
}

interface NodeLayout {
  project: Project;
  position: [number, number, number];
  radius: number;
  phase: number; // per-node offset so the ambient bob isn't perfectly synchronized
}

function buildLayout(projects: Project[]): NodeLayout[] {
  const maxBudget = Math.max(1, ...projects.map((p) => p.budget));
  const ringRadius = Math.max(3, projects.length * 0.9);
  return projects.map((p, i) => {
    const angle = (i / Math.max(1, projects.length)) * Math.PI * 2;
    // Real data encodings, not decorative placement: angle is purely a layout mechanism (evenly
    // spaced, nothing to read into it), but height and size are not -- a project's real
    // health_score sets how high it floats (unhealthy initiatives visibly sink), and its real
    // budget sets node size (bigger commitments read as bigger spheres).
    const y = (p.health_score / 100) * 3.2 - 1.6;
    const radius = 0.22 + (p.budget / maxBudget) * 0.34;
    return {
      project: p,
      position: [Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius],
      radius,
      phase: i * 1.7,
    };
  });
}

function ProjectNode({
  layout,
  palette,
  reduceMotion,
  onSelect,
  selected,
}: {
  layout: NodeLayout;
  palette: VizPalette;
  reduceMotion: boolean;
  onSelect: (id: string | null) => void;
  selected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = riskLevelVizColor(layout.project.risk_level, palette);

  useFrame(({ clock }) => {
    if (!meshRef.current || reduceMotion) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = layout.position[1] + Math.sin(t * 0.6 + layout.phase) * 0.12;
  });

  const active = hovered || selected;

  return (
    <group position={layout.position}>
      <mesh
        ref={meshRef}
        position={[0, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected ? null : layout.project.id);
        }}
      >
        <sphereGeometry args={[layout.radius, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.55 : 0.18}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>
      {active && (
        <Html distanceFactor={9} position={[0, layout.radius + 0.35, 0]} center occlude>
          <div className="card-glass w-56 rounded-lg border border-border-default bg-surface-raised p-3 text-xs shadow-lg">
            <Link href={`/app/projects/${layout.project.id}`} className="font-semibold text-text-primary hover:underline">
              {layout.project.name}
            </Link>
            <p className="mt-0.5 text-[11px] text-text-tertiary">{layout.project.client ?? "Internal"}</p>
            <dl className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">Budget</dt>
                <dd className="font-tabular font-medium text-text-primary">{formatCompactCurrency(layout.project.budget)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">Health</dt>
                <dd className="font-tabular font-medium text-text-primary">{Math.round(layout.project.health_score)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-tertiary">Risk</dt>
                <dd className="font-medium" style={{ color }}>
                  {layout.project.risk_level}
                </dd>
              </div>
            </dl>
          </div>
        </Html>
      )}
    </group>
  );
}

function ConstellationScene({
  layouts,
  edges,
  palette,
  reduceMotion,
}: {
  layouts: NodeLayout[];
  edges: ConstellationEdge[];
  palette: VizPalette;
  reduceMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(layouts.map((l) => [l.project.id, l])), [layouts]);

  useFrame((_, delta) => {
    if (!groupRef.current || reduceMotion) return;
    groupRef.current.rotation.y += delta * 0.05;
  });

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 8, 4]} intensity={0.7} />
      <group ref={groupRef}>
        {edges.map((edge) => {
          const a = byId.get(edge.a);
          const b = byId.get(edge.b);
          if (!a || !b) return null;
          return (
            <Line
              key={`${edge.a}-${edge.b}`}
              points={[a.position, b.position]}
              color={palette.border}
              lineWidth={1}
              transparent
              opacity={0.45}
            />
          );
        })}
        {layouts.map((layout) => (
          <ProjectNode
            key={layout.project.id}
            layout={layout}
            palette={palette}
            reduceMotion={reduceMotion}
            selected={selectedId === layout.project.id}
            onSelect={setSelectedId}
          />
        ))}
      </group>
    </>
  );
}

/**
 * 3D node graph of the active portfolio: real health_score sets each node's height, real budget
 * sets its size, real risk_level sets its color (identical mapping to the Badge everywhere else
 * risk_level is shown). Edges connect projects sharing an open risk category -- the only
 * cross-project relationship this app's data model actually has; see buildEdges' comment for why
 * this deliberately isn't labeled "dependencies" or "blockers." Hover or click a node for its
 * detail card. Dynamically imported with `ssr: false` from the dashboard page (WebGL has no
 * server-side representation); React Three Fiber disposes the GL context itself on unmount, no
 * manual cleanup needed here.
 *
 * `useVizPalette()`/reduced-motion are read once here, outside <Canvas>, and passed down as props
 * rather than called again inside the scene/node components: <Canvas> mounts its children in a
 * separate React renderer, which does not automatically re-render on an outer context change
 * (next-themes' theme, in this case) the way a normal DOM subtree would -- a component calling
 * the hook itself from inside the canvas would silently freeze on whatever palette was active at
 * first mount, never reacting to a later light/dark toggle.
 */
export default function ProjectConstellation3D({ projects, risks }: { projects: Project[]; risks: Risk[] }) {
  const palette = useVizPalette();
  const reduceMotion = !!useReducedMotion();
  const layouts = useMemo(() => buildLayout(projects), [projects]);
  const edges = useMemo(() => buildEdges(projects, risks), [projects, risks]);

  return (
    <div className="h-80 w-full overflow-hidden rounded-lg" style={{ background: palette.canvas }}>
      <Canvas camera={{ position: [0, 2.4, 11], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={[palette.canvas]} />
        <fog attach="fog" args={[palette.canvas, 12, 26]} />
        <ConstellationScene layouts={layouts} edges={edges} palette={palette} reduceMotion={reduceMotion} />
      </Canvas>
    </div>
  );
}
