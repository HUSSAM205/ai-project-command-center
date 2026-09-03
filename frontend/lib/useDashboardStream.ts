"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, API_BASE_URL, getToken } from "./api";
import type { DashboardSummary } from "./types";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "offline";

const POLL_INTERVAL_MS = 4000;
// A single dropped SSE ping (or one slow poll tick) can flip the raw status to "reconnecting" for
// a moment before it self-corrects on the very next event/tick -- that's real, but showing it to a
// visitor for under a second reads as flicker rather than signal. Hold the *displayed* status a
// beat before reflecting a reconnecting/offline transition; a genuine sustained issue (e.g. the
// free-tier backend's actual cold start) still shows honestly once it clears this bar. Immediate
// on the way back to "live" -- recovery should never be hidden or delayed.
const RECONNECT_DISPLAY_DELAY_MS = 3000;

/**
 * Live-updating dashboard summary.
 *
 * Auth approach: `GET /api/v1/dashboard/stream` requires the same bearer auth as the rest of the
 * API, but `EventSource` cannot set an `Authorization` header. We pass the token as a `?token=`
 * query param (the documented workaround for SSE + bearer auth) rather than switching to polling
 * as the primary transport — SSE is the more correct choice here because the backend only emits an
 * event when the underlying data actually changes, so it's cheaper and lower-latency than polling
 * a portfolio-wide aggregate every few seconds. Polling is kept as an automatic fallback: if the
 * stream never manages to open (endpoint not deployed yet, network policy blocking it, etc.) this
 * hook transparently switches to polling `GET /dashboard` every ~4s instead, so the page still
 * updates. A plain one-shot `GET /dashboard` always fires immediately on mount regardless of how
 * the stream behaves, so the dashboard has real data even if both live paths fail outright.
 */
export function useDashboardStream() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  // Only ever written from the timer below, never synchronously from the effect body -- when
  // `status` itself is "live"/"connecting" the render-time ternary below reads `status` directly
  // and this stale value is simply not consulted, so it needs no matching "clear" write either.
  const [delayedBadStatus, setDelayedBadStatus] = useState<StreamStatus>("connecting");
  const [retryKey, setRetryKey] = useState(0);

  const dataRef = useRef<DashboardSummary | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // See RECONNECT_DISPLAY_DELAY_MS above: debounces only the "things got worse" transitions.
  useEffect(() => {
    if (status === "live" || status === "connecting") return;
    const timer = setTimeout(() => setDelayedBadStatus(status), RECONNECT_DISPLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const displayStatus = status === "live" || status === "connecting" ? status : delayedBadStatus;

  const reload = useCallback(() => {
    setLoading((prev) => (dataRef.current ? prev : true));
    setError(null);
    setStatus("connecting");
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let everConnected = false;

    function applyData(d: DashboardSummary) {
      if (cancelled) return;
      setData(d);
      setLoading(false);
      setError(null);
    }

    function applyFailure(err: Error) {
      if (cancelled) return;
      // Keep showing the last-known-good dashboard on transient failures; only surface a
      // blocking error state if we have never successfully loaded anything at all.
      if (!dataRef.current) {
        setError(err);
        setLoading(false);
      }
    }

    function startPolling() {
      if (pollId) return;
      const tick = () => {
        api
          .dashboard()
          .then((d) => {
            applyData(d);
            if (!cancelled) setStatus("live");
          })
          .catch((err) => {
            applyFailure(err);
            if (!cancelled) setStatus(dataRef.current ? "reconnecting" : "offline");
          });
      };
      tick();
      pollId = setInterval(tick, POLL_INTERVAL_MS);
    }

    // Always fetch once via the plain endpoint immediately, independent of SSE — this is what
    // guarantees the dashboard keeps working even if the stream is unreachable.
    api.dashboard().then(applyData).catch(applyFailure);

    const token = getToken();
    if (typeof EventSource === "undefined" || !token) {
      startPolling();
      return () => {
        cancelled = true;
        if (pollId) clearInterval(pollId);
      };
    }

    try {
      es = new EventSource(`${API_BASE_URL}/dashboard/stream?token=${encodeURIComponent(token)}`);
    } catch {
      startPolling();
      return () => {
        cancelled = true;
        if (pollId) clearInterval(pollId);
      };
    }

    es.onopen = () => {
      everConnected = true;
      if (!cancelled) setStatus("live");
    };

    es.onmessage = (event) => {
      if (!event.data) return; // keep-alive `:` comments never reach onmessage; guard defensively anyway
      try {
        applyData(JSON.parse(event.data) as DashboardSummary);
        if (!cancelled) setStatus("live");
      } catch {
        // ignore malformed payloads rather than tearing down the connection
      }
    };

    es.onerror = () => {
      if (cancelled) return;
      if (!everConnected) {
        // Never managed to open the stream at all — treat it as unreachable and fall back to
        // polling the plain endpoint instead of waiting on indefinite SSE retries.
        es?.close();
        es = null;
        startPolling();
        return;
      }
      // Had a working connection before; the browser retries the same EventSource automatically
      // unless it has fully closed.
      setStatus(es && es.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    };

    return () => {
      cancelled = true;
      es?.close();
      if (pollId) clearInterval(pollId);
    };
  }, [retryKey]);

  return { data, loading, error, status: displayStatus, reload };
}
