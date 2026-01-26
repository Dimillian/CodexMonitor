import { useCallback } from "react";
import * as Sentry from "@sentry/react";
import type { WorkspaceInfo, WorkspaceSettings } from "../../../types";

type UseWorkspaceSelectionOptions = {
  workspaces: WorkspaceInfo[];
  isCompact: boolean;
  activeWorkspaceId: string | null;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  updateWorkspaceSettings: (
    workspaceId: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<WorkspaceInfo>;
  setCenterMode: (mode: "chat" | "diff") => void;
  setSelectedDiffPath: (path: string | null) => void;
};

type UseWorkspaceSelectionResult = {
  exitDiffView: () => void;
  selectWorkspace: (workspaceId: string) => void;
  selectHome: () => void;
};

export function useWorkspaceSelection({
  workspaces,
  isCompact,
  activeWorkspaceId,
  setActiveTab,
  setActiveWorkspaceId,
  updateWorkspaceSettings,
  setCenterMode,
  setSelectedDiffPath,
}: UseWorkspaceSelectionOptions): UseWorkspaceSelectionResult {
  const exitDiffView = useCallback(() => {
    setCenterMode("chat");
    setSelectedDiffPath(null);
  }, [setCenterMode, setSelectedDiffPath]);

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      setSelectedDiffPath(null);
      const target = workspaces.find((entry) => entry.id === workspaceId);
      const didSwitch = activeWorkspaceId !== workspaceId;
      if (target?.settings.sidebarCollapsed) {
        void updateWorkspaceSettings(workspaceId, {
          sidebarCollapsed: false,
        });
      }
      setActiveWorkspaceId(workspaceId);
      if (didSwitch) {
        Sentry.metrics.count("workspace_switched", 1, {
          attributes: {
            workspace_id: workspaceId,
            workspace_kind: target?.kind ?? "main",
            reason: "select",
          },
        });
      }
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    [
      activeWorkspaceId,
      isCompact,
      setActiveTab,
      setActiveWorkspaceId,
      setSelectedDiffPath,
      updateWorkspaceSettings,
      workspaces,
    ],
  );

  const selectHome = useCallback(() => {
    exitDiffView();
    setSelectedDiffPath(null);
    setActiveWorkspaceId(null);
    if (isCompact) {
      setActiveTab("projects");
    }
  }, [exitDiffView, isCompact, setActiveTab, setActiveWorkspaceId, setSelectedDiffPath]);

  return { exitDiffView, selectWorkspace, selectHome };
}
