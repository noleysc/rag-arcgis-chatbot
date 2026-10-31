import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLayerData } from "../../hooks/useLayerData";
import { fetchLayerUpdated } from "../../lib/boardRecords";
import { ArrowRightIcon, MenuIcon, SearchIcon } from "../Icons/Icons";

const ADMIN_TOKEN_KEY = "ee_admin_token";

function hasAdminToken(): boolean {
  try {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return false;
  }
}

function formatUpdated(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TopBarProps {
  /** Hamburger for the off-canvas sidebar; omitted on wide screens. */
  onOpenNav?: () => void;
  navOpen: boolean;
  /** Ask the assistant from the header search. Omitted on the Ask page,
   * where the chat composer is the input. */
  onAsk?: (question: string) => void;
}

export default function TopBar({ onOpenNav, navOpen, onAsk }: TopBarProps) {
  const [isAdmin, setIsAdmin] = useState(hasAdminToken);
  const [query, setQuery] = useState("");
  const updated = useLayerData(fetchLayerUpdated);

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

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || !onAsk) return;
    onAsk(q);
    setQuery("");
  };

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
        {onAsk && (
          <form className="topbar-search" role="search" onSubmit={submit}>
            <SearchIcon size={18} />
            <label htmlFor="topbar-search-input" className="sr-only">
              Ask about a project, meeting, or place in Estero
            </label>
            <input
              id="topbar-search-input"
              type="search"
              placeholder="Ask about a project, meeting, or place in Estero…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="topbar-search-btn" aria-label="Ask" disabled={!query.trim()}>
              <ArrowRightIcon size={16} />
            </button>
          </form>
        )}
      </div>
      <div id="topbar-right">
        {typeof updated === "number" && (
          <p className="topbar-updated" title="Last edit to the Estero Board Records layer on ArcGIS Online">
            <span className="topbar-updated-dot" aria-hidden="true" />
            <span>
              Records updated
              <strong>{formatUpdated(updated)}</strong>
            </span>
          </p>
        )}
        {isAdmin && (
          <a
            className="topbar-btn"
            href={`${import.meta.env.BASE_URL}admin.html`}
            title="Administrator console"
          >
            Admin
          </a>
        )}
      </div>
    </header>
  );
}
