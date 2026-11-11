// Legend entries for the Explore Map page, read from the same webmap the
// MapPanel MapView loads, so the swatches match the picture markers on the map.
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

/** Main color of each category's marker image in the webmap, for places that
 * draw plain dots instead of the markers (the Home map preview). */
const CATEGORY_COLORS: Record<string, string> = {
  "Commercial & Mixed-Use Development": "#8335a8",
  "Transportation & Mobility": "#ffd700",
  "Meetings, Records & Public Input": "#c12e00",
  "Utilities, Stormwater & Environment": "#71c96e",
  "Residential Development": "#e29c00",
  "Public Facilities & Services": "#74cdaa",
  "Budget, Contracts & Purchasing": "#31a066",
  "Industry, Mining & Agriculture": "#707175",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] || "#9aa3ad";
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
