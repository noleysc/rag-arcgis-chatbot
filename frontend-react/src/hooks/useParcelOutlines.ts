import { useEffect, useState } from "react";
import { fetchParcelOutlines, type ParcelOutline } from "../lib/parcels";

/** Parcel outlines for the given IDs: undefined while loading, otherwise a
 * map by ID. If the county layer is unreachable the map is empty, and
 * thumbnails frame the record's point instead. */
export function useParcelOutlines(ids: string[]): Map<string, ParcelOutline | null> | undefined {
  const key = [...new Set(ids)].sort().join(",");
  const [result, setResult] = useState<{ key: string; outlines: Map<string, ParcelOutline | null> }>();

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchParcelOutlines(key.split(","))
      .then((outlines) => !cancelled && setResult({ key, outlines }))
      .catch(() => !cancelled && setResult({ key, outlines: new Map() }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key) return new Map();
  return result?.key === key ? result.outlines : undefined;
}
