import type { Meeting } from "../../types";
import { meetingIsThisWeek } from "../../hooks/useMeetings";
import { meetingSourceUrl, VILLAGE_AGENDAS_URL } from "../../lib/meetingSource";
import { SkeletonRows } from "./Skeleton";

interface NextMeetingsProps {
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  title?: string;
}

function formatMonthDay(dateStr: string): { month: string; day: number } {
  const d = new Date(`${dateStr}T00:00:00`);
  return { month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: d.getDate() };
}

export default function NextMeetings({ meetings, loading, error, title = "Next Meetings" }: NextMeetingsProps) {
  return (
    <section className="pulse-widget">
      <div className="pulse-widget-header">
        <h2>{title}</h2>
      </div>

      {loading && <SkeletonRows count={2} />}

      {!loading && error && (
        <p className="pulse-empty">
          Couldn't load the meeting schedule —{" "}
          <a href={VILLAGE_AGENDAS_URL} target="_blank" rel="noopener noreferrer">
            check the Village calendar ↗
          </a>
        </p>
      )}

      {!loading && !error && meetings.length === 0 && (
        <p className="pulse-empty">
          No upcoming meetings are listed here yet. For the latest schedule and agendas, check the{" "}
          <a href={VILLAGE_AGENDAS_URL} target="_blank" rel="noopener noreferrer">
            Village of Estero meeting calendar ↗
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

      {meetings.length > 0 && (
        <a className="pulse-widget-link" href={VILLAGE_AGENDAS_URL} target="_blank" rel="noopener noreferrer">
          View agendas ↗
        </a>
      )}
    </section>
  );
}
