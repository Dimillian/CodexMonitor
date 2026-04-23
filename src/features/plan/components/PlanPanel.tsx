import { useI18n } from "@/i18n";
import type { TurnPlan } from "../../../types";

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

function statusLabel(status: TurnPlan["steps"][number]["status"]) {
  if (status === "completed") {
    return "[x]";
  }
  if (status === "inProgress") {
    return "[>]";
  }
  return "[ ]";
}

export function PlanPanel({ plan, isProcessing }: PlanPanelProps) {
  const { tx } = useI18n();
  const progress = plan ? formatProgress(plan) : "";
  const steps = plan?.steps ?? [];
  const showEmpty = !steps.length && !plan?.explanation;
  const emptyLabel = isProcessing ? tx("Waiting on a plan...") : tx("No active plan.");

  return (
    <aside className="plan-panel">
      <div className="plan-header">
        <span>{tx("Plan")}</span>
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
                {statusLabel(step.status)}
              </span>
              <span className="plan-step-text">{step.step}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
