import { useState } from "react";

interface DisclaimerModalProps {
  /** Opens the site's feedback form (ReportDialog). */
  onFeedback: () => void;
}

export default function DisclaimerModal({ onFeedback }: DisclaimerModalProps) {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <div className="disclaimer-backdrop">
      <div className="disclaimer-dialog" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <h2 id="disclaimer-title">
          <span className="disclaimer-badge">Beta</span>
          Welcome to Engage Estero
        </h2>
        <p>
          This is a beta site under active development. Information may be incomplete or contain errors. Your feedback
          is appreciated.
        </p>
        <div className="disclaimer-actions">
          <button type="button" className="btn-showmap disclaimer-ack-btn" onClick={() => setOpen(false)}>
            I understand
          </button>
          <button
            type="button"
            className="disclaimer-feedback-btn"
            onClick={() => {
              setOpen(false);
              onFeedback();
            }}
          >
            Share feedback
          </button>
        </div>
      </div>
    </div>
  );
}
