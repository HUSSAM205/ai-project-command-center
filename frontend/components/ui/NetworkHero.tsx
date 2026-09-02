"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number; // 0..1 — drives parallax amount and node size, not color/opacity per-frame math
  r: number;
}

const NODE_COUNT = 46;
const LINK_DISTANCE = 150;
const DRIFT_SPEED = 0.12;
const PARALLAX_STRENGTH = 14;

/**
 * Restrained animated hero background: a slowly-drifting network of thin connecting lines and
 * small nodes, with a subtle parallax shift toward the mouse position. Deliberately layered
 * Canvas 2D — not Three.js/WebGL — per this product's design direction (an "AI website" glow/3D
 * scene reads as generic; this stays a quiet, technical texture behind the real hero copy).
 *
 * Colors are read from the page's own CSS custom properties (brand-500/brand-300 + canvas bg) so
 * it re-themes automatically with light/dark mode instead of hardcoding hex values, and a
 * `prefers-reduced-motion: reduce` visitor gets one static frame — no rAF loop, no mouse
 * tracking — rather than the animation being merely slowed down.
 */
export function NetworkHero({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let rafId = 0;

    function readColor(varName: string, fallback: string) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      return v || fallback;
    }

    function seedNodes() {
      const area = width * height;
      // Density-scaled but capped, so very wide viewports don't pay for hundreds of nodes.
      const count = Math.max(18, Math.min(NODE_COUNT, Math.round(area / 26000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * DRIFT_SPEED,
        vy: (Math.random() - 0.5) * DRIFT_SPEED,
        depth: Math.random(),
        r: 1 + Math.random() * 1.6,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedNodes();
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      targetMouseX = (e.clientX - rect.left) / rect.width;
      targetMouseY = (e.clientY - rect.top) / rect.height;
    }

    function drawFrame() {
      const lineColor = readColor("--border-strong", "rgba(148,163,184,0.3)");
      const nodeColor = readColor("--brand-500", "#3d52a8");
      const linkColor = readColor("--brand-300", "#8d9ee0");

      ctx!.clearRect(0, 0, width, height);

      const px = (mouseX - 0.5) * PARALLAX_STRENGTH;
      const py = (mouseY - 0.5) * PARALLAX_STRENGTH;

      // Links first (behind nodes), distance-faded so it reads as a sparse web, not a mesh.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > LINK_DISTANCE) continue;
          const alpha = (1 - dist / LINK_DISTANCE) * 0.35;
          ctx!.strokeStyle = linkColor;
          ctx!.globalAlpha = alpha;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x + px * a.depth, a.y + py * a.depth);
          ctx!.lineTo(b.x + px * b.depth, b.y + py * b.depth);
          ctx!.stroke();
        }
      }

      // Nodes on top — closer (higher depth) nodes are slightly larger and move more with the
      // parallax offset, which is the entire depth illusion; no lighting/shadow trickery needed.
      for (const n of nodes) {
        ctx!.globalAlpha = 0.55 + n.depth * 0.35;
        ctx!.fillStyle = nodeColor;
        ctx!.beginPath();
        ctx!.arc(n.x + px * n.depth, n.y + py * n.depth, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      void lineColor; // reserved for a future grid/vignette pass; read now so theme changes invalidate cleanly
    }

    function tick() {
      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = width + 10;
        if (n.x > width + 10) n.x = -10;
        if (n.y < -10) n.y = height + 10;
        if (n.y > height + 10) n.y = -10;
      }
      drawFrame();
      rafId = requestAnimationFrame(tick);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    if (reduceMotion) {
      drawFrame();
    } else {
      window.addEventListener("pointermove", onPointerMove);
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
