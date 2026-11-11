import { useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import "@arcgis/core/assets/esri/themes/light/main.css";
import { setMapView } from "../../lib/mapViewStore";
import { ExternalIcon, MapIcon, RecordsIcon } from "../Icons/Icons";

// Same webmap the Instant App wraps — load it with the JS SDK so Show on map /
// query pins can drive a live MapView (see docs/MAP_UX_PLAN.md Phase 1).
const WEBMAP_ID = "84a56d2f741d49f5a70c547923fb45d5";
const INSTANT_APP_ID = "4bd1bf488ac943d7966af9f3ccd22302";
const INSTANT_APP_URL = `https://eccl-swfl-safety.maps.arcgis.com/apps/instant/nearby/index.html?appid=${INSTANT_APP_ID}`;

// ArcGIS StoryMap "Where Estero Decides: 10 Years of Village Decisions".
const STORY_MAP_ID = "185eb6332dbf45be8be5213258916b49";
const STORY_MAP_URL = `https://storymaps.arcgis.com/stories/${STORY_MAP_ID}`;

export type MapPanelView = "map" | "story";

const VIEWS: Record<MapPanelView, { url: string; title: string; subtitle: string }> = {
  map: {
    url: INSTANT_APP_URL,
    title: "Estero Board Records",
    subtitle: "Live ArcGIS map · Village of Estero",
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
  const [storyLoaded, setStoryLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [storyError, setStoryError] = useState(false);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapViewRef = useRef<MapView | null>(null);
  const active = VIEWS[view];

  const switchView = (next: MapPanelView) => {
    if (next === view) return;
    if (next === "story") setStoryLoaded(true);
    setView(next);
    onViewChange?.(next);
  };

  useEffect(() => {
    let cancelled = false;
    let handle: MapView | null = null;

    async function mountMap() {
      const node = mapNodeRef.current;
      if (!node) return;
      try {
        const [{ default: esriConfig }, { default: WebMap }, { default: MapView }] = await Promise.all([
          import("@arcgis/core/config.js"),
          import("@arcgis/core/WebMap.js"),
          import("@arcgis/core/views/MapView.js"),
        ]);
        // Workers / fonts / localization from the published package on the CDN
        // so Vite builds don't need to copy node_modules assets.
        esriConfig.assetsPath = "https://cdn.jsdelivr.net/npm/@arcgis/core@5.1.12/assets";

        const webmap = new WebMap({
          portalItem: { id: WEBMAP_ID },
        });
        handle = new MapView({
          container: node,
          map: webmap,
          constraints: { snapToZoom: false },
          popup: { defaultPopupTemplateEnabled: true },
        });
        await handle.when();
        if (cancelled) {
          handle.destroy();
          return;
        }
        mapViewRef.current = handle;
        setMapView(handle);
        setMapError(false);
      } catch (err) {
        console.error("MapView failed to load", err);
        if (!cancelled) {
          setMapError(true);
          setMapView(null);
        }
      }
    }

    void mountMap();
    return () => {
      cancelled = true;
      setMapView(null);
      mapViewRef.current = null;
      if (handle) {
        handle.destroy();
        handle = null;
      }
    };
  }, []);

  // After switching back from Story, the container may have been display:none;
  // nudge the view to recalculate size so goTo/pan land correctly.
  useEffect(() => {
    if (view !== "map") return;
    const mv = mapViewRef.current;
    if (!mv) return;
    requestAnimationFrame(() => {
      try {
        mv.resize();
      } catch {
        /* ignore */
      }
    });
  }, [view]);

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
            <ExternalIcon size={14} /> Open full {view === "map" ? "map" : "story"}
            <span className="sr-only"> {active.title} in a new tab</span>
          </a>
        </div>
      </div>
      {view === "map" && mapError && (
        <div id="map-error-banner" role="alert">
          ⚠️ The map failed to load.{" "}
          <a href={INSTANT_APP_URL} target="_blank" rel="noopener noreferrer">
            Open the Instant App on ArcGIS Online
          </a>
          .
        </div>
      )}
      {view === "story" && storyError && (
        <div id="map-error-banner" role="alert">
          ⚠️ The story failed to load.{" "}
          <a href={STORY_MAP_URL} target="_blank" rel="noopener noreferrer">
            Open it directly on ArcGIS Online
          </a>
          .
        </div>
      )}
      <div
        id="viewDiv"
        ref={mapNodeRef}
        hidden={view !== "map"}
        role="application"
        aria-label="Estero board records map"
      />
      {storyLoaded && (
        <iframe
          className="map-story-frame"
          title="Where Estero Decides story map"
          src={STORY_MAP_URL}
          hidden={view !== "story"}
          allowFullScreen
          allow="geolocation"
          onError={() => setStoryError(true)}
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
