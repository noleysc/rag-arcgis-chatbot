import type { MappedLocation } from "./boardRecords";
import type { ParcelOutline } from "./parcels";
import { THUMB_ASPECT, metersToWorld, toWorld, type Frame, type WorldPoint } from "./imagery";

// How a Recent Projects card frames its aerial thumbnail. Mapped records are
// agenda items, not built projects: the picture shows where an item is
// mapped, so it's only drawn when that place is meaningful.

/** Project names that stand for the whole Village: budgets and CIPs, the
 * comprehensive plan, general planning business, state funding and
 * legislative asks. The pipeline still pins these to a point (inherited from
 * a related item, or Village Hall as the meeting venue), but that point
 * isn't where the item is, so their cards show the category instead. */
const VILLAGE_WIDE =
  /^(general planning|budget\b|comprehensive plan)|capital improvement (plan|program)|state (funding|legislative)/i;

export function isVillageWide(title: string): boolean {
  return VILLAGE_WIDE.test(title);
}

/** Below this the pipeline treats a location as unresolved. */
const MIN_CONFIDENCE = 0.5;

/** Below this a point is a corridor midpoint ("along Corkscrew Road", 0.7)
 * or inherited from a related item (0.5), so it's shown as an area. */
const APPROXIMATE_BELOW = 0.8;

/** Ground width of a point thumbnail by how precisely the point was placed:
 * an address or parcel (≥0.95), a named place, subdivision, or
 * intersection (≥0.8), or an approximate area. */
function pointWidthMeters(confidence: number): number {
  if (confidence >= 0.95) return 350;
  if (confidence >= APPROXIMATE_BELOW) return 800;
  return 1500;
}

/** Parcel outlines are framed with this much room around them, and never
 * tighter than MIN_PARCEL_FRAME_M across. */
const PARCEL_MARGIN = 1.6;
const MIN_PARCEL_FRAME_M = 200;

/** A point this far outside its parcel's bounds means a stale parcel ID. */
const PARCEL_SLACK_M = 30;

export type ThumbPlan =
  | { kind: "parcel"; frame: Frame; outline: WorldPoint[][] }
  | { kind: "point"; frame: Frame; point: WorldPoint; approximate: boolean };

function parcelFrame(outline: WorldPoint[][], point: WorldPoint, lat: number): Frame | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of outline) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const slack = metersToWorld(PARCEL_SLACK_M, lat);
  if (point.x < minX - slack || point.x > maxX + slack || point.y < minY - slack || point.y > maxY + slack) {
    return null;
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: Math.max(
      (maxX - minX) * PARCEL_MARGIN,
      (maxY - minY) * PARCEL_MARGIN * THUMB_ASPECT,
      metersToWorld(MIN_PARCEL_FRAME_M, lat),
    ),
  };
}

/** The thumbnail for a record, or null when it has no reliable place and
 * should get the category placeholder. A parcel outline, when there is one,
 * frames the thumbnail; otherwise it's centered on the record's point. */
export function planThumb(title: string, location: MappedLocation | null, outline: ParcelOutline | null): ThumbPlan | null {
  if (!location || location.confidence < MIN_CONFIDENCE || isVillageWide(title)) return null;
  const point = toWorld(location.lon, location.lat);
  if (outline) {
    const rings = outline.map((ring) => ring.map(([lon, lat]) => toWorld(lon, lat)));
    const frame = parcelFrame(rings, point, location.lat);
    if (frame) return { kind: "parcel", frame, outline: rings };
  }
  return {
    kind: "point",
    frame: { center: point, width: metersToWorld(pointWidthMeters(location.confidence), location.lat) },
    point,
    approximate: location.confidence < APPROXIMATE_BELOW,
  };
}
