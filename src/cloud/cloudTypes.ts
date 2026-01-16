import type {
  ConversationItem,
  ThreadSummary,
  WorkspaceInfo,
} from "../types";

export type CloudScopeKey = string;

export function globalScopeKey(): CloudScopeKey {
  return "g";
}

export function workspaceScopeKey(workspaceId: string): CloudScopeKey {
  return `ws/${workspaceId}`;
}

export function threadScopeKey(workspaceId: string, threadId: string): CloudScopeKey {
  return `th/${workspaceId}/${threadId}`;
}

export type CloudSnapshotEnvelope<T> = {
  v: 1;
  ts: number;
  runnerId: string;
  scopeKey: CloudScopeKey;
  payload: T;
};

export type CloudThreadStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
};

export type CloudGlobalSnapshot = CloudSnapshotEnvelope<{
  workspaces: WorkspaceInfo[];
}>;

export type CloudWorkspaceSnapshot = CloudSnapshotEnvelope<{
  workspaceId: string;
  threads: ThreadSummary[];
  threadStatusById: Record<string, CloudThreadStatus>;
}>;

export type CloudThreadSnapshot = CloudSnapshotEnvelope<{
  workspaceId: string;
  threadId: string;
  // Desktop runner may publish pre-rendered items. The backend publisher can instead
  // publish the raw thread record and let the iOS client rebuild items.
  items?: ConversationItem[] | null;
  thread?: Record<string, unknown> | null;
  status: CloudThreadStatus | null;
}>;

export function parseCloudSnapshot<T>(payloadJson: string): CloudSnapshotEnvelope<T> | null {
  try {
    const parsed = JSON.parse(payloadJson) as CloudSnapshotEnvelope<T>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if ((parsed as any).v !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
