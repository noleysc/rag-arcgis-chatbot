import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import PageHeader from "../components/PageHeader/PageHeader";
import { SkeletonRows } from "../components/Dashboard/Skeleton";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalIcon,
  MapPinIcon,
  SearchIcon,
} from "../components/Icons/Icons";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatShortDate } from "../lib/dates";
import { statusClass } from "../lib/parseAnswer";
import { navigate } from "../lib/router";
import { panToCoords } from "../lib/mapViewStore";
import {
  fetchProject,
  fetchProjects,
  fetchRecentActivity,
  previewNearby,
  subscribeNearby,
  type ActivityItem,
  type ProjectDetail,
  type ProjectSummary,
} from "../lib/projects";

type Tab = "browse" | "recent" | "nearby";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "browse", label: "All projects" },
  { id: "recent", label: "What's happening" },
  { id: "nearby", label: "Near me" },
];

const PAGE_SIZE = 20;

function initialTab(): Tab {
  const tab = new URLSearchParams(window.location.hash.split("?")[1] || "").get("tab");
  return TABS.some((t) => t.id === tab) ? (tab as Tab) : "browse";
}

function initialProjectId(): string | null {
  return new URLSearchParams(window.location.hash.split("?")[1] || "").get("id");
}

interface ProjectsPageProps {
  onAsk: (question: string) => void;
}

