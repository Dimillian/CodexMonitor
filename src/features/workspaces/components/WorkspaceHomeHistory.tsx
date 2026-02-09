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
          ? "Running"
          : status?.isReviewing
            ? "Reviewing"
            : "Idle";
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
          <div className="workspace-home-section-title">Recent runs</div>
        </div>
        {runs.length === 0 ? (
          <div className="workspace-home-empty">
            Start a run to see its instances tracked here.
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
                        {run.mode === "local" ? "Local" : "Worktree"} · {run.instances.length} instance
                        {run.instances.length === 1 ? "" : "s"}
                        {run.status === "failed" && " · Failed"}
                        {run.status === "partial" && " · Partial"}
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
                          +{run.instanceErrors.length - 2} more
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
                      No instances were started.
                    </div>
                  ) : (
                    <div className="workspace-home-empty workspace-home-pending">
                      <span className="working-spinner" aria-hidden />
                      <span className="workspace-home-pending-text">
                        Instances are preparing...
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
          <div className="workspace-home-section-title">Recent threads</div>
        </div>
        {recentThreadInstances.length === 0 ? (
          <div className="workspace-home-empty">
            Threads from the sidebar will appear here.
          </div>
        ) : (
          <div className="workspace-home-run-grid">
            <div className="workspace-home-run-card">
              <div className="workspace-home-run-header">
                <div>
                  <div className="workspace-home-run-title">Agents activity</div>
                  <div className="workspace-home-run-meta">
                    {recentThreadInstances.length} thread
                    {recentThreadInstances.length === 1 ? "" : "s"}
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
