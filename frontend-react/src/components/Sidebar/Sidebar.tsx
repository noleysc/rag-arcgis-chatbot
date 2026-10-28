import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import logo from "../../assets/logo.png";
import { ROUTE_LABELS, routeHref, type Route } from "../../lib/router";
import { CalendarIcon, ChatIcon, CloseIcon, HomeIcon, MapPinIcon, PulseIcon, RecordsIcon } from "../Icons/Icons";
import SkylineArt from "./SkylineArt";

const NAV_ITEMS: Array<{ route: Route; Icon: ComponentType<{ size?: number }> }> = [
  { route: "home", Icon: HomeIcon },
  { route: "map", Icon: MapPinIcon },
  { route: "ask", Icon: ChatIcon },
  { route: "records", Icon: RecordsIcon },
  { route: "meetings", Icon: CalendarIcon },
  { route: "pulse", Icon: PulseIcon },
];

interface SidebarProps {
  route: Route;
  /** Off-canvas drawer mode (narrow screens). */
  drawer: boolean;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ route, drawer, open, onClose }: SidebarProps) {
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
          <a href={routeHref("home")} onClick={onClose}>
            <img src={logo} alt="Engage Estero — home" />
          </a>
          {drawer && (
            <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
              <CloseIcon />
            </button>
          )}
        </div>
        <nav aria-label="Main">
          <ul className="sidebar-nav">
            {NAV_ITEMS.map(({ route: r, Icon }, i) => (
              <li key={r}>
                <a
                  ref={i === 0 ? firstLinkRef : undefined}
                  className="sidebar-link"
                  href={routeHref(r)}
                  aria-current={route === r ? "page" : undefined}
                  onClick={onClose}
                >
                  <Icon size={19} />
                  <span>{ROUTE_LABELS[r]}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <SkylineArt />
          <span>Village of Estero</span>
        </div>
      </aside>
    </>
  );
}
