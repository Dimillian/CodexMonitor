import { useCallback, useState } from "react";
import type { WorkspaceInfo } from "../../../types";

type UseBranchSwitcherOptions = {
  activeWorkspace: WorkspaceInfo | null;
  checkoutBranch: (name: string) => Promise<void>;
  setActiveWorkspaceId: (id: string) => void;
};

export type BranchSwitcherState = {
  isOpen: boolean;
} | null;

export function useBranchSwitcher({
  activeWorkspace,
  checkoutBranch,
  setActiveWorkspaceId,
}: UseBranchSwitcherOptions) {
  const [branchSwitcher, setBranchSwitcher] = useState<BranchSwitcherState>(null);

  const openBranchSwitcher = useCallback(() => {
    if (
      !activeWorkspace ||
      !activeWorkspace.connected ||
      activeWorkspace.kind === "worktree"
    ) {
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
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  };
}
