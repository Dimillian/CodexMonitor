export type ThreadStatusFlags = {
  isProcessing?: boolean;
  hasUnread?: boolean;
  isReviewing?: boolean;
};

export type ThreadStatusById = Record<string, ThreadStatusFlags>;

export type ThreadStatusClass = "processing" | "reviewing" | "unread" | "ready";

export function getThreadStatusClass(
  status: ThreadStatusFlags | undefined,
  hasPendingUserInput: boolean,
): ThreadStatusClass {
  if (hasPendingUserInput) {
    return "unread";
  }
  if (status?.isReviewing) {
    return "reviewing";
  }
  if (status?.isProcessing) {
    return "processing";
  }
  if (status?.hasUnread) {
    return "unread";
  }
  return "ready";
}

type WorkspaceHomeThreadState = {
  statusLabel: "workspaces:statusRunning" | "workspaces:statusReviewing" | "workspaces:statusIdle";
  stateClass: "is-running" | "is-reviewing" | "is-idle";
  isRunning: boolean;
};

export function getWorkspaceHomeThreadState(
  status: ThreadStatusFlags | undefined,
): WorkspaceHomeThreadState {
  if (status?.isProcessing) {
    return { statusLabel: "workspaces:statusRunning", stateClass: "is-running", isRunning: true };
  }
  if (status?.isReviewing) {
    return { statusLabel: "workspaces:statusReviewing", stateClass: "is-reviewing", isRunning: false };
  }
  return { statusLabel: "workspaces:statusIdle", stateClass: "is-idle", isRunning: false };
}
