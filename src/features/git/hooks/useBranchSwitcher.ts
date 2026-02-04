import { useCallback, useState } from "react";
import type { BranchInfo, WorkspaceInfo } from "../../../types";

type UseBranchSwitcherOptions = {
  activeWorkspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  branches: BranchInfo[];
  currentBranch: string | null;
  checkoutBranch: (name: string) => Promise<void>;
  setActiveWorkspaceId: (id: string) => void;
};

export type BranchSwitcherState = {
  isOpen: boolean;
} | null;

export function useBranchSwitcher({
  activeWorkspace,
  workspaces,
  branches,
  currentBranch,
  checkoutBranch,
  setActiveWorkspaceId,
}: UseBranchSwitcherOptions) {
  const [branchSwitcher, setBranchSwitcher] = useState<BranchSwitcherState>(null);

  const openBranchSwitcher = useCallback(() => {
    if (!activeWorkspace) {
      return;
    }
    setBranchSwitcher({ isOpen: true });
  }, [activeWorkspace]);

  const closeBranchSwitcher = useCallback(() => {
    setBranchSwitcher(null);
  }, []);

  const handleBranchSelect = useCallback(
    async (branchName: string, worktreeWorkspace: WorkspaceInfo | null) => {
      closeBranchSwitcher();
      if (worktreeWorkspace) {
        setActiveWorkspaceId(worktreeWorkspace.id);
      } else {
        await checkoutBranch(branchName);
      }
    },
    [checkoutBranch, closeBranchSwitcher, setActiveWorkspaceId],
  );

  return {
    branchSwitcher,
    branches,
    workspaces,
    currentBranch,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  };
}
