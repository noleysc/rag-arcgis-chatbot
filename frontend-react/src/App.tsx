import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar/Sidebar";
import TopBar from "./components/TopBar/TopBar";
import PageHeader from "./components/PageHeader/PageHeader";
import Dashboard from "./components/Dashboard/Dashboard";
import ReportDialog, { type ReportPrefill } from "./components/ReportDialog/ReportDialog";
import DisclaimerModal from "./components/DisclaimerModal/DisclaimerModal";
import HomePage from "./pages/HomePage";
import AskPage from "./pages/AskPage";
import MapPage from "./pages/MapPage";
import RecordsPage from "./pages/RecordsPage";
import MeetingsPage from "./pages/MeetingsPage";
import { useChat } from "./hooks/useChat";
import { useMeetings } from "./hooks/useMeetings";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useRecordCount } from "./hooks/useRecordCount";
import { ROUTE_LABELS, navigate, useRoute, type Route } from "./lib/router";
import "./App.css";
import "./pages/pages.css";

const BASE_TITLE = "Ask Engage Estero — Planning & Zoning Decisions";

export default function App() {
  const route = useRoute();
  const { messages, send, newChat } = useChat();
  const recordCount = useRecordCount();
  const { meetings, loading: meetingsLoading, error: meetingsError } = useMeetings(3);
  const drawer = useMediaQuery("(max-width: 900px)");
  const [navOpen, setNavOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPrefill, setReportPrefill] = useState<ReportPrefill | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  // The map iframe is mounted on first visit and then only hidden, never
  // unmounted — reloading the Esri app is slow and loses the visitor's
  // pan/zoom (same reason the old Map/Pulse tabs kept it mounted).
  const [mapVisited, setMapVisited] = useState(route === "map");
  if (route === "map" && !mapVisited) setMapVisited(true);

  const closeNav = useCallback(() => {
    if (navOpen) document.getElementById("nav-toggle")?.focus();
    setNavOpen(false);
  }, [navOpen]);

  // Page change: retitle, start at the top, and move focus to the new page
  // so screen readers announce it (skipped on first load).
  const firstRouteRef = useRef(true);
  useEffect(() => {
    document.title = route === "home" ? BASE_TITLE : `${ROUTE_LABELS[route]} · Ask Engage Estero`;
    if (firstRouteRef.current) {
      firstRouteRef.current = false;
      return;
    }
    mainRef.current?.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  /** Send a question from anywhere (Home quick search, record rows, …) and
   * take the visitor to the conversation. */
  const ask = useCallback(
    (text: string) => {
      navigate("ask");
      void send(text);
    },
    [send],
  );

  const openReport = useCallback((prefill?: ReportPrefill) => {
    setReportPrefill(prefill || null);
    setReportOpen(true);
  }, []);

  const busy = messages.some((m) => m.role === "bot" && m.streaming);

  const renderPage = (r: Exclude<Route, "map">) => {
    switch (r) {
      case "home":
        return <HomePage onAsk={ask} />;
      case "ask":
        return <AskPage messages={messages} onSend={send} busy={busy} onReport={openReport} onNewChat={newChat} />;
      case "records":
        return <RecordsPage onAsk={ask} />;
      case "meetings":
        return <MeetingsPage />;
      case "pulse":
        return (
          <Dashboard meetings={meetings} meetingsLoading={meetingsLoading} meetingsError={meetingsError} onSend={ask} />
        );
      default:
        return <PageHeader title={ROUTE_LABELS[r]} />;
    }
  };

  return (
    <>
      <DisclaimerModal />
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <div id="app-shell">
        <Sidebar route={route} drawer={drawer} open={navOpen} onClose={closeNav} />
        <div id="app-body">
          <TopBar recordCount={recordCount} onOpenNav={drawer ? () => setNavOpen(true) : undefined} navOpen={navOpen} />
          <main id="main" ref={mainRef} tabIndex={-1} className={`app-main app-main-${route}`}>
            {mapVisited && (
              <div className="page page-map" hidden={route !== "map"}>
                <MapPage onAsk={ask} />
              </div>
            )}
            {route !== "map" && <div className={`page page-${route}`}>{renderPage(route)}</div>}
          </main>
        </div>
      </div>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} prefill={reportPrefill} />
    </>
  );
}
