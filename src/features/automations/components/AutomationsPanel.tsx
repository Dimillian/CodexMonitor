import Play from "lucide-react/dist/esm/icons/play";

/**
 * Automations panel — entry point for viewing and managing automations.
 * This is the initial scaffold; automation data sources will be
 * connected as the backend API stabilises.
 */
export function AutomationsPanel() {
  return (
    <div className="automations-panel">
      <div className="automations-panel-header">
        <Play size={14} aria-hidden />
        <span className="automations-panel-title">Automations</span>
      </div>
      <div className="automations-panel-body">
        <div className="automations-panel-empty">
          <p className="automations-panel-empty-title">暂无自动化任务</p>
          <p className="automations-panel-empty-hint">
            自动化功能允许你设定触发条件，让 Codex 自动执行任务。
            此功能正在开发中。
          </p>
        </div>
      </div>
    </div>
  );
}
