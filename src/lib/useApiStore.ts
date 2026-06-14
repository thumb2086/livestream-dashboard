"use client";

import { useState, useEffect, useCallback } from "react";

export function useApiStore<T>(
  fetchFn: () => Promise<T>,
  saveFn: (val: T) => Promise<T>,
  defaultValue: T,
): [T, (val: T) => Promise<void>, boolean] {
  const [state, setState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFn().then((data) => {
      if (!cancelled) {
        setState(data);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (val: T) => {
    setState(val);
    try {
      const result = await saveFn(val);
      setState(result);
    } catch {
      // revert on error? for now keep optimistic
    }
  }, [saveFn]);

  return [state, save, loading];
}
