import { useMemo, useState } from "react";

type PlanReadyFollowupMessageProps = {
  onAccept: () => void;
  onSubmitChanges: (changes: string) => void;
};

export function PlanReadyFollowupMessage({
  onAccept,
  onSubmitChanges,
}: PlanReadyFollowupMessageProps) {
  const [changes, setChanges] = useState("");
  const trimmed = useMemo(() => changes.trim(), [changes]);

  return (
    <div className="message request-user-input-message">
      <div
        className="bubble request-user-input-card"
        role="group"
        aria-label="Plan ready"
      >
        <div className="request-user-input-header">
          <div className="request-user-input-title">Plan ready</div>
        </div>
        <div className="request-user-input-body">
          <section className="request-user-input-question">
            <div className="request-user-input-question-text">
              Start building from this plan, or describe changes to the plan.
            </div>
            <textarea
              className="request-user-input-notes"
              placeholder="Describe what you want to change in the plan..."
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
              rows={3}
            />
          </section>
        </div>
        <div className="request-user-input-actions">
          <button
            type="button"
            className="plan-ready-followup-change"
            onClick={() => {
              if (!trimmed) {
                return;
              }
              onSubmitChanges(trimmed);
              setChanges("");
            }}
            disabled={!trimmed}
          >
            Send changes
          </button>
          <button type="button" className="primary" onClick={onAccept}>
            Implement this plan
          </button>
        </div>
      </div>
    </div>
  );
}
