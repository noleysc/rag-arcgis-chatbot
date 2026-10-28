import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader/PageHeader";
import MiniCalendar from "../components/Dashboard/MiniCalendar";
import NextMeetings from "../components/Dashboard/NextMeetings";
import { SkeletonRows } from "../components/Dashboard/Skeleton";
import { ArrowRightIcon, ExternalIcon, PdfIcon } from "../components/Icons/Icons";
import { useMeetings } from "../hooks/useMeetings";
import { fetchMinutesDocs, type MinutesDoc } from "../lib/boardRecords";
import { formatShortDate } from "../lib/dates";
import { meetingSourceUrl } from "../lib/meetingSource";
import { routeHref } from "../lib/router";
import type { DayEvent, Meeting } from "../types";

const RECENT_DOCS = 6;

/** "Planning, Zoning & Design Board" and "Planning Zoning & Design Board"
 * (meetings.json vs. the map layer) should match. */
function boardKey(board: string): string {
  return board.toLowerCase().replace(/[^a-z]/g, "");
}

/** One calendar entry per meeting: the hand-maintained schedule
 * (meetings.json) plus every meeting with minutes on the map layer, linking
 * to the minutes PDF when there is one. */
function buildMeetingDays(schedule: Meeting[], docs: MinutesDoc[]): Map<string, DayEvent[]> {
  const days = new Map<string, DayEvent[]>();
  const add = (e: DayEvent) => days.set(e.dateKey, [...(days.get(e.dateKey) || []), e]);
  const minutesFor = new Map(docs.map((d) => [`${d.date}|${boardKey(d.board)}`, d]));

  for (const m of schedule) {
    const doc = minutesFor.get(`${m.date}|${boardKey(m.board)}`);
    if (doc) minutesFor.delete(`${m.date}|${boardKey(m.board)}`);
    add({
      source: "meeting",
      id: `meeting-${m.id}`,
      dateKey: m.date,
      sortKey: m.date,
      title: m.board,
      time: m.time,
      venue: m.venue,
      url: doc?.url || meetingSourceUrl(m),
      category: "government",
    });
  }
  for (const d of minutesFor.values()) {
    if (!d.date) continue;
    add({
      source: "meeting",
      id: `minutes-${d.url}`,
      dateKey: d.date,
      sortKey: d.date,
      title: d.board,
      time: "Minutes available",
      venue: null,
      url: d.url,
      category: "government",
    });
  }
  return days;
}

export default function MeetingsPage() {
  const upcoming = useMeetings(5);
  const { meetings: schedule } = useMeetings(Infinity, true);
  const [docs, setDocs] = useState<MinutesDoc[] | null>(null);
  const [docsError, setDocsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocsError(false);
    fetchMinutesDocs()
      .then((d) => !cancelled && setDocs(d))
      .catch(() => !cancelled && setDocsError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const meetingDays = useMemo(() => buildMeetingDays(schedule, docs || []), [schedule, docs]);
  const selected = selectedDateKey ? meetingDays.get(selectedDateKey) || [] : [];

  return (
    <>
      <PageHeader title="Meetings" subtitle="Upcoming Village board meetings and minutes from past meetings." />

      <div className="meetings-grid">
        <section className="card card-pad meetings-cal" aria-labelledby="meetings-cal-title">
          <div className="card-head">
            <h2 id="meetings-cal-title">Meeting Calendar</h2>
            <span className="meetings-cal-key">
              <span className="meetings-cal-swatch" aria-hidden="true" /> Board meeting
            </span>
          </div>
          <MiniCalendar
            dayEvents={meetingDays}
            viewYear={viewYear}
            viewMonth={viewMonth}
            selectedDateKey={selectedDateKey}
            onNavigate={(y, m) => {
              setViewYear(y);
              setViewMonth(m);
            }}
            onSelectDate={(key) => setSelectedDateKey((prev) => (prev === key ? null : key))}
            showLegend={false}
          />
          {selectedDateKey && (
            <div className="meetings-day" aria-live="polite">
              <p className="meetings-day-label">{formatShortDate(selectedDateKey)}</p>
              <ul>
                {selected.map((e) => (
                  <li key={e.id}>
                    <span className="meetings-day-name">{e.title}</span>
                    <span className="meetings-day-meta">{[e.time, e.venue].filter(Boolean).join(" · ")}</span>
                    {e.url && (
                      <a className="card-link" href={e.url} target="_blank" rel="noopener noreferrer">
                        {/\.pdf($|\?)/i.test(e.url) ? "Minutes (PDF)" : "Meeting info"} <ExternalIcon size={13} />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <NextMeetings
          title="Upcoming Meetings"
          meetings={upcoming.meetings}
          loading={upcoming.loading}
          error={upcoming.error}
        />
      </div>

      <section className="card card-pad meetings-docs" aria-labelledby="meetings-docs-title">
        <div className="card-head">
          <h2 id="meetings-docs-title">Recent Meeting Documents</h2>
          <a className="card-link" href={`${routeHref("records")}?tab=minutes`}>
            All minutes <ArrowRightIcon size={14} />
          </a>
        </div>
        {!docs && !docsError && <SkeletonRows count={3} />}
        {docsError && (
          <p className="empty-note">
            Couldn't load meeting minutes.{" "}
            <button type="button" className="pulse-retry" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
          </p>
        )}
        {docs && docs.length === 0 && <p className="empty-note">No meeting minutes are on file yet.</p>}
        {docs && docs.length > 0 && (
          <ul className="doc-list">
            {docs.slice(0, RECENT_DOCS).map((d) => (
              <li key={d.url}>
                <PdfIcon size={30} />
                <span className="doc-body">
                  <span className="doc-title">{d.board} minutes</span>
                  <span className="doc-meta">Meeting of {formatShortDate(d.date)} · PDF</span>
                </span>
                <a className="card-link" href={d.url} target="_blank" rel="noopener noreferrer">
                  Open PDF <ExternalIcon size={13} />
                  <span className="sr-only">
                    {" "}
                    — {d.board} minutes, {formatShortDate(d.date)} (opens in a new tab)
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
