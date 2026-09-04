"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface State<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
}

/** Fetches `fn()` on mount and whenever a value in `deps` changes; exposes `reload` for manual
 * refetch. A caller polling this via `reload()` (documents/PMO/etc. watching an in-progress
 * status) never has the UI wiped back to a loading skeleton or an empty/error state on a
 * background refresh once real data has loaded once — same "don't hide good data behind a
 * spinner, only ever show a blocking state before anything has loaded" rule
 * lib/useDashboardStream.ts already applies, just generalized to every useApi caller instead of
 * being reimplemented per page. */
export function useApi<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the latest `fn` available to the fetch effect without adding it (a fresh closure on every
  // render) to that effect's dependency array — the ref is only ever written post-render, in an effect.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  // Mirrors state.data one render behind, purely so the fetch effect below can check "do we
  // already have something to show" without adding state.data itself to its dependency array
  // (which would refetch on every successful load).
  const dataRef = useRef<T | null>(null);
  useEffect(() => {
    dataRef.current = state.data;
  }, [state.data]);

  // Deps are caller-supplied and can vary in length between call sites, so they can't be spread
  // into a literal hook dependency array; serialize them into one stable key instead.
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    setState((s) => (dataRef.current === null ? { ...s, loading: true, error: null } : s));
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: dataRef.current, error, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [depsKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}
