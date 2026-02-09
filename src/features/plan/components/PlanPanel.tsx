import type { TurnPlan } from "../../../types";
import { useTranslation } from "react-i18next";

type PlanPanelProps = {
  plan: TurnPlan | null;
  isProcessing: boolean;
};

function formatProgress(plan: TurnPlan) {
  const total = plan.steps.length;
  if (!total) {
    return "";
  }
  const completed = plan.steps.filter((step) => step.status === "completed").length;
  return `${completed}/${total}`;
}

function statusLabel(status: TurnPlan["steps"][number]["status"], t: any) {
  if (status === "completed") {
    return t('plan.step_completed');
  }
  if (status === "inProgress") {
    return t('plan.step_in_progress');
  }
  return t('plan.step_pending');
}

export function PlanPanel({ plan, isProcessing }: PlanPanelProps) {
  const { t } = useTranslation();
  const progress = plan ? formatProgress(plan) : "";
  const steps = plan?.steps ?? [];
  const showEmpty = !steps.length && !plan?.explanation;
  const emptyLabel = isProcessing ? t('plan.waiting_for_plan') : t('plan.no_active_plan');

  return (
    <aside className="plan-panel">
      <div className="plan-header">
        <span>{t('plan.plan')}</span>
        {progress && <span className="plan-progress">{progress}</span>}
      </div>
      {plan?.explanation && (
        <div className="plan-explanation">{plan.explanation}</div>
      )}
      {showEmpty ? (
        <div className="plan-empty">{emptyLabel}</div>
      ) : (
        <ol className="plan-list">
          {steps.map((step, index) => (
            <li key={`${step.step}-${index}`} className={`plan-step ${step.status}`}>
              <span className="plan-step-status" aria-hidden>
                {statusLabel(step.status, t)}
              </span>
              <span className="plan-step-text">{step.step}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
