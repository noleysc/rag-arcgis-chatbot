import type { ChatMessage } from "../../types";
import ChatEmptyState from "./ChatEmptyState";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import type { ReportPrefill } from "../ReportDialog/ReportDialog";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled: boolean;
  onReport?: (prefill: ReportPrefill) => void;
  /** True while a "Clear conversation" fade-out is playing (see AskPage). */
  clearing?: boolean;
}

export default function ChatPanel({ messages, onSend, disabled, onReport, clearing }: ChatPanelProps) {
  const started = messages.length > 0;

  return (
    <section id="chat-panel" className="card" aria-label="Conversation">
      <div className={`chat-body${clearing ? " chat-clearing" : ""}`}>
        {started ? <MessageList messages={messages} onReport={onReport} onSend={onSend} /> : <ChatEmptyState />}
      </div>
      {/* DatasetBar (Load CSV) intentionally hidden — the dataset already loads
          at backend startup. Component and POST /load left in place; see
          DatasetBar.tsx to re-enable. */}
      <ChatInput onSend={onSend} disabled={disabled} />
    </section>
  );
}
