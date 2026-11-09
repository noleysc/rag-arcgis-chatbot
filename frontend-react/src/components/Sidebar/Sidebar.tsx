import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import logo from "../../assets/engage-estero-logo-light.png";
import villageEmblem from "../../assets/village-emblem.png";
import { ROUTE_LABELS, routeHref, type Route } from "../../lib/router";
import {
  CalendarIcon,
  ChatIcon,
  CloseIcon,
  HomeIcon,
  MapPinIcon,
  ProjectsIcon,
  PulseIcon,
  RecordsIcon,
} from "../Icons/Icons";
import SunsetArt from "./SunsetArt";

const NAV_ITEMS: Array<{ route: Route; Icon: ComponentType<{ size?: number }> }> = [
  { route: "home", Icon: HomeIcon },
  { route: "map", Icon: MapPinIcon },
  { route: "ask", Icon: ChatIcon },
  { route: "projects", Icon: ProjectsIcon },
  { route: "meetings", Icon: CalendarIcon },
  { route: "records", Icon: RecordsIcon },
  { route: "pulse", Icon: PulseIcon },
];

interface SidebarProps {
  route: Route;
  /** Off-canvas drawer mode (narrow screens). */
  drawer: boolean;
  open: boolean;
  /** Dismiss the drawer without navigating (Esc, backdrop, close button). */
  onClose: () => void;
  /** A nav link was followed; the page change takes focus from here. */
  onNavigate: () => void;
  /** Gold dot on Meetings when a scheduled meeting is within 7 days. */
  meetingThisWeek?: boolean;
}

export default function Sidebar({ route, drawer, open, onClose, onNavigate, meetingThisWeek }: SidebarProps) {
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!drawer || !open) return;
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, open, onClose]);

  return (
    <>
      {drawer && open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="sidebar"
        className={drawer ? `sidebar-drawer${open ? " open" : ""}` : undefined}
        // A closed drawer is off-screen; keep its links out of the tab order.
        inert={drawer && !open}
      >
        <div className="sidebar-brand">
          <a href={routeHref("home")} onClick={route === "home" ? onClose : onNavigate}>
            <img src={logo} alt="Engage Estero — home" />
          </a>
          {drawer && (
            <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
              <CloseIcon />
            </button>
          )}
        </div>
        <span className="sidebar-accent" aria-hidden="true" />
        <nav aria-label="Main">
          <ul className="sidebar-nav">
            {NAV_ITEMS.map(({ route: r, Icon }, i) => (
              <li key={r}>
                <a
                  ref={i === 0 ? firstLinkRef : undefined}
                  className="sidebar-link"
                  href={routeHref(r)}
                  aria-current={route === r ? "page" : undefined}
                  // Same page: nothing will take focus, so hand it back to the menu button.
                  onClick={route === r ? onClose : onNavigate}
                >
                  <Icon size={22} />
                  <span>{ROUTE_LABELS[r]}</span>
                  {r === "meetings" && meetingThisWeek && (
                    <span className="sidebar-dot">
                      <span className="sr-only">(meeting this week)</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* The sunset sits in the flow below the nav, so it never runs
            behind a nav label; the Village card rests on its waves. */}
        <div className="sidebar-foot">
          <SunsetArt />
          <a className="sidebar-village" href="https://estero-fl.gov/" target="_blank" rel="noopener noreferrer">
            <span className="sidebar-village-emblem">
              <img src={villageEmblem} alt="" />
            </span>
            <span className="sidebar-village-text">
              <strong>Village of Estero</strong>
              <span>Florida</span>
            </span>
            <span className="sr-only"> (opens estero-fl.gov in a new tab)</span>
          </a>
        </div>
      </aside>
    </>
  );
}
