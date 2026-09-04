"use client";

import { useEffect, useRef } from "react";

// 10s, then 20s, then 30s and holding -- replaces a fixed 3s interval for watching a document's
// PENDING/PROCESSING status. A document's pipeline (parse -> chunk -> embed) takes real seconds,
// not milliseconds, so nothing is lost by checking less often; what's gained is not hammering a
// single free-tier backend worker with a request every 3 seconds for however long processing
// takes, which was contributing to the 429/503 bursts documented in this app's PMO Workspace fix.
const BACKOFF_STEPS_MS = [10_000, 20_000, 30_000];

/**
 * Polls by calling `onTick` on an escalating schedule (BACKOFF_STEPS_MS) while `active` is true;
 * stops entirely (no timers at all) once `active` goes false. Never speeds back up on a failed
 * tick -- the schedule only ever holds or slows, so a sustained outage backs off instead of
 * retrying into it faster. Resets to the fastest step the next time `active` turns true again
 * (a fresh upload starting a new watch shouldn't inherit a previous watch's backed-off pace).
 */
export function useBackoffPoll(active: boolean, onTick: () => void) {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        onTickRef.current();
        step = Math.min(step + 1, BACKOFF_STEPS_MS.length - 1);
        schedule();
      }, BACKOFF_STEPS_MS[step]);
    };
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active]);
}
