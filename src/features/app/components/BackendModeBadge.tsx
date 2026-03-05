import type { BackendMode } from "../../../types";

type BackendModeBadgeProps = {
  mode: BackendMode;
  className?: string;
};

const LABELS: Record<BackendMode, string> = {
  local: "Codex",
  remote: "Remote",
  claude: "Claude",
};

export function BackendModeBadge({ mode, className }: BackendModeBadgeProps) {
  return (
    <span
      className={`backend-mode-badge backend-mode-badge--${mode}${className ? ` ${className}` : ""}`}
      title={`Backend: ${LABELS[mode]}`}
    >
      {LABELS[mode]}
    </span>
  );
}
