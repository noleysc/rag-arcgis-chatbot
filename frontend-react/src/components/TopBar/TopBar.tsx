import { useEffect, useState } from "react";
import { MenuIcon } from "../Icons/Icons";

const ADMIN_TOKEN_KEY = "ee_admin_token";

function hasAdminToken(): boolean {
  try {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return false;
  }
}

interface TopBarProps {
  recordCount: number | null | undefined;
  /** Hamburger for the off-canvas sidebar; omitted on wide screens. */
  onOpenNav?: () => void;
  navOpen: boolean;
}

export default function TopBar({ recordCount, onOpenNav, navOpen }: TopBarProps) {
  const [isAdmin, setIsAdmin] = useState(hasAdminToken);

  useEffect(() => {
    // admin.html runs in its own tab/bundle and writes this key on login —
    // the storage event only fires in *other* tabs, which is exactly the
    // case we want (this chat tab picking up a login that just happened
    // elsewhere without needing a reload).
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_TOKEN_KEY || e.key === null) setIsAdmin(hasAdminToken());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const liveLabel =
    recordCount === undefined
      ? "Loading records…"
      : recordCount === null
        ? "Live data"
        : `${recordCount.toLocaleString()} records`;

  return (
    <header id="topbar">
      <div id="topbar-left">
        {onOpenNav && (
          <button
            type="button"
            id="nav-toggle"
            onClick={onOpenNav}
            aria-label="Open menu"
            aria-controls="sidebar"
            aria-expanded={navOpen}
          >
            <MenuIcon size={22} />
          </button>
        )}
        <div id="topbar-title">
          <p className="topbar-name">Ask Engage Estero</p>
          <p className="topbar-sub">Planning &amp; Zoning Decisions · Village of Estero</p>
        </div>
      </div>
      <div id="topbar-right">
        {isAdmin && (
          <a
            className="topbar-btn"
            href={`${import.meta.env.BASE_URL}admin.html`}
            title="Administrator console"
          >
            Admin
          </a>
        )}
        <div
          id="live-badge"
          title={
            typeof recordCount === "number"
              ? "Live count of board records on the Estero map layer"
              : undefined
          }
        >
          <span id="live-dot" aria-hidden="true" />
          <span id="record-count">{liveLabel}</span>
        </div>
      </div>
    </header>
  );
}
