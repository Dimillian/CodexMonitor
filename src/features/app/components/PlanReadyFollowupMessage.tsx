import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type PlanReadyFollowupMessageProps = {
  onAccept: () => void;
  onSubmitChanges: (changes: string) => void;
};

export function PlanReadyFollowupMessage({
  onAccept,
  onSubmitChanges,
}: PlanReadyFollowupMessageProps) {
  const { t } = useTranslation();
  const [changes, setChanges] = useState("");
  const trimmed = useMemo(() => changes.trim(), [changes]);

  return (
    <div className="message request-user-input-message">
      <div
        className="bubble request-user-input-card"
        role="group"
        aria-label={t("planReady.ariaLabel")}
      >
        <div className="request-user-input-header">
          <div className="request-user-input-title">{t("planReady.title")}</div>
        </div>
        <div className="request-user-input-body">
          <section className="request-user-input-question">
            <div className="request-user-input-question-text">
              {t("planReady.description")}
            </div>
            <textarea
              className="request-user-input-notes"
              placeholder={t("planReady.placeholder")}
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
            {t("planReady.sendChanges")}
          </button>
          <button type="button" className="primary" onClick={onAccept}>
            {t("planReady.implement")}
          </button>
        </div>
      </div>
    </div>
  );
}
