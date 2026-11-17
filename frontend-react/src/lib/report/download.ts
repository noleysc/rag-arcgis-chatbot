import type { ChatMessage } from "../../types";

/** True when a bot message can be exported: finished, not an error, and
 * carrying answer text. */
export function canExportReport(message: ChatMessage): boolean {
  return message.role === "bot" && !message.streaming && !message.error && !!message.prose?.trim();
}

/**
 * Build and download the PDF brief for one answer. The renderer is loaded
 * on demand, so the chat bundle doesn't carry react-pdf.
 */
export async function downloadReport(message: ChatMessage): Promise<string> {
  const { renderReportBlob } = await import("./renderBlob");
  const { blob, filename } = await renderReportBlob(message, message.question);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a moment to start the download before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return filename;
}
