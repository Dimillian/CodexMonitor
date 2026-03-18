import { useCallback, useEffect, useState } from "react";
import type { WorkspaceInfo, WorkspaceSymphonyEvent, WorkspaceSymphonyStatus } from "@/types";
import { subscribeWorkspaceSymphonyEvents } from "@services/events";
import { getWorkspaceSymphonyStatus } from "@services/tauri";
import { useTauriEvent } from "@app/hooks/useTauriEvent";

type WorkspaceSymphonyStatusMap = Record<string, WorkspaceSymphonyStatus>;

export function useWorkspaceSymphonyStatuses(workspaces: WorkspaceInfo[]) {
  const [statusByWorkspace, setStatusByWorkspace] = useState<WorkspaceSymphonyStatusMap>({});

  const refreshWorkspaceStatus = useCallback(async (workspaceId: string) => {
    try {
      const snapshot = await getWorkspaceSymphonyStatus(workspaceId);
      setStatusByWorkspace((prev) => {
        if (snapshot.status.state !== "running") {
          if (!(workspaceId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[workspaceId];
          return next;
        }
        return {
          ...prev,
          [workspaceId]: snapshot.status,
        };
      });
    } catch {
      setStatusByWorkspace((prev) => {
        if (!(workspaceId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const workspaceIds = workspaces
      .filter((workspace) => (workspace.kind ?? "main") !== "worktree")
      .map((workspace) => workspace.id);

    if (workspaceIds.length === 0) {
      setStatusByWorkspace({});
      return;
    }

    void Promise.all(
      workspaceIds.map(async (workspaceId) => {
        try {
          const snapshot = await getWorkspaceSymphonyStatus(workspaceId);
          return snapshot.status.state === "running"
            ? ([workspaceId, snapshot.status] as const)
            : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setStatusByWorkspace(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, WorkspaceSymphonyStatus] => Boolean(entry))),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  useTauriEvent(
    subscribeWorkspaceSymphonyEvents,
    (event: WorkspaceSymphonyEvent) => {
      void refreshWorkspaceStatus(event.workspaceId);
    },
    { enabled: workspaces.length > 0 },
  );

  return statusByWorkspace;
}
