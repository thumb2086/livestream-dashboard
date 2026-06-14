"use client";

import { useState, useEffect } from "react";

export function useClientStore<T>(
  loadFn: () => T,
  saveFn: (v: T) => void,
  defaultValue: T,
): [T, (v: T) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadFn());
    setHydrated(true);
  }, []);

  const save = (val: T) => {
    setState(val);
    saveFn(val);
  };

  return [hydrated ? state : defaultValue, save];
}
