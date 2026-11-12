import { useEffect, useRef, useState } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import * as bufferOperator from "@arcgis/core/geometry/operators/bufferOperator";
import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import Home from "@arcgis/core/widgets/Home";
import Search from "@arcgis/core/widgets/Search";
import LocatorSearchSource from "@arcgis/core/widgets/Search/LocatorSearchSource";
import Zoom from "@arcgis/core/widgets/Zoom";
import "@arcgis/core/assets/esri/themes/light/main.css";
import { setMapView } from "../../lib/mapViewStore";
import { ExternalIcon, MapIcon, RecordsIcon } from "../Icons/Icons";

// The Estero Board Records webmap, loaded with the JS SDK (not the Instant
// App iframe) so we can constrain navigation and search to the region and
// hand the live MapView to mapViewStore. Its saved initial view is centered
// on Estero, so that stays the default view.
const WEBMAP_ID = "84a56d2f741d49f5a70c547923fb45d5";
const PORTAL_URL = "https://eccl-swfl-safety.maps.arcgis.com";

// The Instant App on the same webmap, kept as the header's "Open" link.
const INSTANT_APP_ID = "4bd1bf488ac943d7966af9f3ccd22302";
const INSTANT_APP_URL = `${PORTAL_URL}/apps/instant/nearby/index.html?appid=${INSTANT_APP_ID}`;

// Lee + Collier County outlines (Esri USA Counties, generalized to ~1 km),
// grown ~5 km so the coast, barrier islands, and county-line roads aren't
// clipped by the simplification. The view's center must stay inside this.
// Lee is two rings: the mainland (with Pine Island) and Sanibel/Captiva.
const COUNTIES = new Polygon({
  rings: [
    [[-80.874,25.983],[-80.875,25.802],[-81.256,25.803],[-81.531,25.915],[-81.718,25.924],[-81.706,26],[-81.795,26.111],[-81.814,26.284],[-81.849,26.332],[-81.818,26.33],[-81.817,26.318],[-81.657,26.318],[-81.656,26.424],[-81.567,26.422],[-81.565,26.514],[-81.269,26.515],[-81.27,26.253],[-80.882,26.259],[-80.874,25.983]],
    [[-81.565,26.514],[-81.567,26.422],[-81.656,26.424],[-81.657,26.318],[-81.817,26.318],[-81.818,26.33],[-81.849,26.332],[-81.864,26.44],[-81.942,26.468],[-81.968,26.517],[-81.929,26.535],[-81.884,26.643],[-81.774,26.71],[-81.897,26.664],[-81.944,26.551],[-82.021,26.525],[-82.084,26.716],[-82.068,26.767],[-81.562,26.767],[-81.565,26.514]],
    [[-82.102,26.586],[-82.067,26.498],[-82.097,26.494],[-82.136,26.643],[-82.183,26.683],[-82.129,26.694],[-82.102,26.586]],
  ],
  spatialReference: { wkid: 4326 },
});
// Planar buffer in degrees; 0.05° is ~5 km here. Also dissolves the shared
// Lee/Collier line into one outline.
const REGION = bufferOperator.execute(COUNTIES, 0.05) as Polygon;
// Zoom 10 shows about the two counties in a desktop-sized map; any further
// out would show the rest of Florida.
const MIN_ZOOM = 10;
const MAX_ZOOM = 19;

// ArcGIS StoryMap "Where Estero Decides: 10 Years of Village Decisions", the
// alternate view behind the Map | Story switch. It must stay *published*, not
// just shared publicly: an unpublished story redirects anonymous visitors to
// an ArcGIS sign-in page that refuses to render in an iframe. The story sizes
// itself to the iframe, not the window, and below roughly 1100px it swaps its
// inline dashboards for link cards — MapPage hides the legend while the story
// is shown so the iframe gets the full page width.
const STORY_MAP_ID = "185eb6332dbf45be8be5213258916b49";
const STORY_MAP_URL = `https://storymaps.arcgis.com/stories/${STORY_MAP_ID}`;

export type MapPanelView = "map" | "story";

const VIEWS: Record<MapPanelView, { url: string; title: string; subtitle: string }> = {
  map: {
    url: INSTANT_APP_URL,
    title: "Estero Board Records",
    subtitle: "Live ArcGIS map · Estero, FL",
  },
  story: {
    url: STORY_MAP_URL,
    title: "Where Estero Decides",
    subtitle: "ArcGIS StoryMap · 10 Years of Village Decisions",
  },
};

