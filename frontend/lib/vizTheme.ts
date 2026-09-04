/** Reads real color values out of this app's own CSS custom properties (app/globals.css) for
 * the WebGL visualizations under components/viz/*3D* — same technique NetworkHero.tsx already
 * uses for its Canvas 2D scene, so these components can't drift out of sync with a hand-copied
 * hex palette the way a separately-maintained constants file eventually would. Three.js materials
 * need real color values (not `var(--x)` strings a stylesheet would resolve), which is the only
 * reason this indirection exists at all — the source of truth stays globals.css. */
export interface VizPalette {
  canvas: string;
  surfaceRaised: string;
  border: string;
  textTertiary: string;
  brand: string;
  success: string;
  warning: string;
  high: string;
  critical: string;
  info: string;
  neutral: string;
}

function readVar(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/** Call after the DOM's `.dark` class (see ThemeToggle.tsx) has settled -- e.g. inside a
 * useEffect keyed on the resolved theme, same as NetworkHero.tsx's draw loop re-reads colors
 * every frame rather than caching them once. Fallbacks match app/globals.css's `:root` values. */
export function readVizPalette(): VizPalette {
  return {
    canvas: readVar("--bg-canvas", "#f8fafc"),
    surfaceRaised: readVar("--bg-surface-raised", "#ffffff"),
    // Not --border-default/--border-strong: both are modern `rgb(r g b / a%)` alpha values in
    // this app's stylesheet (composited against whatever sits behind them in the DOM), and
    // THREE.Color has no alpha channel to composite against a WebGL scene the same way. --neutral-400
    // is the closest real, solid token this app already uses for a muted line/border tone.
    border: readVar("--neutral-400", "#94a3b8"),
    textTertiary: readVar("--text-tertiary", "#64748b"),
    brand: readVar("--brand-500", "#3d52a8"),
    success: readVar("--success-solid", "#17835a"),
    warning: readVar("--warning-solid", "#b9770e"),
    high: readVar("--high-solid", "#c2560d"),
    critical: readVar("--critical-solid", "#c62828"),
    info: readVar("--info-solid", "#2b5cc2"),
    neutral: readVar("--neutral-400", "#94a3b8"),
  };
}

/** Mirrors components/ui/Badge.tsx's riskLevelTone mapping (LOW/MEDIUM/HIGH/CRITICAL -> the same
 * semantic tone used everywhere else this value is shown) so a project's risk_level renders in
 * the identical color here as it does in the Badge next to it. */
export function riskLevelVizColor(level: string, palette: VizPalette): string {
  switch (level) {
    case "LOW":
      return palette.success;
    case "MEDIUM":
      return palette.warning;
    case "HIGH":
      return palette.high;
    case "CRITICAL":
      return palette.critical;
    default:
      return palette.neutral;
  }
}
