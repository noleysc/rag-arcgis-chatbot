import type { TimelineEntry } from "../../types";
import { statusClass, statusEmoji } from "../../lib/parseAnswer";
import { scrollToRecord } from "../../lib/recordScroll";
import { CalendarIcon } from "../Icons/Icons";

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null;
  // News milestones only ("Update") read as recent updates; anything with a
  // board outcome is a decision history.
  const title = entries.every((e) => (e.status || "").toLowerCase() === "update") ? "Recent Updates" : "Timeline";

  return (
    <div className="answer-timeline-card">
      <h3 className="answer-timeline-title">
        <CalendarIcon size={18} />
        {title}
      </h3>
      <ol className="answer-timeline">
        {entries.map((entry, i) => (
          <li key={i} className="answer-timeline-item">
            <span className={`answer-timeline-dot ${statusClass(entry.status)}`} aria-hidden="true" />
            <div className="answer-timeline-body">
              <div className="answer-timeline-head">
                {entry.date && <span className="answer-timeline-date">{entry.date}</span>}
                <span className={`proj-status ${statusClass(entry.status)}`}>
                  {statusEmoji(entry.status)} {entry.status}
                </span>
              </div>
              <p className="answer-timeline-event">
                {entry.event}
                {entry.recordId && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="record-id-link"
                      onClick={() => scrollToRecord(entry.recordId)}
                    >
                      [{entry.recordId}]
                    </button>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
