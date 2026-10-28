import { useEffect, useState } from "react";

/** `value`, but only after it has stopped changing for `ms` — so typing in a
 * search box fires one query instead of one per keystroke. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
