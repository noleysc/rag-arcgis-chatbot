import { useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import { Droplets, Factory, FileText, House, Landmark, Route, Store, Users, Wallet, type LucideIcon } from "lucide-react";
import type { MappedLocation } from "../../lib/boardRecords";
import { framePosition, frameTiles } from "../../lib/imagery";
import { isVillageWide, planThumb, type ThumbPlan } from "../../lib/locationFrame";
import { categoryColor } from "../../lib/mapLegend";
import type { ParcelOutline } from "../../lib/parcels";

// A 16:9 aerial thumbnail of where a record is mapped, built from World
// Imagery tiles, with the parcel outline or a marker on top. Records with no
// reliable place get a category placeholder instead. Rendered inside the
// card's <button>, so everything here is phrasing content (spans, img, svg).

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Commercial & Mixed-Use Development": Store,
  "Residential Development": House,
  "Transportation & Mobility": Route,
  "Utilities, Stormwater & Environment": Droplets,
  "Public Facilities & Services": Landmark,
  "Budget, Contracts & Purchasing": Wallet,
  "Meetings, Records & Public Input": Users,
  "Industry, Mining & Agriculture": Factory,
};

// Thumbnails render about this wide on the four-column grid; tiles are
// picked to be sharp at that size on the screen's pixel density (up to 2×).
const THUMB_CSS_PX = 300;

/** The overlay's viewBox, matching the thumbnail's 16:9 shape. */
const VIEW_W = 160;
const VIEW_H = 90;

function outlinePath(plan: Extract<ThumbPlan, { kind: "parcel" }>): string {
  return plan.outline
    .map((ring) =>
      ring
        .map((p, i) => {
          const { x, y } = framePosition(plan.frame, p);
          return `${i ? "L" : "M"}${((x * VIEW_W) / 100).toFixed(2)} ${((y * VIEW_H) / 100).toFixed(2)}`;
        })
        .join(""),
    )
    .map((d) => `${d}Z`)
    .join("");
}

function markTileLoaded(e: SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.classList.add("is-loaded");
}

interface LocationThumbProps {
  title: string;
  category: string;
  location: MappedLocation | null;
  /** The record's parcel outline; undefined while it's being looked up. */
  outline: ParcelOutline | null | undefined;
}

export default function LocationThumb({ title, category, location, outline }: LocationThumbProps) {
  const [failed, setFailed] = useState(false);
  const style = { "--tint": categoryColor(category) } as CSSProperties;

  // Wait for the parcel lookup rather than load the point's tiles and then
  // the parcel's.
  if (location?.parcelId && outline === undefined) {
    return <span className="loc-thumb is-loading" style={style} aria-hidden="true" />;
  }

  const plan = planThumb(title, location, outline ?? null);
  if (!plan || failed) {
    const Icon = CATEGORY_ICONS[category] || FileText;
    const label = failed
      ? "Imagery unavailable"
      : isVillageWide(title)
        ? "Village-wide item"
        : "No mapped location";
    return (
      <span className="loc-thumb loc-thumb-empty" style={style}>
        <span className="loc-thumb-empty-icon" aria-hidden="true">
          <Icon size={24} strokeWidth={1.8} />
        </span>
        <span className="loc-thumb-empty-label">{label}</span>
      </span>
    );
  }

  const pixels = THUMB_CSS_PX * Math.min(2, window.devicePixelRatio || 1);

  let marker;
  if (plan.kind === "parcel") {
    marker = <path className="loc-thumb-parcel" d={outlinePath(plan)} fillRule="evenodd" vectorEffect="non-scaling-stroke" />;
  } else {
    const { x, y } = framePosition(plan.frame, plan.point);
    const cx = (x * VIEW_W) / 100;
    const cy = (y * VIEW_H) / 100;
    marker = (
      <>
        {plan.approximate && <circle className="loc-thumb-area" cx={cx} cy={cy} r={18} vectorEffect="non-scaling-stroke" />}
        <circle className="loc-thumb-dot" cx={cx} cy={cy} r={3.2} vectorEffect="non-scaling-stroke" />
      </>
    );
  }

  return (
    <span className="loc-thumb" style={style}>
      <span className="loc-thumb-view" aria-hidden="true">
        {frameTiles(plan.frame, pixels).map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={markTileLoaded}
            onError={() => setFailed(true)}
            style={{
              left: `${t.left}%`,
              top: `${t.top}%`,
              // A pixel of overlap hides seams from subpixel rounding.
              width: `calc(${t.width}% + 1px)`,
              height: `calc(${t.height}% + 1px)`,
            }}
          />
        ))}
        <svg className="loc-thumb-overlay" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {marker}
        </svg>
      </span>
      {plan.kind === "point" && plan.approximate && <span className="loc-thumb-badge">Approximate location</span>}
      <span className="loc-thumb-credit">Powered by Esri</span>
    </span>
  );
}
