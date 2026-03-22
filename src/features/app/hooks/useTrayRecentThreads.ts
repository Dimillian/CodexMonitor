import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";
import { setTrayRecentThreads } from "@services/tauri";
import type { ThreadSummary, TrayRecentThreadEntry, WorkspaceInfo } from "../../../types";

const MAX_RECENT_THREADS = 8;
const SYNC_DEBOUNCE_MS = 150;

type UseTrayRecentThreadsParams = {
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  isSubagentThread: (workspaceId: string, threadId: string) => boolean;
};

type CandidateThread = {
  workspaceId: string;
  workspaceLabel: string;
  threadId: string;
  threadLabel: string;
  updatedAt: number;
};

function buildCandidateThreads(
  workspaces: WorkspaceInfo[],
  threadsByWorkspace: Record<string, ThreadSummary[]>,
  isSubagentThread: (workspaceId: string, threadId: string) => boolean,
): CandidateThread[] {
  const workspaceLabelById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name.trim() || "Workspace"] as const),
  );
  const candidates: CandidateThread[] = [];

  Object.entries(threadsByWorkspace).forEach(([workspaceId, threads]) => {
    const workspaceLabel = workspaceLabelById.get(workspaceId) ?? "Workspace";
    threads.forEach((thread) => {
      const threadId = String(thread.id ?? "").trim();
      if (!threadId || isSubagentThread(workspaceId, threadId)) {
        return;
      }
      candidates.push({
        workspaceId,
        workspaceLabel,
        threadId,
        threadLabel: thread.name?.trim() || "Untitled thread",
        updatedAt: Number(thread.updatedAt ?? 0),
      });
    });
  });

  candidates.sort((left, right) => {
    return (
      right.updatedAt - left.updatedAt ||
      left.threadLabel.localeCompare(right.threadLabel) ||
      left.workspaceLabel.localeCompare(right.workspaceLabel)
    );
  });

  return candidates.slice(0, MAX_RECENT_THREADS);
}

export function buildTrayRecentThreadEntries(
  workspaces: WorkspaceInfo[],
  threadsByWorkspace: Record<string, ThreadSummary[]>,
  isSubagentThread: (workspaceId: string, threadId: string) => boolean,
): TrayRecentThreadEntry[] {
  const candidates = buildCandidateThreads(workspaces, threadsByWorkspace, isSubagentThread);

  return candidates.map((candidate) => ({
    workspaceId: candidate.workspaceId,
    workspaceLabel: candidate.workspaceLabel,
    threadId: candidate.threadId,
    threadLabel: `${candidate.workspaceLabel}: ${candidate.threadLabel}`,
    updatedAt: candidate.updatedAt,
  }));
}

export function useTrayRecentThreads({
  workspaces,
  threadsByWorkspace,
  isSubagentThread,
}: UseTrayRecentThreadsParams) {
  const entries = useMemo(
    () =>
      buildTrayRecentThreadEntries(workspaces, threadsByWorkspace, isSubagentThread),
    [isSubagentThread, threadsByWorkspace, workspaces],
  );
  const serializedEntries = useMemo(() => JSON.stringify(entries), [entries]);
  const syncEntries = useMemo(() => entries, [serializedEntries]);
  const lastSyncedEntriesRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    if (lastSyncedEntriesRef.current === serializedEntries) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleSync = () => {
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void setTrayRecentThreads(syncEntries)
          .then(() => {
            if (cancelled) {
              return;
            }
            lastSyncedEntriesRef.current = serializedEntries;
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
            // Retry until the desktop bridge or tray is ready for the same payload.
            scheduleSync();
          });
      }, SYNC_DEBOUNCE_MS);
    };

    scheduleSync();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [serializedEntries, syncEntries]);
}
