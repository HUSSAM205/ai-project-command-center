"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { readVizPalette, type VizPalette } from "./vizTheme";

/** Re-reads the real CSS custom properties (see vizTheme.ts) whenever the resolved theme changes,
 * so a WebGL scene's materials stay in sync with a light/dark toggle the same way the rest of the
 * app's CSS-driven colors do. `resolvedTheme` from next-themes (already used by ThemeToggle.tsx)
 * is the dependency, not a DOM MutationObserver -- simpler, and this app has exactly one place
 * (`.dark` on <html>) that changes these values. readVizPalette() itself is SSR-safe (falls back
 * to :root's literal values when `window` isn't defined), so it doubles as the initial state. */
export function useVizPalette(): VizPalette {
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = useState<VizPalette>(readVizPalette);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an external source (the DOM's .dark class / next-themes), not deriving from props/state
    setPalette(readVizPalette());
  }, [resolvedTheme]);

  return palette;
}
