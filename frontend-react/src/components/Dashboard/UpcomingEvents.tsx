import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useEvents } from "../../hooks/useEvents";
import { useMeetings } from "../../hooks/useMeetings";
import { CalendarIcon, ClockIcon, MapPinIcon, SearchIcon } from "../Icons/Icons";
import { SkeletonRows } from "./Skeleton";
import MiniCalendar from "./MiniCalendar";
import type { CalendarEvent, DayEvent, EventCategory, Meeting } from "../../types";
import { EVENT_CHIP_LABELS, normalizeEventCategory } from "../../types";
import { meetingSourceUrl } from "../../lib/meetingSource";

type CategoryFilter = "all" | EventCategory | "markets-fairs";

const PAGE_SIZE = 12;

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string; matches: EventCategory[] }> = [
  { value: "government", label: "Government", matches: ["government"] },
  { value: "community", label: "Community", matches: ["community"] },
  { value: "music", label: "Music", matches: ["music"] },
  { value: "markets-fairs", label: "Markets & Fairs", matches: ["market", "fair"] },
  { value: "sports", label: "Sports", matches: ["sports"] },
  { value: "other", label: "Other", matches: ["other"] },
];

function formatDateBadge(dateKey: string): { month: string; day: number } {
  const d = new Date(`${dateKey}T00:00:00`);
  return { month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: d.getDate() };
}

