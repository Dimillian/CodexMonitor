import { formatRelativeTime } from "../../../utils/time";
import type {
  WorkspaceHomeRun,
  WorkspaceHomeRunInstance,
} from "../hooks/useWorkspaceHome";
import { buildLabelCounts } from "./workspaceHomeHelpers";

type ThreadStatus = {
  isProcessing: boolean;
  isReviewing: boolean;
};

type WorkspaceHomeHistoryProps = {
  runs: WorkspaceHomeRun[];
  recentThreadInstances: WorkspaceHomeRunInstance[];
  recentThreadsUpdatedAt: number | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, ThreadStatus>;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
};

type WorkspaceHomeInstanceListProps = {
  instances: WorkspaceHomeRunInstance[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, ThreadStatus>;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
};

function WorkspaceHomeInstanceList({
  instances,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  onSelectInstance,
}: WorkspaceHomeInstanceListProps) {
  const labelCounts = buildLabelCounts(instances);

  return (
    <div className="workspace-home-instance-list">
      {instances.map((instance) => {
        const status = threadStatusById[instance.threadId];
        const statusLabel = status?.isProcessing
          ? "运行中"
          : status?.isReviewing
            ? "审查中"
            : "空闲";
        const stateClass = status?.isProcessing
          ? "is-running"
          : status?.isReviewing
            ? "is-reviewing"
            : "is-idle";
        const isActive =
          instance.threadId === activeThreadId &&
          instance.workspaceId === activeWorkspaceId;
        const totalForLabel = labelCounts.get(instance.modelLabel) ?? 1;
        const label =
          totalForLabel > 1
            ? `${instance.modelLabel} ${instance.sequence}`
            : instance.modelLabel;

        return (
          <button
            className={`workspace-home-instance ${stateClass}${isActive ? " is-active" : ""}`}
            key={instance.id}
            type="button"
            onClick={() => onSelectInstance(instance.workspaceId, instance.threadId)}
          >
            <span className="workspace-home-instance-title">{label}</span>
            <span
              className={`workspace-home-instance-status${
                status?.isProcessing ? " is-running" : ""
              }`}
            >
              {statusLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkspaceHomeHistory({
  runs,
  recentThreadInstances,
  recentThreadsUpdatedAt,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  onSelectInstance,
}: WorkspaceHomeHistoryProps) {
  return (
    <>
      <div className="workspace-home-runs">
        <div className="workspace-home-section-header">
          <div className="workspace-home-section-title">最近的运行</div>
        </div>
        {runs.length === 0 ? (
          <div className="workspace-home-empty">
            发起一次运行，即可在此追踪实例状态。
          </div>
        ) : (
          <div className="workspace-home-run-grid">
            {runs.map((run) => {
              const hasInstances = run.instances.length > 0;

              return (
                <div className="workspace-home-run-card" key={run.id}>
                  <div className="workspace-home-run-header">
                    <div>
                      <div className="workspace-home-run-title">{run.title}</div>
                      <div className="workspace-home-run-meta">
                        {run.mode === "local" ? "本地" : "工作树"} · {run.instances.length} 个实例
                        {run.status === "failed" && " · 失败"}
                        {run.status === "partial" && " · 部分完成"}
                      </div>
                    </div>
                    <div className="workspace-home-run-time">
                      {formatRelativeTime(run.createdAt)}
                    </div>
                  </div>
                  {run.error && <div className="workspace-home-run-error">{run.error}</div>}
                  {run.instanceErrors.length > 0 && (
                    <div className="workspace-home-run-error-list">
                      {run.instanceErrors.slice(0, 2).map((entry, index) => (
                        <div className="workspace-home-run-error-item" key={index}>
                          {entry.message}
                        </div>
                      ))}
                      {run.instanceErrors.length > 2 && (
                        <div className="workspace-home-run-error-item">
                          还有 {run.instanceErrors.length - 2} 条
                        </div>
                      )}
                    </div>
                  )}
                  {hasInstances ? (
                    <WorkspaceHomeInstanceList
                      instances={run.instances}
                      activeWorkspaceId={activeWorkspaceId}
                      activeThreadId={activeThreadId}
                      threadStatusById={threadStatusById}
                      onSelectInstance={onSelectInstance}
                    />
                  ) : run.status === "failed" ? (
                    <div className="workspace-home-empty">
                      未启动任何实例。
                    </div>
                  ) : (
                    <div className="workspace-home-empty workspace-home-pending">
                      <span className="working-spinner" aria-hidden />
                      <span className="workspace-home-pending-text">
                        实例准备中…
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="workspace-home-runs">
        <div className="workspace-home-section-header">
          <div className="workspace-home-section-title">最近的对话</div>
        </div>
        {recentThreadInstances.length === 0 ? (
          <div className="workspace-home-empty">
            侧边栏中的对话将显示在这里。
          </div>
        ) : (
          <div className="workspace-home-run-grid">
            <div className="workspace-home-run-card">
              <div className="workspace-home-run-header">
                <div>
                  <div className="workspace-home-run-title">对话活动</div>
                  <div className="workspace-home-run-meta">
                    {recentThreadInstances.length} 个对话
                  </div>
                </div>
                {recentThreadsUpdatedAt ? (
                  <div className="workspace-home-run-time">
                    {formatRelativeTime(recentThreadsUpdatedAt)}
                  </div>
                ) : null}
              </div>
              <WorkspaceHomeInstanceList
                instances={recentThreadInstances}
                activeWorkspaceId={activeWorkspaceId}
                activeThreadId={activeThreadId}
                threadStatusById={threadStatusById}
                onSelectInstance={onSelectInstance}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