export default function ProjectsPage({ onAsk }: ProjectsPageProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(initialProjectId);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const openProject = (id: string) => {
    setSelectedId(id);
    const base = "#/projects";
    const params = new URLSearchParams({ tab, id });
    window.location.hash = `${base}?${params}`;
  };

  const clearProject = () => {
    setSelectedId(null);
    window.location.hash = `#/projects?tab=${tab}`;
  };

  const setTabAndHash = (next: Tab) => {
    setTab(next);
    setSelectedId(null);
    window.location.hash = `#/projects?tab=${next}`;
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    setTabAndHash(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <PageHeader
        title="Development projects"
        subtitle="Track Village of Estero land-use cases, recent board actions, and alerts near your home."
      />

      <section className="card records-card projects-card">
        <div className="records-tabs" role="tablist" aria-label="Projects views">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`projects-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="projects-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className="records-tab"
              onClick={() => setTabAndHash(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id="projects-panel" role="tabpanel" aria-labelledby={`projects-tab-${tab}`} className="records-panel">
          {selectedId ? (
            <ProjectDossier projectId={selectedId} onBack={clearProject} onAsk={onAsk} />
          ) : tab === "browse" ? (
            <BrowseProjects onOpen={openProject} onAsk={onAsk} />
          ) : tab === "recent" ? (
            <RecentActivityView onOpen={openProject} />
          ) : (
            <NearbyView onOpen={openProject} />
          )}
        </div>
      </section>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  if (!status) return null;
  return <span className={`proj-status-chip ${statusClass(status)}`}>{status}</span>;
}

function BrowseProjects({
  onOpen,
  onAsk,
}: {
  onOpen: (id: string) => void;
  onAsk: (q: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), 350);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    projects: ProjectSummary[];
    total: number;
    statuses: string[];
    categories: Array<{ key: string; label: string }>;
  }>({ key: "", projects: [], total: 0, statuses: [], categories: [] });
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const filterKey = `${search}|${status}|${category}|${sort}|${page}|${attempt}`;
  const loading = result.key !== filterKey && failedKey !== filterKey;
  const error = failedKey === filterKey;

  useEffect(() => {
    setPage(0);
  }, [search, status, category, sort]);

  useEffect(() => {
    let cancelled = false;
    fetchProjects({
      q: search,
      status,
      category,
      sort,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: filterKey,
          projects: res.projects,
          total: res.total,
          statuses: res.filters.statuses,
          categories: res.filters.categories,
        });
      })
      .catch(() => !cancelled && setFailedKey(filterKey));
    return () => {
      cancelled = true;
    };
  }, [filterKey, search, status, category, sort, page]);

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <>
      <div className="records-controls">
        <div className="search-field records-search">
          <label htmlFor="projects-search-input" className="sr-only">
            Search projects
          </label>
          <span className="records-search-icon" aria-hidden="true">
            <SearchIcon size={17} />
          </span>
          <input
            id="projects-search-input"
            type="search"
            placeholder="Search by name, application ID, or location…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <label className="select-field">
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {result.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span className="sr-only">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {result.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recently active</option>
            <option value="oldest">Oldest activity</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      {loading && (
        <div className="records-loading">
          <SkeletonRows count={6} />
        </div>
      )}

      {!loading && error && (
        <p className="empty-note records-empty">
          Couldn't load projects.{" "}
          <button type="button" className="pulse-retry" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </p>
      )}

      {!loading && !error && result.projects.length === 0 && (
        <p className="empty-note records-empty">No projects match these filters.</p>
      )}

      {!loading && !error && result.projects.length > 0 && (
        <>
          <ul className="project-list">
            {result.projects.map((p) => (
              <li key={p.projectId}>
                <ProjectRow project={p} onOpen={onOpen} onAsk={onAsk} />
              </li>
            ))}
          </ul>
          <div className="records-pager">
            <p className="records-count">
              {result.total.toLocaleString()} project{result.total === 1 ? "" : "s"}
              {pageCount > 1 ? ` · page ${page + 1} of ${pageCount}` : ""}
            </p>
            {pageCount > 1 && (
              <div className="records-pager-btns">
                <button
                  type="button"
                  className="map-btn"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeftIcon size={16} /> Prev
                </button>
                <button
                  type="button"
                  className="map-btn"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRightIcon size={16} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function ProjectRow({
  project,
  onOpen,
  onAsk,
}: {
  project: ProjectSummary;
  onOpen: (id: string) => void;
  onAsk?: (q: string) => void;
}) {
  return (
    <article className="project-row">
      <button type="button" className="project-row-main" onClick={() => onOpen(project.projectId)}>
        <div className="project-row-top">
          <h3>{project.name}</h3>
          <StatusChip status={project.status} />
        </div>
        <p className="project-row-meta">
          {[
            project.lastDate ? formatShortDate(project.lastDate) : null,
            project.category,
            project.applicationId,
            project.location,
            project.distanceMiles != null ? `${project.distanceMiles} mi` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {project.summary && <p className="project-row-summary">{project.summary}</p>}
      </button>
      <div className="project-row-actions">
        {onAsk && (
          <button type="button" className="btn-text" onClick={() => onAsk(`What happened with ${project.name}?`)}>
            Ask
          </button>
        )}
        <button type="button" className="btn-text" onClick={() => onOpen(project.projectId)}>
          Details
        </button>
      </div>
    </article>
  );
}

function RecentActivityView({ onOpen }: { onOpen: (id: string) => void }) {
  const [days, setDays] = useState(180);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    activity: ActivityItem[];
    total: number;
  }>({ key: "", activity: [], total: 0 });
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = `${days}|${attempt}`;
  const loading = state.key !== key && failedKey !== key;

  useEffect(() => {
    let cancelled = false;
    fetchRecentActivity({ days, limit: 50 })
      .then((res) => !cancelled && setState({ key, activity: res.activity, total: res.total }))
      .catch(() => !cancelled && setFailedKey(key));
    return () => {
      cancelled = true;
    };
  }, [key, days]);

  return (
    <>
      <div className="records-controls">
        <label className="select-field">
          <span className="sr-only">Time window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
            <option value={3650}>All time</option>
          </select>
        </label>
      </div>

      {loading && (
        <div className="records-loading">
          <SkeletonRows count={6} />
        </div>
      )}

      {!loading && failedKey === key && (
        <p className="empty-note records-empty">
          Couldn't load recent activity.{" "}
          <button type="button" className="pulse-retry" onClick={() => setAttempt((a) => a + 1)}>
            Retry
          </button>
        </p>
      )}

      {!loading && failedKey !== key && state.activity.length === 0 && (
        <p className="empty-note records-empty">No project activity in this window.</p>
      )}

      {!loading && failedKey !== key && state.activity.length > 0 && (
        <ol className="activity-list">
          {state.activity.map((item, i) => (
            <li key={`${item.projectId}-${item.date}-${i}`}>
              <button type="button" className="activity-item" onClick={() => onOpen(item.projectId)}>
                <div className="activity-date">{item.date ? formatShortDate(item.date) : "—"}</div>
                <div className="activity-body">
                  <div className="activity-title-row">
                    <strong>{item.name}</strong>
                    {item.status && <StatusChip status={item.status} />}
                  </div>
                  <p className="project-row-meta">
                    {[item.board, item.category, item.location].filter(Boolean).join(" · ")}
                  </p>
                  {item.summary && <p className="project-row-summary">{item.summary}</p>}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function NearbyView({ onOpen }: { onOpen: (id: string) => void }) {
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [radius, setRadius] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const runPreview = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await previewNearby({ address, radiusMiles: radius });
      if (!res.ok) {
        setError(res.error || "Could not find that address.");
        setProjects([]);
        setActivity([]);
        setCoords(null);
        setGeoLabel(null);
        return;
      }
      setProjects(res.projects);
      setActivity(res.activity);
      if (res.geocode) {
        setCoords({ lat: res.geocode.lat, lng: res.geocode.lng });
        setGeoLabel(res.geocode.display_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const runSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await subscribeNearby({
        email,
        address,
        lat: coords?.lat,
        lng: coords?.lng,
        radiusMiles: radius,
      });
      setMessage(res.message);
      // Refresh preview after subscribe so the list stays visible.
      const preview = await previewNearby({
        address,
        lat: coords?.lat,
        lng: coords?.lng,
        radiusMiles: radius,
      });
      if (preview.ok) {
        setProjects(preview.projects);
        setActivity(preview.activity);
        if (preview.geocode) {
          setCoords({ lat: preview.geocode.lat, lng: preview.geocode.lng });
          setGeoLabel(preview.geocode.display_name);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setBusy(false);
    }
  };

  const hasResults = projects.length > 0 || activity.length > 0;

  return (
    <div className="nearby-layout">
      <form className="nearby-form" onSubmit={runSubscribe}>
        <p className="nearby-lead">
          Enter your Estero address to see development projects nearby, then subscribe for board-update alerts.
        </p>
        <label className="nearby-field">
          <span>Home address</span>
          <input
            type="text"
            required
            autoComplete="street-address"
            placeholder="e.g. 9401 Corkscrew Palms Cir, Estero, FL"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="nearby-field">
          <span>Email for updates</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="nearby-field nearby-radius">
          <span>Alert radius: {radius} mile{radius === 1 ? "" : "s"}</span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </label>
        <div className="nearby-actions">
          <button type="button" className="btn-secondary" disabled={busy || address.trim().length < 5} onClick={() => void runPreview()}>
            Preview nearby
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Subscribe to updates"}
          </button>
        </div>
        {geoLabel && <p className="nearby-geocode">Matched: {geoLabel}</p>}
        {error && <p className="nearby-error" role="alert">{error}</p>}
        {message && <p className="nearby-success" role="status">{message}</p>}
      </form>

      <div className="nearby-results">
        {!hasResults && !busy && (
          <p className="empty-note records-empty">Preview an address to see projects and recent board actions near you.</p>
        )}
        {projects.length > 0 && (
          <section aria-labelledby="nearby-projects-title">
            <h2 id="nearby-projects-title" className="nearby-section-title">
              Projects within {radius} mi
            </h2>
            <ul className="project-list">
              {projects.map((p) => (
                <li key={p.projectId}>
                  <ProjectRow project={p} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {activity.length > 0 && (
          <section aria-labelledby="nearby-activity-title">
            <h2 id="nearby-activity-title" className="nearby-section-title">
              Recent board actions nearby
            </h2>
            <ol className="activity-list">
              {activity.map((item, i) => (
                <li key={`${item.projectId}-${item.date}-${i}`}>
                  <button type="button" className="activity-item" onClick={() => onOpen(item.projectId)}>
                    <div className="activity-date">{item.date ? formatShortDate(item.date) : "—"}</div>
                    <div className="activity-body">
                      <div className="activity-title-row">
                        <strong>{item.name}</strong>
                        {item.distanceMiles != null && (
                          <span className="distance-pill">{item.distanceMiles} mi</span>
                        )}
                      </div>
                      {item.summary && <p className="project-row-summary">{item.summary}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

function ProjectDossier({
  projectId,
  onBack,
  onAsk,
}: {
  projectId: string;
  onBack: () => void;
  onAsk: (q: string) => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProject(projectId)
      .then((p) => {
        if (!cancelled) {
          setProject(p);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load project");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const showOnMap = () => {
    if (!project?.lat || !project?.lng) return;
    navigate("map");
    requestAnimationFrame(() => panToCoords(project.lat!, project.lng!));
  };

  const timeline = useMemo(() => project?.timeline ?? [], [project]);

  return (
    <div className="project-dossier">
      <button type="button" className="btn-text dossier-back" onClick={onBack}>
        <ChevronLeftIcon size={16} /> Back to list
      </button>

      {loading && (
        <div className="records-loading">
          <SkeletonRows count={4} />
        </div>
      )}
      {!loading && error && <p className="empty-note records-empty">{error}</p>}
      {!loading && project && (
        <>
          <header className="dossier-header">
            <div>
              <h2>{project.name}</h2>
              <p className="project-row-meta">
                {[
                  project.applicationId,
                  project.category,
                  project.location,
                  project.itemCount ? `${project.itemCount} board action${project.itemCount === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <StatusChip status={project.status} />
          </header>

          {project.summary && <p className="dossier-summary">{project.summary}</p>}

          <div className="dossier-actions">
            <button type="button" className="btn-primary" onClick={() => onAsk(`What happened with ${project.name}?`)}>
              Ask about this project
            </button>
            {project.lat != null && project.lng != null && (
              <button type="button" className="btn-secondary" onClick={showOnMap}>
                <MapPinIcon size={16} /> Show on map
              </button>
            )}
            {project.documentUrl && (
              <a className="btn-secondary" href={project.documentUrl} target="_blank" rel="noopener noreferrer">
                Minutes <ExternalIcon size={14} />
              </a>
            )}
          </div>

          <h3 className="nearby-section-title">Timeline</h3>
          <ol className="dossier-timeline">
            {timeline.map((entry, i) => (
              <li key={`${entry.recordId}-${i}`}>
                <div className="dossier-tl-date">{entry.date ? formatShortDate(entry.date) : "—"}</div>
                <div className="dossier-tl-body">
                  <div className="activity-title-row">
                    <span>{entry.event}</span>
                    <StatusChip status={entry.status} />
                  </div>
                  <p className="project-row-meta">
                    {[entry.board, entry.applicationId].filter(Boolean).join(" · ")}
                  </p>
                  {entry.documentUrl && (
                    <a href={entry.documentUrl} target="_blank" rel="noopener noreferrer">
                      View minutes <ExternalIcon size={12} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
