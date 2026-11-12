import type { ChatMessage } from "../../types";
import { useAnswerScroll } from "../../hooks/useAnswerScroll";
import Message from "./Message";
import type { ReportPrefill } from "../ReportDialog/ReportDialog";

interface MessageListProps {
  messages: ChatMessage[];
  onReport?: (prefill: ReportPrefill) => void;
  onSend?: (text: string) => void;
}

export default function MessageList({ messages, onReport, onSend }: MessageListProps) {
  const { ref, scrollHandlers } = useAnswerScroll<HTMLDivElement>(messages);

  return (
    <div
      id="messages"
      className="visible"
      ref={ref}
      {...scrollHandlers}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversation"
    >
      {messages.map((m) => (
        <Message key={m.id} message={m} onReport={onReport} onSend={onSend} />
      ))}
    </div>
  );
}
