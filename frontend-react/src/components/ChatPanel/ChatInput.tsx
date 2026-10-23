import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import PromptHelpDialog from "../PromptHelp/PromptHelpDialog";
import { setMapContext, subscribeMapContext, type MapContextSelection } from "../../lib/uiStore";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [mapCtx, setLocalMapCtx] = useState<MapContextSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return subscribeMapContext((ctx) => {
      setLocalMapCtx(ctx);
      if (ctx) {
        textareaRef.current?.focus();
      }
    });
  }, []);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  };

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    let finalQuestion = q;
    if (mapCtx) {
      const ctxParts = [
        mapCtx.title,
        mapCtx.appId ? `(${mapCtx.appId})` : "",
        mapCtx.location ? `at ${mapCtx.location}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      finalQuestion = `Regarding ${ctxParts}: ${q}`;
      setMapContext(null);
    }
    onSend(finalQuestion);
    setValue("");
    requestAnimationFrame(autoResize);
    setJustSent(true);
    window.setTimeout(() => setJustSent(false), 320);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const ctxLabel = mapCtx
    ? [mapCtx.title || mapCtx.appId || "Selected Location", mapCtx.title && mapCtx.appId ? `(${mapCtx.appId})` : ""]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div id="input-bar">
      {mapCtx && (
        <div className="chat-map-context-chip" role="status">
          <span className="chat-map-context-text">
            📍 <strong>{ctxLabel}</strong>
            {mapCtx.location ? ` · ${mapCtx.location}` : ""}
          </span>
          <button
            type="button"
            className="chat-map-context-clear"
            onClick={() => setMapContext(null)}
            aria-label="Remove attached map project"
            title="Remove map context"
          >
            ✕
          </button>
        </div>
      )}
      <div id="input-wrap">
        <button
          type="button"
          className="btn-prompt-help"
          onClick={() => setHelpOpen(true)}
          title="Help me ask a question"
          aria-label="Help me ask a question"
          disabled={disabled}
        >
          ?
        </button>
        <label htmlFor="question" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="question"
          ref={textareaRef}
          rows={1}
          placeholder={
            mapCtx
              ? `Ask a question about ${mapCtx.title || mapCtx.appId || "this location"}…`
              : "Ask about a project, location, year, or decision…"
          }
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKey}
        />
        <button
          type="button"
          id="send-btn"
          className={justSent ? "send-pulse" : ""}
          onClick={submit}
          title="Send"
          aria-label="Send message"
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
          </svg>
        </button>
      </div>
      <div id="input-footer">Data: Village of Estero · Built by Engage Estero</div>
      <PromptHelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onPickPrompt={(prompt) => onSend(prompt)}
      />
    </div>
  );
}
