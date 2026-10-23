import { useEffect, useRef, useState } from "react";
import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import Home from "@arcgis/core/widgets/Home";
import Zoom from "@arcgis/core/widgets/Zoom";
import Search from "@arcgis/core/widgets/Search";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import "@arcgis/core/assets/esri/themes/light/main.css";
import { setMapView } from "../../lib/mapViewStore";
import { scrollToRecord } from "../../lib/recordScroll";
import { setMapContext, type MapContextSelection } from "../../lib/uiStore";

// Same webmap as EngageDash2 and the former Instant App embed. Loading it
// with the JS SDK (not an iframe) reconnects mapViewStore so chat answers
// can pan, zoom, and drop result pins.
const WEBMAP_ID = "84a56d2f741d49f5a70c547923fb45d5";
const PORTAL_URL = "https://eccl-swfl-safety.maps.arcgis.com";
const MAP_VIEWER_URL = `${PORTAL_URL}/apps/mapviewer/index.html?webmap=${WEBMAP_ID}`;
const DASHBOARD_URL = `${PORTAL_URL}/apps/dashboards/5c0ad86cd15143909018507fd35b4625`;

interface MapPanelProps {
  expanded: boolean;
  onToggleExpand: () => void;
  onRecordCount: (count: number | null) => void;
  onSend?: (text: string) => void;
}

function extractFeatureMeta(attrs: Record<string, unknown>): MapContextSelection | null {
  const str = (...keys: string[]) => {
    for (const k of keys) {
      const v = attrs[k];
      if (v !== undefined && v !== null && String(v).trim() && String(v).toLowerCase() !== "nan") {
        return String(v).trim();
      }
    }
    return "";
  };
  const title = str(
    "ProjectName",
    "ProjectTitle",
    "project_name",
    "Project_Name",
    "Name",
    "TITLE",
    "Title",
    "label",
  );
  const appId = str("ApplicationID", "ApplicationId", "application_id", "Application_ID", "recordId");
  const location = str(
    "Location",
    "LocationName",
    "AddressNormalized",
    "AddressRaw",
    "Address",
    "location",
  );
  if (!title && !appId && !location) return null;
  return { title, appId, location };
}

// MapView (v5 @arcgis/core) watches its container with a ResizeObserver and
// resizes itself automatically — no manual view.resize() call needed when
// the grid-template-columns transition changes the container's width.

export default function MapPanel({ expanded, onToggleExpand, onRecordCount, onSend }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MapContextSelection | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const webmap = new WebMap({
      portalItem: {
        id: WEBMAP_ID,
        portal: { url: PORTAL_URL },
      },
    });
    const view = new MapView({
      container: containerRef.current,
      map: webmap,
      ui: { components: [] },
    });
    view.ui.add(new Zoom({ view }), "top-left");
    view.ui.add(new Home({ view }), "top-left");
    view.ui.add(new Search({ view }), "top-right");
    viewRef.current = view;
    setMapView(view);

    const clickHandle = view.on("click", async (event) => {
      try {
        const hit = await view.hitTest(event);
        if (cancelled) return;
        const graphicHit = hit.results.find(
          (r): r is Extract<(typeof hit.results)[number], { type: "graphic" }> =>
            r.type === "graphic" && !!r.graphic?.attributes,
        );
        if (!graphicHit || !graphicHit.graphic.attributes) {
          setSelectedFeature(null);
          return;
        }
        const attrs = graphicHit.graphic.attributes as Record<string, unknown>;
        if (typeof attrs.recordId === "string" && attrs.recordId) {
          scrollToRecord(attrs.recordId);
        }
        const meta = extractFeatureMeta(attrs);
        setSelectedFeature(meta);
      } catch {
        // best-effort hitTest
      }
    });

    webmap
      .when(() => {
        if (cancelled) return;
        setLoadError(false);
        const featureLayers = webmap.layers
          .toArray()
          .filter((l) => l.type === "feature") as FeatureLayer[];
        let total = 0;
        const loads = featureLayers.map((l) =>
          l.load().then(() => {
            l.outFields = ["*"];
            return l.queryFeatureCount().then((n) => {
              total += n;
            });
          }),
        );
        Promise.all(loads)
          .then(() => {
            if (!cancelled) onRecordCount(total);
          })
          .catch(() => {
            if (!cancelled) onRecordCount(null);
          });
      })
      .catch((err: unknown) => {
        // In StrictMode dev, the first mount is deliberately torn down mid-load
        // (view.destroy() below aborts the in-flight request) — that's expected
        // and not a real failure, so only surface errors from the live mount.
        if (cancelled) return;
        console.error("Failed to load web map:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
      clickHandle.remove();
      setMapView(null);
      viewRef.current = null;
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatFeatureSubject = (feat: MapContextSelection): string => {
    return [
      feat.title,
      feat.appId ? `(${feat.appId})` : "",
      !feat.title && feat.location ? `at ${feat.location}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const handleAskChatbot = () => {
    if (!selectedFeature || !onSend) return;
    const subject = formatFeatureSubject(selectedFeature);
    if (!subject) return;
    if (expanded) onToggleExpand();
    onSend(`Tell me about ${subject}`);
  };

  const handleAttachContext = () => {
    if (!selectedFeature) return;
    setMapContext(selectedFeature);
    if (expanded) onToggleExpand();
  };

  return (
    <section id="map-panel">
      <div id="map-header">
        <div id="map-header-left">
          <div id="map-icon">🗺</div>
          <div id="map-title">
            <strong>Project Map</strong>
            <span>Village of Estero · Live ArcGIS</span>
          </div>
        </div>
        <div id="map-actions">
          <button type="button" className="map-btn" id="expand-btn" onClick={onToggleExpand}>
            {expanded ? "⤡ Collapse" : "⤢ Expand"}
          </button>
          <a className="map-btn" href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
            ↗ Dashboard
          </a>
          <a className="map-btn" href={MAP_VIEWER_URL} target="_blank" rel="noopener noreferrer">
            ↗ Open
          </a>
        </div>
      </div>
      <div id="map-label">Estero Board Records · Click any pin or feature to ask the chatbot</div>
      {loadError && (
        <div id="map-error-banner" role="alert">
          ⚠️ The map failed to load.{" "}
          <a href={MAP_VIEWER_URL} target="_blank" rel="noopener noreferrer">
            Open it directly on ArcGIS Online
          </a>
          .
        </div>
      )}
      <div id="viewDiv" ref={containerRef} />
      {selectedFeature && (
        <div className="map-selection-bar" role="region" aria-label="Selected map feature">
          <div className="map-selection-info">
            <strong>{selectedFeature.title || selectedFeature.appId || "Selected Location"}</strong>
            <span>
              {[selectedFeature.appId && selectedFeature.title ? selectedFeature.appId : "", selectedFeature.location]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="map-selection-actions">
            {onSend && (
              <button type="button" className="map-ask-btn" onClick={handleAskChatbot}>
                💬 Ask Chatbot
              </button>
            )}
            <button
              type="button"
              className="map-attach-btn"
              onClick={handleAttachContext}
              title="Attach this project to your next chat question"
            >
              📌 Attach to chat
            </button>
            <button
              type="button"
              className="map-selection-dismiss"
              onClick={() => setSelectedFeature(null)}
              aria-label="Clear map selection"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div id="map-footer">
        <div id="map-footer-dot" />
        Powered by Esri · ArcGIS Online · chat results shown as numbered pins
      </div>
    </section>
  );
}
