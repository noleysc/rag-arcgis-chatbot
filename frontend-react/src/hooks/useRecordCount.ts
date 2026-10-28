import { useEffect, useState } from "react";
import { fetchRecordCount } from "../lib/boardRecords";

/** undefined = loading, null = layer unreachable, number = live count. */
export function useRecordCount(): number | null | undefined {
  const [count, setCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchRecordCount()
      .then((n) => !cancelled && setCount(n))
      .catch(() => !cancelled && setCount(null));
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
