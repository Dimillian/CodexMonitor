import type { RefObject } from "react";
import { useCallback } from "react";
import { useNewAgentShortcut } from "./useNewAgentShortcut";
import type { DebugEntry, WorkspaceInfo } from "../../../types";

type Params = {
  activeWorkspace: WorkspaceInfo | null;
  isCompact: boolean;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (workspaceId: string) => Promise<string | null>;
  setActiveThreadId: (threadId: string | null, workspaceId: string) => void;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  exitDiffView: () => void;
  selectWorkspace: (workspaceId: string) => void;
  openWorktreePrompt: (workspace: WorkspaceInfo) => void;
  openClonePrompt: (workspace: WorkspaceInfo) => void;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  onDebug: (entry: DebugEntry) => void;
};

export function useWorkspaceActions({
  activeWorkspace,
  isCompact,
  addWorkspace,
  connectWorkspace,
  startThreadForWorkspace,
  setActiveThreadId,
  setActiveTab,
  exitDiffView,
  selectWorkspace,
  openWorktreePrompt,
  openClonePrompt,
  composerInputRef,
  onDebug,
}: Params) {
  const handleAddWorkspace = useCallback(async () => {
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        setActiveThreadId(null, workspace.id);
        if (isCompact) {
          setActiveTab("codex");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message,
      });
      alert(`Failed to add workspace.\n\n${message}`);
    }
  }, [addWorkspace, isCompact, onDebug, setActiveTab, setActiveThreadId]);

  const handleAddAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      selectWorkspace(workspace.id);
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      await startThreadForWorkspace(workspace.id);
      if (isCompact) {
        setActiveTab("codex");
      }
      setTimeout(() => composerInputRef.current?.focus(), 0);
    },
    [
      composerInputRef,
      connectWorkspace,
      exitDiffView,
      isCompact,
      selectWorkspace,
      setActiveTab,
      startThreadForWorkspace,
    ],
  );

  const handleAddWorktreeAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openWorktreePrompt(workspace);
    },
    [exitDiffView, openWorktreePrompt],
  );

  const handleAddCloneAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openClonePrompt(workspace);
    },
    [exitDiffView, openClonePrompt],
  );

  useNewAgentShortcut({
    isEnabled: Boolean(activeWorkspace),
    onTrigger: () => {
      if (activeWorkspace) {
        void handleAddAgent(activeWorkspace);
      }
    },
  });

  return {
    handleAddWorkspace,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
  };
}
