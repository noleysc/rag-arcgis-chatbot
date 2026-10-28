// The public feature layer behind the Instant App map. It's queryable on its
// own (CORS-enabled, no token), so the header count, Board Records table, and
// Meetings documents read it directly — same source the map draws from.
const LAYER_URL =
  "https://services2.arcgis.com/UzlfiFv8kzq0Q4vo/arcgis/rest/services/Estero_Board_Records_%E2%80%94_All_Categories/FeatureServer/0";

interface QueryResponse<T> {
  features?: Array<{ attributes: T }>;
  count?: number;
  error?: { message?: string };
}

async function queryLayer<T>(params: Record<string, string | number | boolean>): Promise<QueryResponse<T>> {
  const qs = new URLSearchParams({ f: "json" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${LAYER_URL}/query?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as QueryResponse<T>;
  // ArcGIS reports query errors with a 200 and an `error` body.
  if (data.error) throw new Error(data.error.message || "ArcGIS query failed");
  return data;
}

/** Total point count on the map layer — what the header's live badge shows. */
export async function fetchRecordCount(): Promise<number> {
  const data = await queryLayer({ where: "1=1", returnCountOnly: true });
  if (typeof data.count !== "number") throw new Error("No count in response");
  return data.count;
}
