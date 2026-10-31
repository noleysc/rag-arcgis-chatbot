import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchMapPoints, type MapPoint } from "../../lib/boardRecords";
import { IMAGERY_EXPORT } from "../../lib/imagery";
import { categoryColor, shortCategory } from "../../lib/mapLegend";
import { routeHref } from "../../lib/router";
import { useLayerData } from "../../hooks/useLayerData";
import ImageryCredit from "../ImageryCredit/ImageryCredit";
import { ArrowRightIcon, MapPinIcon } from "../Icons/Icons";

// A static picture of the map for the Home page: one Esri World Imagery
// export of the Village, with the layer's points drawn on top as dots. The
// real map is a cross-origin Instant App iframe — too heavy to load twice,
// and a pannable map inside a scrolling page traps the wheel anyway.

// Frame: the latitudes covering the layer's 1st–99th percentile points plus a
// margin, widened around the Village's center to the preview's 16:10 shape.
// Points outside it (a few on the county line) are left off the preview.
const SOUTH = 26.383;
const NORTH = 26.458;
const CENTER_LON = -81.782;
const IMAGE_W = 1120;
const IMAGE_H = 700;

const EARTH_RADIUS = 6378137;
const mercX = (lon: number) => ((lon * Math.PI) / 180) * EARTH_RADIUS;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * EARTH_RADIUS;

const FRAME = (() => {
  const ymin = mercY(SOUTH);
  const ymax = mercY(NORTH);
  const halfWidth = ((ymax - ymin) * IMAGE_W) / IMAGE_H / 2;
  const cx = mercX(CENTER_LON);
  return { xmin: cx - halfWidth, xmax: cx + halfWidth, ymin, ymax };
})();

const IMAGERY_URL =
  `${IMAGERY_EXPORT}?bbox=${[FRAME.xmin, FRAME.ymin, FRAME.xmax, FRAME.ymax].join(",")}` +
  `&bboxSR=3857&imageSR=3857&size=${IMAGE_W},${IMAGE_H}&format=jpg&f=image`;

interface Place {
  key: string;
  left: number;
  top: number;
  /** Records at this spot; sizes the dot. */
  count: number;
  /** Newest record here; colors the dot. */
  latest: MapPoint;
}

/** Group points by spot (an agenda item and its follow-ups share one) and
 * place each spot in the frame as a percentage. Input is newest-first. */
function toPlaces(points: MapPoint[]): Place[] {
  const byKey = new Map<string, Place>();
  for (const p of points) {
    const left = ((p.x - FRAME.xmin) / (FRAME.xmax - FRAME.xmin)) * 100;
    const top = ((FRAME.ymax - p.y) / (FRAME.ymax - FRAME.ymin)) * 100;
    if (left < 0 || left > 100 || top < 0 || top > 100) continue;
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    const place = byKey.get(key);
    if (place) place.count += 1;
    else byKey.set(key, { key, left, top, count: 1, latest: p });
  }
  // Big dots first so small ones stay visible on top of them.
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface MapPreviewProps {
  onAsk: (question: string) => void;
}

export default function MapPreview({ onAsk }: MapPreviewProps) {
  const points = useLayerData(fetchMapPoints);
  const [imageFailed, setImageFailed] = useState(false);

  const places = useMemo(() => (points ? toPlaces(points) : []), [points]);
  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points || []) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return [...counts.entries()].filter(([category]) => category).sort((a, b) => b[1] - a[1]);
  }, [points]);
  const newest = points?.[0];

  return (
    <section className="card card-pad map-preview" aria-labelledby="map-preview-title">
      <div className="home-card-head">
        <span className="home-card-icon">
          <MapPinIcon size={20} />
        </span>
        <div className="home-card-titles">
          <h2 id="map-preview-title">Interactive Map</h2>
          <p>Every board record with a location, from the live ArcGIS layer.</p>
        </div>
        <a className="card-link" href={routeHref("map")}>
          View full map <ArrowRightIcon size={14} />
        </a>
      </div>

      <div className="map-preview-frame">
        <a className="map-preview-link" href={routeHref("map")} aria-label="Open the interactive map">
          {!imageFailed && (
            <img src={IMAGERY_URL} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          )}
          {places.map((place) => (
            <span
              key={place.key}
              className={`map-preview-dot${place.latest === newest ? " is-newest" : ""}`}
              style={
                {
                  left: `${place.left}%`,
                  top: `${place.top}%`,
                  background: categoryColor(place.latest.category),
                  "--dot": `${Math.min(13, 5 + Math.sqrt(place.count) * 1.8)}px`,
                } as CSSProperties
              }
              aria-hidden="true"
            />
          ))}
        </a>

        {newest && (
          <div className="map-preview-callout">
            <span className="map-preview-eyebrow">Latest on the map</span>
            <strong>{newest.title}</strong>
            <span className="map-preview-meta">
              {shortCategory(newest.category)} · {formatDate(newest.date)}
            </span>
            <button type="button" onClick={() => onAsk(`What happened with ${newest.title}?`)}>
              Ask about this <ArrowRightIcon size={13} />
            </button>
          </div>
        )}
      </div>
      <ImageryCredit />

      {points === null && <p className="pulse-empty">Couldn’t load map records right now.</p>}
      {legend.length > 0 && (
        <ul className="map-preview-legend" aria-label="Records by category">
          {legend.map(([category, count]) => (
            <li key={category}>
              <span className="map-preview-swatch" style={{ background: categoryColor(category) }} aria-hidden="true" />
              {shortCategory(category)}
              <span className="map-preview-count">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