interface MapPanelProps {
  onViewChange?: (view: MapPanelView) => void;
}

export default function MapPanel({ onViewChange }: MapPanelProps) {
  const [view, setView] = useState<MapPanelView>("map");
  // The story iframe is only created on first switch (so the default Map view
  // doesn't pay for loading it), then kept mounted so switching back and forth
  // doesn't reload it or lose the reader's scroll position.
  const [storyLoaded, setStoryLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Record<MapPanelView, boolean>>({ map: false, story: false });
  const active = VIEWS[view];

  const switchView = (next: MapPanelView) => {
    if (next === view) return;
    if (next === "story") setStoryLoaded(true);
    setView(next);
    onViewChange?.(next);
  };

  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    const view = new MapView({
      container: mapRef.current,
      map: new WebMap({ portalItem: { id: WEBMAP_ID, portal: { url: PORTAL_URL } } }),
      // Users can't pan the center out of the two counties or zoom out past them.
      constraints: { geometry: REGION, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, rotationEnabled: false },
      ui: { components: [] },
    });
    view.ui.add(new Zoom({ view }), "top-left");
    view.ui.add(new Home({ view }), "top-left");
    view.ui.add(
      new Search({
        view,
        includeDefaultSources: false,
        sources: [
          new LocatorSearchSource({
            url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
            // Without this the SDK sends "Single Line Input", which this
            // locator ignores, and Enter finds nothing.
            singleLineFieldName: "SingleLine",
            name: "ArcGIS World Geocoding Service",
            placeholder: "Find address or place",
            countryCode: "US",
            // Only return places in the Lee + Collier area, not global
            // matches. Locators take an extent here, not a polygon.
            filter: { geometry: REGION.extent ?? undefined },
          }),
        ],
      }),
      "top-right",
    );
    setMapView(view);

    view.when().catch((err: unknown) => {
      // StrictMode's dev double-mount destroys the first view mid-load; that
      // abort isn't a real failure.
      if (cancelled) return;
      console.error("Failed to load web map:", err);
      setLoadError((e) => ({ ...e, map: true }));
    });

    return () => {
      cancelled = true;
      setMapView(null);
      view.destroy();
    };
  }, []);

  return (
    <section id="map-panel">
      <div id="map-header">
        <div id="map-header-left">
          <div id="map-icon">{view === "map" ? <MapIcon size={18} /> : <RecordsIcon size={18} />}</div>
          <div id="map-title">
            <strong>{active.title}</strong>
            <span>{active.subtitle}</span>
          </div>
        </div>
        <div id="map-actions">
          <div className="map-view-switch" role="group" aria-label="Map or story view">
            <button
              type="button"
              className={`map-btn ${view === "map" ? "active" : ""}`}
              aria-pressed={view === "map"}
              onClick={() => switchView("map")}
            >
              Map
            </button>
            <button
              type="button"
              className={`map-btn ${view === "story" ? "active" : ""}`}
              aria-pressed={view === "story"}
              onClick={() => switchView("story")}
            >
              Story
            </button>
          </div>
          <a className="map-btn" href={active.url} target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={14} /> Open<span className="sr-only"> {active.title} in a new tab</span>
          </a>
        </div>
      </div>
      {loadError[view] && (
        <div id="map-error-banner" role="alert">
          ⚠️ The {view === "map" ? "map" : "story"} failed to load.{" "}
          <a href={active.url} target="_blank" rel="noopener noreferrer">
            Open it directly on ArcGIS Online
          </a>
          .
        </div>
      )}
      <div id="viewDiv" ref={mapRef} hidden={view !== "map"} />
      {/* Cross-origin iframe: onError can catch a hard network/navigation
          failure, but not an error the Esri app renders inside its own page —
          that's invisible to us. The "Open directly" link above is the real
          fallback for that case. */}
      {storyLoaded && (
        <iframe
          className="map-story-frame"
          title="Where Estero Decides story map"
          src={STORY_MAP_URL}
          hidden={view !== "story"}
          // Same permissions as Esri's own StoryMap embed snippet.
          allowFullScreen
          allow="geolocation"
          onError={() => setLoadError((e) => ({ ...e, story: true }))}
          style={{ border: "none", width: "100%", height: "100%" }}
        />
      )}
      <div id="map-footer">
        <div id="map-footer-dot" />
        Powered by Esri · ArcGIS Online
      </div>
    </section>
  );
}
