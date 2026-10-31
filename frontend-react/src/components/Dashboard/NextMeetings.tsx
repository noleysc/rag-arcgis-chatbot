import { Users } from "lucide-react";
import type { Meeting } from "../../types";
import { meetingIsThisWeek } from "../../hooks/useMeetings";
import { meetingSourceUrl, VILLAGE_MEETINGS_URL } from "../../lib/meetingSource";
import { CalendarIcon, ExternalIcon } from "../Icons/Icons";
import { SkeletonRows } from "./Skeleton";

interface NextMeetingsProps {
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  title?: string;
  /** "feature": Community Pulse's larger card, with a header icon and link
   * and an illustrated empty state. */
  variant?: "compact" | "feature";
}

function formatMonthDay(dateStr: string): { month: string; day: number } {
  const d = new Date(`${dateStr}T00:00:00`);
  return { month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: d.getDate() };
}

export default function NextMeetings({
  meetings,
  loading,
  error,
  title = "Official Village meetings",
  variant = "compact",
}: NextMeetingsProps) {
  const feature = variant === "feature";

  return (
    <section className={`pulse-widget${feature ? " pulse-widget-feature" : ""}`}>
      <div className="pulse-widget-header">
        <h2>
          {feature && (
            <span className="pulse-widget-icon">
              <Users size={22} strokeWidth={1.8} />
            </span>
          )}
          {title}
        </h2>
        {feature && (
          <a className="card-link" href={VILLAGE_MEETINGS_URL} target="_blank" rel="noopener noreferrer">
            Agendas &amp; Minutes <ExternalIcon size={13} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>

      {loading && <SkeletonRows count={2} />}

      {!loading && error && (
        <p className="pulse-empty">
          Couldn't load the meeting schedule —{" "}
          <a href={VILLAGE_MEETINGS_URL} target="_blank" rel="noopener noreferrer">
            check the official Village meetings page ↗
          </a>
        </p>
      )}

      {!loading && !error && meetings.length === 0 && feature && (
        <div className="pulse-empty-state">
          <span className="pulse-empty-art" aria-hidden="true">
            <span className="pulse-empty-art-icon">
              <CalendarIcon size={30} />
            </span>
          </span>
          <p className="pulse-empty-title">No upcoming meetings listed</p>
          <p className="pulse-empty">
            No official Village meetings are listed here yet. Check the official agendas and minutes for the latest
            schedule and materials.
          </p>
          <a className="pulse-outline-btn" href={VILLAGE_MEETINGS_URL} target="_blank" rel="noopener noreferrer">
            View Agendas &amp; Minutes <ExternalIcon size={14} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      )}

      {!loading && !error && meetings.length === 0 && !feature && (
        <p className="pulse-empty">
          No upcoming meetings are listed here yet. For the latest schedule and agendas, check the{" "}
          <a href={VILLAGE_MEETINGS_URL} target="_blank" rel="noopener noreferrer">
            official agendas and minutes ↗
          </a>
        </p>
      )}

      {!loading && !error && meetings.length > 0 && (
        <ul className="meeting-list">
          {meetings.map((m) => {
            const { month, day } = formatMonthDay(m.date);
            const href = meetingSourceUrl(m);
            return (
              <li key={m.id}>
                <a
                  className="meeting-row meeting-row-link"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${m.board} minutes on estero-fl.gov`}
                >
                  <div className="date-leaf">
                    <span className="date-leaf-month">{month}</span>
                    <span className="date-leaf-day">{day}</span>
                  </div>
                  <div className="meeting-info">
                    <div className="meeting-name-row">
                      <span className="meeting-name">{m.board}</span>
                      {meetingIsThisWeek(m.date) && <span className="chip-thisweek">This week</span>}
                    </div>
                    <div className="meeting-meta">
                      {m.time} · {m.venue}
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {/* The feature header already links to the meetings page. */}
      {meetings.length > 0 && !feature && (
        <a className="pulse-widget-link" href={VILLAGE_MEETINGS_URL} target="_blank" rel="noopener noreferrer">
          Official meeting page ↗
        </a>
      )}
    </section>
  );
}
