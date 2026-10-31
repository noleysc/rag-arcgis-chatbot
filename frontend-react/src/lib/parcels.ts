// Lee County Property Appraiser parcels — the layer the pipeline checks map
// points against (pipeline/verify.py). Public and CORS-enabled.
const PARCELS_URL =
  "https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query";

/** A parcel's outline: rings of [lon, lat]. */
export type ParcelOutline = Array<Array<[number, number]>>;

// Outlines are kept in localStorage for a month, so a return visit costs no
// request. This is county parcel data, not Esri imagery (which we may not
// store). Parcels are redrawn rarely; a stale outline only shifts a
// thumbnail's framing.
const CACHE_KEY = "engage-estero:parcel-outlines:v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  /** null: the county layer has no such parcel. */
  outline: ParcelOutline | null;
}

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked: fetch again next visit.
  }
}

/** Lee County STRAP, e.g. 214625E4017000010. Also keeps the where clause safe. */
const STRAP = /^[0-9A-Z]{17}$/;

interface ParcelResponse {
  features?: Array<{ attributes: { STRAP: string | null }; geometry?: { rings?: ParcelOutline } }>;
  error?: { message?: string };
}

/** Outlines for the given parcel IDs. An ID the county layer doesn't have
 * maps to null. */
export async function fetchParcelOutlines(ids: string[]): Promise<Map<string, ParcelOutline | null>> {
  const now = Date.now();
  const cache = readCache();
  const out = new Map<string, ParcelOutline | null>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = cache[id];
    if (!STRAP.test(id)) out.set(id, null);
    else if (hit && now - hit.at < CACHE_TTL_MS) out.set(id, hit.outline);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const qs = new URLSearchParams({
    where: `STRAP IN (${missing.map((id) => `'${id}'`).join(",")})`,
    outFields: "STRAP",
    returnGeometry: "true",
    outSR: "4326",
    // ~1 m generalization at 6 decimals: plenty for a thumbnail, and keeps
    // big parcels small enough to cache.
    maxAllowableOffset: "0.00001",
    geometryPrecision: "6",
    f: "json",
  });
  const res = await fetch(`${PARCELS_URL}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ParcelResponse;
  if (data.error) throw new Error(data.error.message || "Parcel query failed");

  // A multipart parcel can come back as several features.
  const found = new Map<string, ParcelOutline>();
  for (const f of data.features || []) {
    const id = f.attributes.STRAP;
    const rings = f.geometry?.rings;
    if (id && rings?.length) found.set(id, [...(found.get(id) || []), ...rings]);
  }
  for (const id of missing) {
    const outline = found.get(id) || null;
    out.set(id, outline);
    cache[id] = { at: now, outline };
  }
  for (const [id, entry] of Object.entries(cache)) {
    if (now - entry.at >= CACHE_TTL_MS) delete cache[id];
  }
  writeCache(cache);
  return out;
}