function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventTime(ev: CalendarEvent): string {
  if (ev.allDay) return "All day";
  const d = new Date(ev.start);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function meetingTimeToSortable(time: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return "00:00";
  let hour = Number(match[1]) % 12;
  if (/pm/i.test(match[3])) hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function eventToDayEvent(ev: CalendarEvent): DayEvent {
  return {
    source: ev.source || "esterotoday",
    id: `feed-${ev.id}`,
    dateKey: ev.start.slice(0, 10),
    sortKey: ev.start,
    title: ev.title,
    time: formatEventTime(ev),
    venue: ev.venue || ev.location || null,
    url: ev.url,
    category: normalizeEventCategory(ev.category),
  };
}

function meetingToDayEvent(m: Meeting): DayEvent {
  return {
    source: "meeting",
    id: `meeting-${m.id}`,
    dateKey: m.date,
    sortKey: `${m.date}T${meetingTimeToSortable(m.time)}:00`,
    title: m.board,
    time: m.time,
    venue: m.venue,
    url: meetingSourceUrl(m),
    category: "government",
  };
}

function buildDayEvents(events: CalendarEvent[], meetings: Meeting[]): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const push = (entry: DayEvent) => {
    const list = map.get(entry.dateKey) || [];
    list.push(entry);
    map.set(entry.dateKey, list);
  };
  events.forEach((ev) => push(eventToDayEvent(ev)));
  meetings.forEach((m) => push(meetingToDayEvent(m)));
  for (const list of map.values()) list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return map;
}

function categoryLabel(category: EventCategory): string {
  if (category === "market" || category === "fair") return "Markets & Fairs";
  return EVENT_CHIP_LABELS[category] || category;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function UpcomingEvents() {
  const { events, loading, error, retry } = useEvents();
  const { meetings, loading: meetingsLoading, error: meetingsError } = useMeetings(Infinity);
  const today = new Date();
  const todayKey = localDateKey(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const upcomingEvents = useMemo(
    () => events.filter((event) => event.start.slice(0, 10) >= todayKey),
    [events, todayKey],
  );
  const dayEvents = useMemo(() => buildDayEvents(upcomingEvents, meetings), [upcomingEvents, meetings]);
  const allItems = useMemo(
    () => [...dayEvents.values()].flat().sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    [dayEvents],
  );
  const categoriesInData = useMemo(
    () => new Set(allItems.map((item) => normalizeEventCategory(item.category))),
    [allItems],
  );
  const categoryOptions = CATEGORY_OPTIONS.filter((option) =>
    option.matches.some((category) => categoriesInData.has(category)),
  );
  const matchingItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return allItems.filter((item) => {
      const categoryMatches =
        categoryFilter === "all" ||
        CATEGORY_OPTIONS.find((option) => option.value === categoryFilter)?.matches.includes(
          normalizeEventCategory(item.category),
        );
      const searchMatches =
        !query ||
        [item.title, item.venue, item.source === "meeting" ? "official village meeting" : ""]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(query));
      return (
        categoryMatches &&
        searchMatches &&
        (!dateFilter || item.dateKey === dateFilter)
      );
    });
  }, [allItems, categoryFilter, dateFilter, search]);
  const calendarDayEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return new Map(
      [...dayEvents.entries()].map(([date, items]) => [
        date,
        items.filter((item) => {
          const categoryMatches =
            categoryFilter === "all" ||
            CATEGORY_OPTIONS.find((option) => option.value === categoryFilter)?.matches.includes(
              normalizeEventCategory(item.category),
            );
          const searchMatches =
            !query ||
            [item.title, item.venue, item.source === "meeting" ? "official village meeting" : ""]
              .filter(Boolean)
              .some((value) => value?.toLocaleLowerCase().includes(query));
          return categoryMatches && searchMatches;
        }),
      ]),
    );
  }, [categoryFilter, dayEvents, search]);

  const displayItems = useMemo(() => {
    if (dateFilter) return matchingItems;
    return matchingItems.filter((item) => {
      const [year, month] = item.dateKey.split("-").map(Number);
      return year === viewYear && month === viewMonth + 1;
    });
  }, [dateFilter, matchingItems, viewMonth, viewYear]);
  const visibleItems = displayItems.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [categoryFilter, dateFilter, search, viewMonth, viewYear]);

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setDateFilter("");
    setSelectedDateKey(null);
    setVisibleCount(PAGE_SIZE);
  };

  const selectDate = (dateKey: string) => {
    setSelectedDateKey((previous) => (previous === dateKey ? null : dateKey));
    setDateFilter((previous) => (previous === dateKey ? "" : dateKey));
    const [year, month] = dateKey.split("-").map(Number);
    setViewYear(year);
    setViewMonth(month - 1);
  };

  const changeDateFilter = (dateKey: string) => {
    setDateFilter(dateKey);
    setSelectedDateKey(dateKey || null);
    if (dateKey) {
      const [year, month] = dateKey.split("-").map(Number);
      setViewYear(year);
      setViewMonth(month - 1);
    }
  };

  const changeMonth = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setSelectedDateKey(null);
    setDateFilter("");
  };

  const communityEventsCount = upcomingEvents.length;
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const meetingsThisMonth = meetings.some((m) => m.date.startsWith(monthPrefix));
  const listHasMeetings = displayItems.some((item) => item.source === "meeting");

  return (
    <section className="pulse-events" aria-labelledby="pulse-events-title">
      <h2 id="pulse-events-title" className="sr-only">
        Community events
      </h2>

      <div className="pulse-stats" role="group" aria-label="Upcoming activity summary">
        <div className="pulse-stat pulse-stat-green">
          <span className="pulse-stat-icon" aria-hidden="true">
            <CalendarIcon size={28} />
          </span>
          <span>
            <span className="pulse-stat-value">
              {loading ? "…" : error ? "—" : communityEventsCount.toLocaleString()}
            </span>
            <span className="pulse-stat-label">Upcoming community events</span>
          </span>
        </div>
        <div className="pulse-stat pulse-stat-blue">
          <span className="pulse-stat-icon" aria-hidden="true">
            <Users size={28} strokeWidth={1.8} />
          </span>
          <span>
            <span className="pulse-stat-value">
              {meetingsLoading ? "…" : meetingsError ? "—" : meetings.length.toLocaleString()}
            </span>
            <span className="pulse-stat-label">Official Village meetings</span>
          </span>
        </div>
      </div>

      {loading && (
        <div className="pulse-card">
          <SkeletonRows count={3} />
        </div>
      )}

      {!loading && error && (
        <p className="pulse-card pulse-empty" role="status">
          Couldn’t load community events.{" "}
          <a href="https://esterotoday.com/events/" target="_blank" rel="noopener noreferrer">
            Visit the Estero Today calendar
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button type="button" className="pulse-retry" onClick={retry}>
            Retry
          </button>
        </p>
      )}

      {!loading && !error && (
        <>
          <div className="pulse-card events-toolbar">
            <label className="events-search">
              <span className="sr-only">Search events and meetings</span>
              <SearchIcon size={18} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search events…"
              />
            </label>
            <span className="events-toolbar-divider" aria-hidden="true" />
            <label className="events-select">
              <span className="sr-only">Filter by category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              >
                <option value="all">All categories</option>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="events-date">
              <span className="sr-only">Filter by date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => changeDateFilter(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="events-reset"
              onClick={resetFilters}
              disabled={!search && categoryFilter === "all" && !dateFilter}
            >
              Reset
            </button>
          </div>

          <div className="pulse-calendar-layout">
            <section className="pulse-card pulse-calendar-card" aria-label="Community events calendar">
              <MiniCalendar
                dayEvents={calendarDayEvents}
                viewYear={viewYear}
                viewMonth={viewMonth}
                selectedDateKey={selectedDateKey}
                onNavigate={changeMonth}
                onSelectDate={selectDate}
                showLegend={false}
                marker="count"
              />
              <ul className="pulse-cal-legend" aria-label="Calendar key">
                <li>
                  <span className="pulse-cal-swatch is-event" aria-hidden="true" />
                  Community event
                </li>
                {meetingsThisMonth && (
                  <li>
                    <span className="pulse-cal-swatch is-meeting" aria-hidden="true" />
                    Village meeting
                  </li>
                )}
                <li>
                  <span className="pulse-cal-swatch is-multi" aria-hidden="true" />
                  Multiple events
                </li>
                <li>
                  <span className="pulse-cal-swatch is-today" aria-hidden="true" />
                  Today
                </li>
              </ul>
            </section>
            <EventsList
              items={visibleItems}
              total={displayItems.length}
              visibleCount={visibleCount}
              loadingMeetings={meetingsLoading}
              onLoadMore={() => setVisibleCount((count) => count + PAGE_SIZE)}
              heading={
                dateFilter
                  ? `Events on ${formatDate(dateFilter)}`
                  : `${listHasMeetings ? "Events & Meetings" : "Community Events"} in ${new Date(
                      viewYear,
                      viewMonth,
                    ).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
              }
            />
          </div>

          {meetingsError && (
            <p className="events-source-note" role="status">
              Official Village meeting dates are unavailable right now.{" "}
              <a href="https://estero-fl.gov/meetings/" target="_blank" rel="noopener noreferrer">
                Check the official meeting page
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </>
      )}
    </section>
  );
}

interface EventsListProps {
  items: DayEvent[];
  total: number;
  visibleCount: number;
  loadingMeetings: boolean;
  onLoadMore: () => void;
  heading: string;
}

function EventsList({ items, total, visibleCount, loadingMeetings, onLoadMore, heading }: EventsListProps) {
  return (
    <section className="pulse-card events-results" aria-live="polite">
      <div className="events-results-header">
        <h3>{heading}</h3>
        <span>{total.toLocaleString()} {total === 1 ? "result" : "results"}</span>
      </div>
      {items.length === 0 ? (
        <p className="pulse-empty">
          {loadingMeetings
            ? "Loading Village meeting dates…"
            : "No events match these filters. Try changing or resetting your search."}
        </p>
      ) : (
        <>
          <ul className="events-list">
            {items.map((item) => {
              const { month, day } = formatDateBadge(item.dateKey);
              const category = normalizeEventCategory(item.category);
              const venue = item.venue;
              return (
                <li key={item.id} className="event-row">
                  <time className="date-leaf" dateTime={item.dateKey} aria-label={formatDate(item.dateKey)}>
                    <span className="date-leaf-month">{month}</span>
                    <span className="date-leaf-day">{day}</span>
                  </time>
                  <details className="event-details">
                    <summary className="event-summary">
                      <span className="event-summary-main">
                        <span className="event-title">{item.title}</span>
                        <span className="event-meta">
                          {venue && (
                            <span className="event-meta-item">
                              <MapPinIcon size={14} />
                              {venue}
                            </span>
                          )}
                          <span className="event-meta-item">
                            <ClockIcon size={14} />
                            {item.time}
                          </span>
                        </span>
                      </span>
                      <span className={`event-pill event-pill-${category}`}>{categoryLabel(category)}</span>
                    </summary>
                    <div className="event-details-body">
                      <p>
                        {formatDate(item.dateKey)} · {item.time}
                        {venue ? ` · ${venue}` : ""}
                      </p>
                      {item.source === "meeting" && <p className="official-meeting-label">Official Village meeting</p>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.source === "meeting" ? "Meeting information" : "Event details"}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          {visibleCount < total && (
            <button type="button" className="events-load-more" onClick={onLoadMore}>
              Load more events
            </button>
          )}
        </>
      )}
    </section>
  );
}
