import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import PageHeader from "../components/PageHeader/PageHeader";
import { SkeletonRows } from "../components/Dashboard/Skeleton";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon, PdfIcon, SearchIcon } from "../components/Icons/Icons";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  fetchBoards,
  fetchMinutesDocs,
  fetchRecordsPage,
  isDecisionType,
  type BoardRecord,
  type MinutesDoc,
  type RecordSort,
} from "../lib/boardRecords";
import { formatShortDate } from "../lib/dates";

// Agendas and Documents tabs from the design are omitted: the map layer has
// no agenda data, and the Engage Estero documents synced into the backend
// (data/engage_estero/documents.csv) aren't served by any API yet.
type Tab = "all" | "decisions" | "minutes";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All Records" },
  { id: "decisions", label: "Decisions" },
  { id: "minutes", label: "Minutes" },
];

const PAGE_SIZE = 25;

interface RecordsPageProps {
  onAsk: (question: string) => void;
}

export default function RecordsPage({ onAsk }: RecordsPageProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), 350);
  const [board, setBoard] = useState("");
  const [sortChoice, setSort] = useState<RecordSort>("newest");
  // Minutes have no title to sort by.
  const sort = tab === "minutes" && sortChoice === "title" ? "newest" : sortChoice;
  const [boards, setBoards] = useState<string[]>([]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The page number belongs to one set of filters: change any filter and it
  // reads as page 1 in that same render, so no stale-offset fetch goes out.
  const filterKey = `${tab}|${search}|${board}|${sort}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const setPage = (p: number) => setPaging({ key: filterKey, page: p });

  // Each result (or failure) is tagged with the query it answers. Anything
  // not matching the current query reads as loading, so a tab or filter
  // change never flashes the previous query's rows or error.
  const [attempt, setAttempt] = useState(0);
  const recordsKey = `${filterKey}|${page}|${attempt}`;
  const minutesKey = `${board}|${search}|${attempt}`;
  const queryKey = tab === "minutes" ? minutesKey : recordsKey;
  const [records, setRecords] = useState({ key: "", rows: [] as BoardRecord[], total: 0 });
  const [minutes, setMinutes] = useState({ key: "", docs: [] as MinutesDoc[] });
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const error = failedKey === queryKey;
  const loading = !error && (tab === "minutes" ? minutes.key : records.key) !== queryKey;

  useEffect(() => {
    fetchBoards()
      .then(setBoards)
      .catch(() => setBoards([]));
  }, []);

  // Agenda items: paged server-side.
  useEffect(() => {
    if (tab === "minutes") return;
    let cancelled = false;
    fetchRecordsPage({
      decisionsOnly: tab === "decisions",
      board,
      search,
      sort,
      offset: page * PAGE_SIZE,
      pageSize: PAGE_SIZE,
    })
      .then((res) => !cancelled && setRecords({ key: recordsKey, rows: res.records, total: res.total }))
      .catch(() => !cancelled && setFailedKey(recordsKey));
    return () => {
      cancelled = true;
    };
  }, [tab, board, search, sort, page, recordsKey]);

  // Minutes: fetched whole (see fetchMinutesDocs), sorted and paged below.
  useEffect(() => {
    if (tab !== "minutes") return;
    let cancelled = false;
    fetchMinutesDocs({ board, search })
      .then((docs) => !cancelled && setMinutes({ key: minutesKey, docs }))
      .catch(() => !cancelled && setFailedKey(minutesKey));
    return () => {
      cancelled = true;
    };
  }, [tab, board, search, minutesKey]);

  const minutesSorted = sort === "oldest" ? [...minutes.docs].reverse() : minutes.docs;
  const minutesPage = minutesSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const total = tab === "minutes" ? minutes.docs.length : records.total;
  const rowCount = tab === "minutes" ? minutesPage.length : records.rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unit = tab === "minutes" ? "meeting minutes" : tab === "decisions" ? "decisions" : "agenda items";

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <PageHeader
        title="Board Records"
        subtitle="Browse decisions and meeting minutes from Village of Estero board meetings."
      />

      <section className="card records-card">
        <div className="records-tabs" role="tablist" aria-label="Record type">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`records-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="records-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className="records-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id="records-panel" role="tabpanel" aria-labelledby={`records-tab-${tab}`} className="records-panel">
          <div className="records-controls">
            <div className="search-field records-search">
              <label htmlFor="records-search-input" className="sr-only">
                Search records by title, action, or application ID
              </label>
              <span className="records-search-icon" aria-hidden="true">
                <SearchIcon size={17} />
              </span>
              <input
                id="records-search-input"
                type="search"
                placeholder={tab === "minutes" ? "Find minutes by project or topic…" : "Search records…"}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <label className="select-field">
              <span className="sr-only">Board</span>
              <select value={board} onChange={(e) => setBoard(e.target.value)}>
                <option value="">All boards</option>
                {boards.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as RecordSort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                {tab !== "minutes" && <option value="title">Title A–Z</option>}
              </select>
            </label>
          </div>

          {loading && (
            <div className="records-loading">
              <SkeletonRows count={5} />
            </div>
          )}

          {!loading && error && (
            <p className="empty-note records-empty">
              Couldn't load records from the map layer.{" "}
              <button type="button" className="pulse-retry" onClick={() => setAttempt((a) => a + 1)}>
                Retry
              </button>
            </p>
          )}

          {!loading && !error && rowCount === 0 && (
            <p className="empty-note records-empty">
              No {unit} match these filters.
              {(search || board) && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setSearchInput("");
                      setBoard("");
                    }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </p>
          )}

          {!loading && !error && rowCount > 0 && tab !== "minutes" && (
            <table className="records-table">
              <caption className="sr-only">
                {TABS.find((t) => t.id === tab)?.label}, page {page + 1} of {pageCount}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Title</th>
                  <th scope="col">Type</th>
                  <th scope="col">Board</th>
                  <th scope="col">Action taken</th>
                  <th scope="col">
                    <span className="sr-only">Links</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date" className="rec-date">
                      {formatShortDate(r.date) || "—"}
                    </td>
                    <td data-label="Title" className="rec-title">
                      {r.title}
                      {r.applicationId && <span className="rec-id">{r.applicationId}</span>}
                    </td>
                    <td data-label="Type">
                      {r.itemType ? (
                        <span className={`type-tag${isDecisionType(r.itemType) ? " type-tag-decision" : ""}`}>
                          {r.itemType}
                        </span>
                      ) : (
                        <span className="rec-muted">—</span>
                      )}
                    </td>
                    <td data-label="Board" className="rec-board">
                      {r.board || "—"}
                    </td>
                    <td data-label="Action taken">
                      <span className="rec-action" title={r.action}>
                        {r.action || "—"}
                      </span>
                    </td>
                    <td className="rec-links">
                      {r.minutesUrl && (
                        <a
                          className="rec-icon-btn"
                          href={r.minutesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open meeting minutes (PDF)"
                        >
                          <PdfIcon size={22} />
                          <span className="sr-only">Minutes PDF for {r.title} (opens in a new tab)</span>
                        </a>
                      )}
                      <button
                        type="button"
                        className="rec-icon-btn"
                        onClick={() => onAsk(`Tell me about ${r.title}`)}
                        title="Ask about this record"
                        aria-label={`Ask about ${r.title}`}
                      >
                        <ChevronRightIcon size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && rowCount > 0 && tab === "minutes" && (
            <table className="records-table records-table-minutes">
              <caption className="sr-only">
                Meeting minutes, page {page + 1} of {pageCount}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Meeting date</th>
                  <th scope="col">Board</th>
                  <th scope="col">Document</th>
                </tr>
              </thead>
              <tbody>
                {minutesPage.map((m) => (
                  <tr key={m.url}>
                    <td data-label="Meeting date" className="rec-date">
                      {formatShortDate(m.date) || "—"}
                    </td>
                    <td data-label="Board" className="rec-title">
                      {m.board || "—"}
                    </td>
                    <td data-label="Document">
                      <a className="doc-link" href={m.url} target="_blank" rel="noopener noreferrer">
                        <PdfIcon size={22} />
                        Minutes (PDF)
                        <ExternalIcon size={13} />
                        <span className="sr-only">
                          for {m.board} on {formatShortDate(m.date)} (opens in a new tab)
                        </span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && total > 0 && (
            <div className="records-pager">
              <p aria-live="polite">
                Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{(page * PAGE_SIZE + rowCount).toLocaleString()} of{" "}
                {total.toLocaleString()} {unit}
              </p>
              <div className="records-pager-btns">
                <button
                  type="button"
                  className="map-btn"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon size={16} />
                </button>
                <span className="records-page-num">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  className="map-btn"
                  onClick={() => setPage(page + 1)}
                  disabled={page + 1 >= pageCount}
                  aria-label="Next page"
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
