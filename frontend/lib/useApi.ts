"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface State<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
}

/** Fetches `fn()` on mount and whenever a value in `deps` changes; exposes `reload` for manual refetch. */
export function useApi<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the latest `fn` available to the fetch effect without adding it (a fresh closure on every
  // render) to that effect's dependency array — the ref is only ever written post-render, in an effect.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  // Deps are caller-supplied and can vary in length between call sites, so they can't be spread
  // into a literal hook dependency array; serialize them into one stable key instead.
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the loading state for this fetch
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [depsKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}
