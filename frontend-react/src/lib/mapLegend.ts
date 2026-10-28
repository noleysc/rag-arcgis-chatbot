// Legend entries for the Explore Map page, read from the same webmap the
// Instant App embeds, so the swatches are the exact picture markers drawn on
// the map. The iframe is cross-origin, so we can't read its legend directly.
const WEBMAP_DATA_URL = "https://www.arcgis.com/sharing/rest/content/items/84a56d2f741d49f5a70c547923fb45d5/data?f=json";

export interface LegendEntry {
  /** LayerCategory value on the feature layer. */
  category: string;
  label: string;
  /** data: URI of the marker image, or null if the symbol isn't a picture. */
  icon: string | null;
}

interface WebmapSymbol {
  type?: string;
  imageData?: string;
  contentType?: string;
  url?: string;
}

interface WebmapData {
  operationalLayers?: Array<{
    visibility?: boolean;
    layerDefinition?: {
      drawingInfo?: {
        renderer?: {
          uniqueValueInfos?: Array<{ value: string; label?: string; symbol?: WebmapSymbol }>;
        };
      };
    };
  }>;
}

/** Short names for chips and tags; the legend shows the full label. */
const SHORT_LABELS: Record<string, string> = {
  "Commercial & Mixed-Use Development": "Commercial",
  "Residential Development": "Residential",
  "Transportation & Mobility": "Transportation",
  "Utilities, Stormwater & Environment": "Utilities & Environment",
  "Public Facilities & Services": "Public Facilities",
  "Budget, Contracts & Purchasing": "Budget & Contracts",
  "Meetings, Records & Public Input": "Meetings & Public Input",
  "Industry, Mining & Agriculture": "Industry & Agriculture",
};

export function shortCategory(category: string): string {
  return SHORT_LABELS[category] || category;
}

function symbolIcon(symbol: WebmapSymbol | undefined): string | null {
  if (!symbol || symbol.type !== "esriPMS") return null;
  if (symbol.imageData) return `data:${symbol.contentType || "image/png"};base64,${symbol.imageData}`;
  return symbol.url || null;
}

export async function fetchLegend(): Promise<LegendEntry[]> {
  const res = await fetch(WEBMAP_DATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as WebmapData;
  // The webmap also carries a hidden "-Copy" of the layer; use the visible one.
  const layer = data.operationalLayers?.find((l) => l.visibility !== false);
  const infos = layer?.layerDefinition?.drawingInfo?.renderer?.uniqueValueInfos || [];
  if (infos.length === 0) throw new Error("No legend in webmap");
  return infos.map((info) => ({
    category: info.value,
    label: info.label || info.value,
    icon: symbolIcon(info.symbol),
  }));
}
