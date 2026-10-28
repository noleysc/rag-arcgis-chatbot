import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import MapPanel, { type MapPanelView } from "../components/MapPanel/MapPanel";
import PageHeader from "../components/PageHeader/PageHeader";
import { SkeletonRows } from "../components/Dashboard/Skeleton";
import { ArrowRightIcon, ChevronRightIcon, MapPinIcon, SearchIcon } from "../components/Icons/Icons";
import { fetchRecentProjects, type BoardRecord } from "../lib/boardRecords";
import { formatShortDate } from "../lib/dates";
import { fetchLegend, shortCategory, type LegendEntry } from "../lib/mapLegend";
import { routeHref } from "../lib/router";

const PROJECT_LIMIT = 8;

interface MapPageProps {
  onAsk: (question: string) => void;
}

export default function MapPage({ onAsk }: MapPageProps) {
  const [view, setView] = useState<MapPanelView>("map");
  const [legend, setLegend] = useState<LegendEntry[] | null>(null);
  const [legendError, setLegendError] = useState(false);
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<BoardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchLegend()
      .then((entries) => !cancelled && setLegend(entries))
      .catch(() => !cancelled && setLegendError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchRecentProjects({ category, search, limit: PROJECT_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, search, attempt]);

  const iconFor = useMemo(() => {
    const icons = new Map((legend || []).map((e) => [e.category, e.icon]));
    return (cat: string) => icons.get(cat) || null;
  }, [legend]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const reset = () => {
    setCategory("");
    setSearchInput("");
    setSearch("");
  };

  const filtered = !!(category || search);

  return (
    <>
      <PageHeader
        title="Explore Map"
        subtitle="View project locations, board decisions, and related records across the Village."
      />

      <div className={`map-layout${view === "story" ? " map-layout-story" : ""}`}>
        <div className="card map-card">
          <MapPanel onViewChange={setView} />
        </div>
        {view === "map" && (
          <aside className="card card-pad map-legend" aria-labelledby="map-legend-title">
            <h2 id="map-legend-title">Legend</h2>
            {legend ? (
              <ul className="legend-list">
                {legend.map((entry) => (
                  <li key={entry.category} className={category === entry.category ? "legend-active" : undefined}>
                    {entry.icon ? (
                      <img src={entry.icon} alt="" className="legend-icon" />
                    ) : (
                      <MapPinIcon size={18} className="legend-icon" />
                    )}
                    <span>{entry.label}</span>
                  </li>
                ))}
              </ul>
            ) : legendError ? (
              <p className="empty-note">Legend unavailable — open the map's own layer list.</p>
            ) : (
              <SkeletonRows count={4} />
            )}
            <p className="legend-note">Each point is a board agenda item with a mapped location.</p>
          </aside>
        )}
      </div>

      <section className="card card-pad map-projects" aria-labelledby="recent-projects-title">
        <div className="card-head">
          <div>
            <h2 id="recent-projects-title">Recent Projects</h2>
            <p className="card-sub">Latest mapped board items. Search and filters apply to this list.</p>
          </div>
          <a className="card-link" href={routeHref("records")}>
            View all records <ArrowRightIcon size={14} />
          </a>
        </div>

        <div className="project-filters">
          <form className="search-field project-search" role="search" onSubmit={submitSearch}>
            <label htmlFor="project-search-input" className="sr-only">
              Search projects by name
            </label>
            <input
              id="project-search-input"
              type="search"
              placeholder="Search projects…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className="search-field-btn" aria-label="Search projects">
              <SearchIcon size={18} />
            </button>
          </form>
          <div className="filter-chips" role="group" aria-label="Filter projects by category">
            <button type="button" className="chip" aria-pressed={!category} onClick={() => setCategory("")}>
              All
            </button>
            {(legend || []).map((entry) => (
              <button
                key={entry.category}
                type="button"
                className="chip"
                aria-pressed={category === entry.category}
                onClick={() => setCategory(entry.category)}
              >
                {shortCategory(entry.category)}
              </button>
            ))}
            <button type="button" className="btn-text" onClick={reset} disabled={!filtered}>
              Reset
            </button>
          </div>
        </div>

        {loading && <SkeletonRows count={2} />}

        {!loading && error && (
          <p className="empty-note">
            Couldn't load projects from the map layer.{" "}
            <button type="button" className="pulse-retry" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
          </p>
        )}

        {!loading && !error && projects.length === 0 && (
          <p className="empty-note">
            No mapped projects match{search ? ` "${search}"` : ""}
            {category ? ` in ${shortCategory(category)}` : ""}.{" "}
            <button type="button" className="btn-text" onClick={reset}>
              Clear filters
            </button>
          </p>
        )}

        {!loading && !error && projects.length > 0 && (
          <ul className="project-grid">
            {projects.map((p) => {
              const icon = iconFor(p.category);
              return (
                <li key={p.id}>
                  <button type="button" className="project-card" onClick={() => onAsk(`Tell me about ${p.title}`)}>
                    <span className="project-top">
                      <span className="project-thumb">
                        {icon ? <img src={icon} alt="" /> : <MapPinIcon size={22} />}
                      </span>
                      {p.category && <span className="tag">{shortCategory(p.category)}</span>}
                    </span>
                    <span className="project-title">
                      <span className="sr-only">Ask about </span>
                      {p.title}
                    </span>
                    <span className="project-foot">
                      <span className="project-meta">
                        {[formatShortDate(p.date), p.board].filter(Boolean).join(" · ")}
                      </span>
                      <ChevronRightIcon size={18} className="project-chevron" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
