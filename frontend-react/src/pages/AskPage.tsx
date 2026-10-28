import { useState } from "react";
import ChatPanel from "../components/ChatPanel/ChatPanel";
import { TrashIcon } from "../components/Icons/Icons";
import type { ReportPrefill } from "../components/ReportDialog/ReportDialog";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { ChatMessage } from "../types";

/** Grouped starter questions — each checked against the live backend to
 * return a grounded answer, not just a "no records" fallback. */
const SUGGESTED: Array<{ heading: string; questions: string[] }> = [
  {
    heading: "Projects & Locations",
    questions: ["Where is the Via Coconut Point project located?", "What projects are planned along Corkscrew Road?"],
  },
  {
    heading: "Board Decisions",
    questions: [
      "What did the Village Council decide at its most recent meeting?",
      "What has the Village Council approved on Broadway Avenue?",
    ],
  },
  {
    heading: "Meetings",
    questions: ["Find meetings about traffic safety", "Which meetings discussed the Estero River?"],
  },
];

const CLEAR_FADE_MS = 220;

interface AskPageProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  busy: boolean;
  onReport: (prefill: ReportPrefill) => void;
  onNewChat: () => void;
}

export default function AskPage({ messages, onSend, busy, onReport, onNewChat }: AskPageProps) {
  const compact = useMediaQuery("(max-width: 900px)");
  const [isClearing, setIsClearing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const started = messages.length > 0;

  const clear = () => {
    if (isClearing || !started) return;
    setIsClearing(true);
    // Actual clear happens after the fade-out finishes, so the outgoing
    // messages are still on screen (just fading) for the duration.
    window.setTimeout(() => {
      onNewChat();
      setIsClearing(false);
    }, CLEAR_FADE_MS);
  };

  const pick = (q: string) => {
    setSuggestOpen(false);
    onSend(q);
  };

  const groups = SUGGESTED.map((group) => (
    <div className="suggest-group" key={group.heading}>
      <h3>{group.heading}</h3>
      <ul className="suggest-list">
        {group.questions.map((q) => (
          <li key={q}>
            <button type="button" className="suggest-btn" onClick={() => pick(q)} disabled={busy}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ));

  const clearButton = (
    <button type="button" className="ask-clear" onClick={clear} disabled={!started || isClearing}>
      <TrashIcon size={16} />
      Clear conversation
    </button>
  );

  return (
    <>
      <h1 className="sr-only">Ask a Question</h1>
      <div className="ask-layout">
        {compact ? (
          <div className="ask-compact-bar">
            <details
              className="ask-suggest-details"
              open={suggestOpen}
              onToggle={(e) => setSuggestOpen(e.currentTarget.open)}
            >
              <summary>Suggested questions</summary>
              <div className="ask-suggest-panel card">{groups}</div>
            </details>
            {clearButton}
          </div>
        ) : (
          <aside className="card ask-suggest" aria-labelledby="suggest-title">
            <h2 id="suggest-title">Suggested Questions</h2>
            {groups}
            <div className="ask-suggest-foot">{clearButton}</div>
          </aside>
        )}
        <ChatPanel messages={messages} onSend={onSend} disabled={busy} onReport={onReport} clearing={isClearing} />
      </div>
    </>
  );
}
