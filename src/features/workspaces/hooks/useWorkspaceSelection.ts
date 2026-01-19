import { useCallback } from "react";
import type { WorkspaceInfo, WorkspaceSettings } from "../../../types";

type UseWorkspaceSelectionOptions = {
  workspaces: WorkspaceInfo[];
  isCompact: boolean;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  updateWorkspaceSettings: (
    workspaceId: string,
    settings: WorkspaceSettings,
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
      if (target?.settings.sidebarCollapsed) {
        void updateWorkspaceSettings(workspaceId, {
          ...target.settings,
          sidebarCollapsed: false,
        });
      }
      setActiveWorkspaceId(workspaceId);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    [
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
