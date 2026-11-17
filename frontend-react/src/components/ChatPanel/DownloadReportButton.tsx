import { useState } from "react";
import type { ChatMessage } from "../../types";
import { downloadReport } from "../../lib/report/download";
import { DownloadIcon } from "../Icons/Icons";

type State = "idle" | "working" | "done" | "error";

/** "Download PDF" for one finished answer — exports just this question and
 * its answer as an Engage Estero Civic Intelligence Brief. */
export default function DownloadReportButton({ message }: { message: ChatMessage }) {
  const [state, setState] = useState<State>("idle");

  const onClick = async () => {
    if (state === "working") return;
    setState("working");
    try {
      await downloadReport(message);
      setState("done");
    } catch (err) {
      console.error("PDF export failed", err);
      setState("error");
    }
  };

  const working = state === "working";
  return (
    <>
      <button
        type="button"
        className="btn-copy btn-pdf"
        onClick={() => void onClick()}
        disabled={working}
        aria-busy={working}
        title="Download this answer as a PDF brief"
      >
        {working ? <span className="btn-pdf-spinner" aria-hidden="true" /> : <DownloadIcon size={13} />}
        <span>{working ? "Preparing PDF…" : "Download PDF"}</span>
      </button>
      {state === "error" && (
        <span className="btn-pdf-error" role="alert">
          Couldn&rsquo;t create the PDF. Please try again.
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "done" ? "PDF brief downloaded." : ""}
      </span>
    </>
  );
}
