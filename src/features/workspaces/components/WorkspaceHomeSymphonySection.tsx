import { useCallback, useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import Plus from "lucide-react/dist/esm/icons/plus";
import type {
  WorkspaceInfo,
  WorkspaceSymphonyHealth,
  WorkspaceSymphonySnapshot,
  WorkspaceSymphonyStatus,
  WorkspaceTask,
  WorkspaceTaskEvent,
  WorkspaceTaskStatus,
  WorkspaceTaskTelemetry,
} from "../../../types";
import {
  createWorkspaceSymphonyTask,
  deleteWorkspaceSymphonyTask,
  getWorkspaceSymphonyStatus,
  getWorkspaceSymphonyTelemetry,
  listWorkspaces,
  moveWorkspaceSymphonyTask,
  startWorkspaceSymphony,
  stopWorkspaceSymphony,
  updateWorkspaceSymphonyTask,
} from "../../../services/tauri";
import { subscribeWorkspaceSymphonyEvents } from "../../../services/events";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { FileEditorCard } from "../../shared/components/FileEditorCard";

const COLUMNS: { status: WorkspaceTaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In Progress" },
  { status: "human_review", label: "Human Review" },
  { status: "rework", label: "Rework" },
  { status: "merging", label: "Merging" },
  { status: "done", label: "Done" },
];

type WorkspaceHomeSymphonySectionProps = {
  workspace: WorkspaceInfo;
  workflowContent: string;
  workflowExists: boolean;
  workflowTruncated: boolean;
  workflowLoading: boolean;
  workflowSaving: boolean;
  workflowError: string | null;
  workflowDirty: boolean;
  workflowMeta: string;
  workflowSaveLabel: string;
  workflowSaveDisabled: boolean;
  workflowRefreshDisabled: boolean;
  onWorkflowChange: (value: string) => void;
  onWorkflowRefresh: () => void;
  onWorkflowSave: () => void;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
};

function formatRelativeTime(timestamp?: number | null) {
  if (!timestamp) {
    return "Never";
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatAbsoluteTime(timestamp?: number | null) {
  if (!timestamp) {
    return "Unknown";
  }
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "0m";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTaskStatusLabel(status: WorkspaceTaskStatus) {
  return status.replace(/_/g, " ");
}

function formatStateLabel(state: WorkspaceSymphonyStatus["state"]) {
  switch (state) {
    case "running":
      return "Running";
    case "starting":
      return "Starting";
    case "error":
      return "Error";
    default:
      return "Stopped";
  }
}

function formatHealthLabel(health: WorkspaceSymphonyHealth) {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "stale":
      return "Stale";
    case "error":
      return "Error";
    default:
      return "Stopped";
  }
}

function formatTokenCount(value?: number | null) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function buildTaskSummary(task: WorkspaceTask) {
  const run = task.activeRun;
  if (!run) {
    return task.status === "todo"
      ? "Queued for Symphony."
      : task.description?.trim() || "No activity yet.";
  }
  return (
    run.lastMessage ||
    run.lastEvent ||
    run.lastError ||
    task.description?.trim() ||
    "Live telemetry pending."
  );
}

function buildTimelineEvents(
  telemetry: WorkspaceTaskTelemetry | null,
): Array<WorkspaceTaskEvent & { tone: "transition" | "telemetry" }> {
  return (telemetry?.events ?? []).map((event) => ({
    ...event,
    tone: /moved|created|deleted|claimed|review/i.test(event.message)
      ? "transition"
      : "telemetry",
  }));
}

export function WorkspaceHomeSymphonySection({
  workspace,
  workflowContent,
  workflowExists,
  workflowTruncated,
  workflowLoading,
  workflowSaving,
  workflowError,
  workflowDirty,
  workflowMeta,
  workflowSaveLabel,
  workflowSaveDisabled,
  workflowRefreshDisabled,
  onWorkflowChange,
  onWorkflowRefresh,
  onWorkflowSave,
  onSelectInstance,
}: WorkspaceHomeSymphonySectionProps) {
  const [snapshot, setSnapshot] = useState<WorkspaceSymphonySnapshot | null>(null);
  const [telemetry, setTelemetry] = useState<WorkspaceTaskTelemetry | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspacesById, setWorkspacesById] = useState<Record<string, WorkspaceInfo>>({});

  const selectedTask = useMemo(
    () => snapshot?.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, snapshot?.tasks],
  );

  useEffect(() => {
    if (!selectedTask) {
      if (!selectedTaskId) {
        setDraftTaskId(null);
      }
      return;
    }
    if (draftTaskId === selectedTask.id) {
      return;
    }
    setEditTitle(selectedTask.title);
    setEditDescription(selectedTask.description ?? "");
    setDraftTaskId(selectedTask.id);
  }, [draftTaskId, selectedTask, selectedTaskId]);

  const loadTelemetry = useCallback(
    async (taskId: string | null) => {
      if (!taskId) {
        setTelemetry(null);
        return;
      }
      const nextTelemetry = await getWorkspaceSymphonyTelemetry(workspace.id, taskId);
      setTelemetry(nextTelemetry);
    },
    [workspace.id],
  );

  const refreshSnapshot = useCallback(
    async (taskIdOverride?: string | null) => {
      const nextSnapshot = await getWorkspaceSymphonyStatus(workspace.id);
      setSnapshot(nextSnapshot);
      const nextSelectedTaskId =
        taskIdOverride === undefined
          ? selectedTaskId && nextSnapshot.tasks.some((task) => task.id === selectedTaskId)
            ? selectedTaskId
            : (nextSnapshot.tasks[0]?.id ?? null)
          : taskIdOverride;
      setSelectedTaskId(nextSelectedTaskId);
      await loadTelemetry(nextSelectedTaskId);
      return nextSnapshot;
    },
    [loadTelemetry, selectedTaskId, workspace.id],
  );

  useEffect(() => {
    let cancelled = false;
    void listWorkspaces().then((entries) => {
      if (cancelled) {
        return;
      }
      setWorkspacesById(Object.fromEntries(entries.map((entry) => [entry.id, entry])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextSnapshot = await getWorkspaceSymphonyStatus(workspace.id);
        if (cancelled) {
          return;
        }
        setSnapshot(nextSnapshot);
        const nextSelectedTaskId =
          selectedTaskId && nextSnapshot.tasks.some((task) => task.id === selectedTaskId)
            ? selectedTaskId
            : (nextSnapshot.tasks[0]?.id ?? null);
        setSelectedTaskId(nextSelectedTaskId);
        if (nextSelectedTaskId) {
          const nextTelemetry = await getWorkspaceSymphonyTelemetry(
            workspace.id,
            nextSelectedTaskId,
          );
          if (!cancelled) {
            setTelemetry(nextTelemetry);
          }
        } else if (!cancelled) {
          setTelemetry(null);
        }
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    };

    void load();
    const unsubscribe = subscribeWorkspaceSymphonyEvents((event) => {
      if (event.workspaceId !== workspace.id) {
        return;
      }
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedTaskId, workspace.id]);

  const tasksByStatus = useMemo(() => {
    const grouped = new Map<WorkspaceTaskStatus, WorkspaceTask[]>();
    for (const column of COLUMNS) {
      grouped.set(column.status, []);
    }
    for (const task of snapshot?.tasks ?? []) {
      grouped.get(task.status)?.push(task);
    }
    return grouped;
  }, [snapshot?.tasks]);

  const timelineEvents = useMemo(() => buildTimelineEvents(telemetry), [telemetry]);

  const runAction = async (
    actionKey: string,
    action: () => Promise<string | null | void>,
  ) => {
    setBusyAction(actionKey);
    setError(null);
    try {
      const nextSelectedTaskId = await action();
      await refreshSnapshot(nextSelectedTaskId ?? undefined);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateTask = async () => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      return;
    }
    await runAction("create", async () => {
      const task = await createWorkspaceSymphonyTask(workspace.id, {
        title: trimmedTitle,
        description: newDescription.trim() || null,
      });
      setNewTitle("");
      setNewDescription("");
      setShowCreateModal(false);
      return task.id;
    });
  };

  const handleSaveTask = async () => {
    if (!selectedTask) {
      return;
    }
    await runAction(`save:${selectedTask.id}`, async () => {
      const task = await updateWorkspaceSymphonyTask(workspace.id, {
        taskId: selectedTask.id,
        title: editTitle.trim() || selectedTask.title,
        description: editDescription.trim() || null,
      });
      return task.id;
    });
  };

  const moveTask = async (task: WorkspaceTask, status: WorkspaceTaskStatus) => {
    await runAction(`move:${task.id}:${status}`, async () => {
      const moved = await moveWorkspaceSymphonyTask(workspace.id, task.id, status);
      return moved.id;
    });
  };

  const handleDeleteTask = async (task: WorkspaceTask) => {
    await runAction(`delete:${task.id}`, async () => {
      await deleteWorkspaceSymphonyTask(workspace.id, task.id);
      if (selectedTaskId === task.id) {
        setDraftTaskId(null);
      }
      return null;
    });
  };

  const handleToggleRuntime = async () => {
    if ((snapshot?.status.state ?? "stopped") === "running") {
      await runAction("runtime:stop", async () => {
        await stopWorkspaceSymphony(workspace.id);
      });
      return;
    }
    await runAction("runtime:start", async () => {
      await startWorkspaceSymphony(workspace.id);
    });
  };

  const runtimeStatus = snapshot?.status;
  const selectedTelemetry = telemetry?.task.id === selectedTask?.id ? telemetry : null;
  const selectedRun = selectedTask?.activeRun ?? null;
  const selectedLiveRun = selectedTelemetry?.liveRun ?? null;
  const selectedActivity =
    selectedLiveRun?.currentEvent ?? selectedRun?.lastEvent ?? "Waiting for activity.";
  const selectedMessage =
    selectedRun?.lastMessage ??
    selectedRun?.lastError ??
    (selectedTask ? buildTaskSummary(selectedTask) : "No message yet.");
  const linkedWorktree =
    (selectedRun?.worktreeWorkspaceId &&
      workspacesById[selectedRun.worktreeWorkspaceId]) ||
    null;
  const runtimeHeaderCards = [
    {
      label: "Health",
      value: formatHealthLabel(runtimeStatus?.health ?? "stopped"),
      meta: formatStateLabel(runtimeStatus?.state ?? "stopped"),
      tone: runtimeStatus?.health ?? "stopped",
    },
    {
      label: "Running",
      value: formatDuration(runtimeStatus?.uptimeMs),
      meta: `Heartbeat ${formatRelativeTime(runtimeStatus?.lastHeartbeatAtMs)}`,
      tone: "neutral",
    },
    {
      label: "Agents",
      value: `${runtimeStatus?.activeAgents ?? 0}/${runtimeStatus?.maxAgents ?? 0}`,
      meta: `${runtimeStatus?.activeTasks ?? 0} active tasks`,
      tone: "neutral",
    },
    {
      label: "Input Tokens",
      value: formatTokenCount(runtimeStatus?.inputTokens),
      meta: `Output ${formatTokenCount(runtimeStatus?.outputTokens)}`,
      tone: "neutral",
    },
    {
      label: "Total Tokens",
      value: formatTokenCount(runtimeStatus?.totalTokens),
      meta: `${runtimeStatus?.retryingTasks ?? 0} retrying`,
      tone: "neutral",
    },
  ];

  return (
    <section className="workspace-home-symphony">
      <div className="workspace-home-symphony-dashboard">
        <div className="workspace-home-symphony-dashboard-header">
          <div>
            <div className="workspace-home-symphony-dashboard-title">Live controls</div>
            <div className="workspace-home-section-meta">Status, health, tokens, and agents.</div>
          </div>
          <div className="workspace-home-symphony-dashboard-actions">
            {runtimeStatus?.logPath ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  void revealItemInDir(runtimeStatus.logPath!);
                }}
              >
                Open logs
              </button>
            ) : null}
            <button
              className="button"
              type="button"
              disabled={busyAction === "runtime:start" || busyAction === "runtime:stop"}
              onClick={() => {
                void handleToggleRuntime();
              }}
            >
              {runtimeStatus?.state === "running" ? "Stop Symphony" : "Start Symphony"}
            </button>
          </div>
        </div>

        <div className="workspace-home-symphony-runtime-grid">
          {runtimeHeaderCards.map((card) => (
            <div
              key={card.label}
              className={`workspace-home-symphony-runtime-card${
                card.tone !== "neutral" ? ` is-${card.tone}` : ""
              }`}
            >
              <div className="workspace-home-symphony-runtime-card-label">{card.label}</div>
              <div className="workspace-home-symphony-runtime-card-value">{card.value}</div>
              <div className="workspace-home-symphony-runtime-card-meta">{card.meta}</div>
            </div>
          ))}
        </div>

        <div className="workspace-home-symphony-runtime-footer">
          <span className={`workspace-home-symphony-badge is-${runtimeStatus?.health ?? "stopped"}`}>
            {formatHealthLabel(runtimeStatus?.health ?? "stopped")}
          </span>
          <span className="workspace-home-section-meta">
            Binary: {runtimeStatus?.binaryVersion ?? runtimeStatus?.binaryPath ?? "Not resolved"}
          </span>
          {runtimeStatus?.lastActivityAtMs ? (
            <span className="workspace-home-section-meta">
              Last activity {formatRelativeTime(runtimeStatus.lastActivityAtMs)}
            </span>
          ) : null}
        </div>
        {runtimeStatus?.lastError ? (
          <div className="workspace-home-error">{runtimeStatus.lastError}</div>
        ) : null}
      </div>

      {error ? <div className="workspace-home-error">{error}</div> : null}

      <div className="workspace-home-symphony-board-surface">
        <div className="workspace-home-symphony-board-header">
          <div>
            <div className="workspace-home-symphony-board-title">Kanban</div>
            <div className="workspace-home-section-meta">Queue and live task flow.</div>
          </div>
        </div>

        <div className="workspace-home-symphony-board">
          {COLUMNS.map((column) => {
            const tasks = tasksByStatus.get(column.status) ?? [];
            return (
              <div className="workspace-home-symphony-column" key={column.status}>
                <div className="workspace-home-symphony-column-header">
                  <div className="workspace-home-symphony-column-header-main">
                    <span>{column.label}</span>
                    {column.status === "backlog" ? (
                      <button
                        className="ghost workspace-home-symphony-column-add"
                        type="button"
                        aria-label="Add backlog task"
                        onClick={() => {
                          setShowCreateModal(true);
                        }}
                      >
                        <Plus aria-hidden size={13} />
                      </button>
                    ) : null}
                  </div>
                  <span>{tasks.length}</span>
                </div>
                <div className="workspace-home-symphony-column-body">
                  {tasks.length === 0 ? (
                    <div className="workspace-home-empty">No tasks.</div>
                  ) : null}
                  {tasks.map((task) => (
                    <button
                      className={`workspace-home-symphony-card-button${
                        selectedTaskId === task.id ? " is-selected" : ""
                      }`}
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setDraftTaskId(null);
                        void loadTelemetry(task.id);
                      }}
                    >
                      <div className="workspace-home-symphony-task-title">{task.title}</div>
                      <div className="workspace-home-symphony-task-summary">
                        {buildTaskSummary(task)}
                      </div>
                      <div className="workspace-home-symphony-task-meta">
                        <span>{formatTaskStatusLabel(task.status)}</span>
                        {task.activeRun?.branchName ? <span>{task.activeRun.branchName}</span> : null}
                        {task.activeRun ? <span>{formatTokenCount(task.activeRun.tokenTotal)} tok</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTask ? (
        <div className="workspace-home-symphony-detail">
          <div className="workspace-home-symphony-detail-header">
            <div>
              <div className="workspace-home-symphony-detail-title">Selected task</div>
              <div className="workspace-home-section-meta">
                {selectedTask.title} · Updated {formatRelativeTime(selectedTask.updatedAtMs)}
              </div>
            </div>
            <div className="workspace-home-symphony-detail-actions">
              <div className="workspace-home-symphony-status-actions">
                <label
                  className="workspace-home-section-meta"
                  htmlFor={`workspace-symphony-status-${selectedTask.id}`}
                >
                  Status
                </label>
                <select
                  id={`workspace-symphony-status-${selectedTask.id}`}
                  className="workspace-home-symphony-input workspace-home-symphony-select"
                  value={selectedTask.status}
                  disabled={busyAction?.startsWith(`move:${selectedTask.id}:`) ?? false}
                  onChange={(event) => {
                    const nextStatus = event.target.value as WorkspaceTaskStatus;
                    if (nextStatus !== selectedTask.status) {
                      void moveTask(selectedTask, nextStatus);
                    }
                  }}
                >
                  {COLUMNS.map((column) => (
                    <option key={column.status} value={column.status}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="ghost"
                type="button"
                disabled={busyAction === `delete:${selectedTask.id}`}
                onClick={() => {
                  void handleDeleteTask(selectedTask);
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="workspace-home-symphony-detail-layout">
            <div className="workspace-home-symphony-detail-main">
              <div className="workspace-home-symphony-editor">
                <input
                  className="workspace-home-symphony-input"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="Task title"
                />
                <textarea
                  className="workspace-home-symphony-textarea"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Task description"
                />
                <div className="workspace-home-symphony-editor-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busyAction === `save:${selectedTask.id}`}
                    onClick={() => {
                      void handleSaveTask();
                    }}
                  >
                    Save Task
                  </button>
                </div>
              </div>

              <div className="workspace-home-symphony-task-links">
                {selectedRun?.threadId ? (
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      onSelectInstance(workspace.id, selectedRun.threadId!);
                    }}
                  >
                    Open thread
                  </button>
                ) : null}
                {linkedWorktree ? (
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      void revealItemInDir(linkedWorktree.path);
                    }}
                  >
                    Open worktree
                  </button>
                ) : null}
                {selectedRun?.pullRequestUrl ? (
                  <a
                    className="workspace-home-symphony-link"
                    href={selectedRun.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PR
                  </a>
                ) : null}
              </div>

              <div className="workspace-home-symphony-telemetry-grid">
                <div className="workspace-home-symphony-telemetry-card is-wide">
                  <div className="workspace-home-symphony-telemetry-label">Latest activity</div>
                  <div className="workspace-home-symphony-telemetry-value">{selectedActivity}</div>
                  <div className="workspace-home-symphony-telemetry-meta">
                    {selectedLiveRun?.observedAtMs
                      ? `Observed ${formatRelativeTime(selectedLiveRun.observedAtMs)}`
                      : "Awaiting live update"}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card is-wide">
                  <div className="workspace-home-symphony-telemetry-label">Latest message</div>
                  <div className="workspace-home-symphony-telemetry-value">{selectedMessage}</div>
                  <div className="workspace-home-symphony-telemetry-meta">
                    {selectedRun?.lastMessage ? "From active run" : "Derived from task telemetry"}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Running</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {selectedLiveRun?.ageLabel ??
                      formatDuration(
                        selectedRun?.startedAtMs
                          ? Date.now() - selectedRun.startedAtMs
                          : null,
                      )}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Tokens</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {formatTokenCount(selectedRun?.tokenTotal ?? selectedLiveRun?.tokenTotal)}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Session</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {selectedRun?.sessionId ?? selectedLiveRun?.sessionId ?? "Pending"}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Agent</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {selectedLiveRun?.agentPid ? `PID ${selectedLiveRun.agentPid}` : "Waiting"}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Turn</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {selectedLiveRun?.turnCount ?? "—"}
                  </div>
                </div>
                <div className="workspace-home-symphony-telemetry-card">
                  <div className="workspace-home-symphony-telemetry-label">Claimed</div>
                  <div className="workspace-home-symphony-telemetry-value">
                    {selectedLiveRun?.claimedAtMs
                      ? formatAbsoluteTime(selectedLiveRun.claimedAtMs)
                      : "Not claimed yet"}
                  </div>
                </div>
              </div>
            </div>

            <div className="workspace-home-symphony-timeline-card">
              <div className="workspace-home-section-title">Timeline</div>
              <div className="workspace-home-symphony-timeline">
                {timelineEvents.length === 0 ? (
                  <div className="workspace-home-empty">No telemetry yet.</div>
                ) : null}
                {timelineEvents.map((event) => (
                  <div
                    className={`workspace-home-symphony-timeline-item is-${event.tone}`}
                    key={event.id}
                  >
                    <div className="workspace-home-symphony-timeline-marker" aria-hidden />
                    <div className="workspace-home-symphony-timeline-body">
                      <div className="workspace-home-symphony-timeline-message">
                        {event.message}
                      </div>
                      <div className="workspace-home-symphony-timeline-time">
                        {formatAbsoluteTime(event.createdAtMs)} ·{" "}
                        {formatRelativeTime(event.createdAtMs)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="workspace-home-agent">
        {workflowTruncated ? (
          <div className="workspace-home-agent-warning">
            Showing the first part of a large workflow override.
          </div>
        ) : null}
        <FileEditorCard
          title="WORKFLOW"
          meta={workflowMeta}
          error={workflowError}
          value={workflowContent}
          placeholder="Override the generated Symphony workflow for this workspace…"
          helpText={
            workflowSaving
              ? "Saving workflow override…"
              : workflowDirty
                ? "Unsaved workflow edits. Saving applies them the next time Symphony starts."
                : workflowExists
                  ? "This override is used the next time Symphony starts for this workspace."
                  : "No override saved. The generated default workflow is shown here; saving creates an override."
          }
          disabled={workflowLoading}
          refreshDisabled={workflowRefreshDisabled}
          saveDisabled={workflowSaveDisabled}
          saveLabel={workflowSaveLabel}
          onChange={onWorkflowChange}
          onRefresh={onWorkflowRefresh}
          onSave={onWorkflowSave}
          classNames={{
            container: "workspace-home-agent-card workspace-home-workflow-card",
            header: "workspace-home-section-header",
            title: "workspace-home-section-title",
            actions: "workspace-home-section-actions",
            meta: "workspace-home-section-meta",
            iconButton: "ghost workspace-home-icon-button",
            error: "workspace-home-error",
            textarea: "workspace-home-agent-textarea workspace-home-workflow-textarea",
            help: "workspace-home-section-meta",
          }}
        />
      </div>

      {showCreateModal ? (
        <ModalShell
          className="workspace-home-symphony-create-modal"
          ariaLabel="Create backlog task"
          onBackdropClick={() => {
            setShowCreateModal(false);
          }}
        >
          <div className="workspace-home-symphony-create-modal-content">
            <div className="ds-modal-title">New backlog task</div>
            <div className="ds-modal-subtitle">
              Add a task to Backlog. Move it to Todo when you want Symphony to pick it up.
            </div>
            <label className="ds-modal-label" htmlFor="workspace-symphony-new-title">
              Title
            </label>
            <input
              id="workspace-symphony-new-title"
              className="ds-modal-input"
              type="text"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Task title"
            />
            <label className="ds-modal-label" htmlFor="workspace-symphony-new-description">
              Description
            </label>
            <textarea
              id="workspace-symphony-new-description"
              className="ds-modal-textarea"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Short description"
            />
            <div className="ds-modal-actions">
              <button
                className="ghost ds-modal-button"
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                }}
              >
                Cancel
              </button>
              <button
                className="button ds-modal-button"
                type="button"
                disabled={busyAction === "create" || newTitle.trim().length === 0}
                onClick={() => {
                  void handleCreateTask();
                }}
              >
                Save
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}
