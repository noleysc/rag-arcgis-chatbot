// Esri World Imagery: the aerial basemap behind the Recent Projects
// thumbnails and the Home map preview.
//
// Thumbnails are built from the service's tiles rather than /export: tiles
// come back with a one-day max-age (export images are max-age=0, so they're
// re-checked on every visit), Esri's CDN shares them, and neighboring
// thumbnails reuse each other's tiles. Esri's terms allow that ordinary HTTP
// caching but not storing or harvesting basemap imagery ourselves, so
// nothing here saves tiles.
const SERVICE = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer";

export const IMAGERY_EXPORT = `${SERVICE}/export`;

export const ESRI_URL = "https://www.esri.com/";

/** The service's credit line as of Oct 2026, shown until the live copy loads. */
export const IMAGERY_CREDIT_FALLBACK = "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community";

let creditRequest: Promise<string> | null = null;

/** The imagery's data attribution — the service's own copyrightText. Esri
 * requires it, with "Powered by Esri", wherever the imagery shows. The
 * vendor list changes (Maxar became Vantor), so it's read live, once per
 * session. */
export function fetchImageryCredit(): Promise<string> {
  creditRequest ??= fetch(`${SERVICE}?f=json`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = (await res.json()) as { copyrightText?: string };
      const credit = info.copyrightText?.trim();
      if (!credit) throw new Error("No copyright text on service");
      return credit;
    })
    .catch((err: unknown) => {
      creditRequest = null;
      throw err;
    });
  return creditRequest;
}

/** Web Mercator "world" coordinates: 0–1 west→east and north→south, the
 * space map tiles are cut from. */
export interface WorldPoint {
  x: number;
  y: number;
}

export function toWorld(lon: number, lat: number): WorldPoint {
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) };
}

const EARTH_CIRCUMFERENCE = 40075016.686;

/** World units spanning `meters` on the ground at latitude `lat`. */
export function metersToWorld(meters: number, lat: number): number {
  return meters / (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180));
}

export const THUMB_ASPECT = 16 / 9;

/** A 16:9 view: its center and width in world units. */
export interface Frame {
  center: WorldPoint;
  width: number;
}

/** One imagery tile, placed as percentages of the frame. */
export interface Tile {
  key: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Imagery covers Estero to level 20; 19 is already sharper than a
 * thumbnail needs. */
const MAX_ZOOM = 19;

/** The tiles covering `frame`, at the zoom where it's about `pixels` wide. */
export function frameTiles(frame: Frame, pixels: number): Tile[] {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.round(Math.log2(pixels / (frame.width * 256)))));
  const n = 2 ** zoom;
  // Frame size and top-left corner in tiles at this zoom.
  const w = frame.width * n;
  const h = w / THUMB_ASPECT;
  const left = frame.center.x * n - w / 2;
  const top = frame.center.y * n - h / 2;
  const tiles: Tile[] = [];
  for (let row = Math.floor(top); row < top + h; row++) {
    for (let col = Math.floor(left); col < left + w; col++) {
      tiles.push({
        key: `${zoom}/${row}/${col}`,
        url: `${SERVICE}/tile/${zoom}/${row}/${col}`,
        left: ((col - left) / w) * 100,
        top: ((row - top) / h) * 100,
        width: 100 / w,
        height: 100 / h,
      });
    }
  }
  return tiles;
}

/** Where a world point falls in a frame, as percentages across and down. */
export function framePosition(frame: Frame, p: WorldPoint): { x: number; y: number } {
  const height = frame.width / THUMB_ASPECT;
  return {
    x: ((p.x - frame.center.x) / frame.width + 0.5) * 100,
    y: ((p.y - frame.center.y) / height + 0.5) * 100,
  };
}
