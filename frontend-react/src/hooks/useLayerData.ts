import { useEffect, useState } from "react";

/** Runs a one-shot board-records layer query on mount. Pass a stable
 * (module-level) loader. undefined = loading, null = layer unreachable,
 * otherwise the result. */
export function useLayerData<T>(load: () => Promise<T>): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [load]);

  return data;
}
