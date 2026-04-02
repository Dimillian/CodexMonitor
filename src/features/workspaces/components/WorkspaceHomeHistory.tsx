import { formatRelativeTime } from "../../../utils/time";
import { useTranslation } from "react-i18next";
import {
  getWorkspaceHomeThreadState,
  type ThreadStatusById,
} from "../../../utils/threadStatus";
import type {
  WorkspaceHomeRun,
  WorkspaceHomeRunInstance,
} from "../hooks/useWorkspaceHome";
import { buildLabelCounts } from "./workspaceHomeHelpers";

type WorkspaceHomeHistoryProps = {
  runs: WorkspaceHomeRun[];
  recentThreadInstances: WorkspaceHomeRunInstance[];
  recentThreadsUpdatedAt: number | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
};

type WorkspaceHomeInstanceListProps = {
  instances: WorkspaceHomeRunInstance[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
};

function WorkspaceHomeInstanceList({
  instances,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  onSelectInstance,
}: WorkspaceHomeInstanceListProps) {
  const { t } = useTranslation();
  const labelCounts = buildLabelCounts(instances);

  return (
    <div className="workspace-home-instance-list">
      {instances.map((instance) => {
        const status = getWorkspaceHomeThreadState(threadStatusById[instance.threadId]);
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
            className={`workspace-home-instance ${status.stateClass}${isActive ? " is-active" : ""}`}
            key={instance.id}
            type="button"
            onClick={() => onSelectInstance(instance.workspaceId, instance.threadId)}
          >
            <span className="workspace-home-instance-title">{label}</span>
            <span
              className={`workspace-home-instance-status${
                status.isRunning ? " is-running" : ""
              }`}
            >
              {t(`workspaceHome.threadStatus.${status.statusLabel}`)}
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
  const { t } = useTranslation();
  return (
    <>
      <div className="workspace-home-runs">
        <div className="workspace-home-section-header">
          <div className="workspace-home-section-title">{t("workspaceHome.recentRuns")}</div>
        </div>
        {runs.length === 0 ? (
          <div className="workspace-home-empty">{t("workspaceHome.startRunToTrackInstances")}</div>
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
                        {run.mode === "local"
                          ? t("workspaceHome.localMode")
                          : t("workspaceHome.worktreeMode")}{" "}
                        · {run.instances.length}{" "}
                        {run.instances.length === 1
                          ? t("workspaceHome.instanceSingular")
                          : t("workspaceHome.instancePlural")}
                        {run.status === "failed" && ` · ${t("workspaceHome.failed")}`}
                        {run.status === "partial" && ` · ${t("workspaceHome.partial")}`}
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
                          {t("workspaceHome.moreCount", {
                            count: run.instanceErrors.length - 2,
                          })}
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
                    <div className="workspace-home-empty">{t("workspaceHome.noInstancesStarted")}</div>
                  ) : (
                    <div className="workspace-home-empty workspace-home-pending">
                      <span className="working-spinner" aria-hidden />
                      <span className="workspace-home-pending-text">
                        {t("workspaceHome.instancesPreparing")}
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
          <div className="workspace-home-section-title">{t("workspaceHome.recentThreads")}</div>
        </div>
        {recentThreadInstances.length === 0 ? (
          <div className="workspace-home-empty">{t("workspaceHome.threadsFromSidebarAppearHere")}</div>
        ) : (
          <div className="workspace-home-run-grid">
            <div className="workspace-home-run-card">
              <div className="workspace-home-run-header">
                <div>
                  <div className="workspace-home-run-title">{t("workspaceHome.agentsActivity")}</div>
                  <div className="workspace-home-run-meta">
                    {recentThreadInstances.length}{" "}
                    {recentThreadInstances.length === 1
                      ? t("workspaceHome.threadSingular")
                      : t("workspaceHome.threadPlural")}
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
