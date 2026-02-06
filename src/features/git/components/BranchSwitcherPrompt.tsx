import { useEffect, useMemo, useRef, useState } from "react";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import { BranchList } from "./BranchList";
import { filterBranches } from "../utils/branchSearch";

type BranchSwitcherPromptProps = {
  branches: BranchInfo[];
  workspaces: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  currentBranch: string | null;
  onSelect: (branch: string, worktreeWorkspace: WorkspaceInfo | null) => void;
  onCancel: () => void;
};

function getWorktreeByBranch(
  workspaces: WorkspaceInfo[],
  activeWorkspace: WorkspaceInfo | null,
  branch: string,
): WorkspaceInfo | null {
  const activeRepoWorkspaceId = activeWorkspace
    ? activeWorkspace.kind === "worktree"
      ? activeWorkspace.parentId ?? null
      : activeWorkspace.id
    : null;
  if (!activeRepoWorkspaceId) {
    return null;
  }
  return (
    workspaces.find(
      (ws) =>
        ws.kind === "worktree" &&
        ws.parentId === activeRepoWorkspaceId &&
        ws.worktree?.branch === branch,
    ) ?? null
  );
}

export function BranchSwitcherPrompt({
  branches,
  workspaces,
  activeWorkspace,
  currentBranch,
  onSelect,
  onCancel,
}: BranchSwitcherPromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredBranches = useMemo(() => {
    return filterBranches(branches, query, { mode: "fuzzy" });
  }, [branches, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredBranches.length]);

  useEffect(() => {
    const itemEl = listRef.current?.children[selectedIndex] as
      | HTMLElement
      | undefined;
    itemEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = (branch: BranchInfo) => {
    const worktree = getWorktreeByBranch(workspaces, activeWorkspace, branch.name);
    onSelect(branch.name, worktree);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredBranches.length - 1 ? prev + 1 : prev,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const branch = filteredBranches[selectedIndex];
      if (branch) {
        handleSelect(branch);
      }
      return;
    }
  };

  return (
    <div className="branch-switcher-modal" role="dialog" aria-modal="true">
      <div className="branch-switcher-modal-backdrop" onClick={onCancel} />
      <div className="branch-switcher-modal-card">
        <input
          ref={inputRef}
          className="branch-switcher-modal-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search branches..."
        />
        <BranchList
          branches={filteredBranches}
          currentBranch={currentBranch}
          selectedIndex={selectedIndex}
          listClassName="branch-switcher-modal-list"
          listRef={listRef}
          itemClassName="branch-switcher-modal-item"
          selectedItemClassName="selected"
          itemLabelClassName="branch-switcher-modal-item-name"
          emptyClassName="branch-switcher-modal-empty"
          emptyText="No branches found"
          onSelect={handleSelect}
          onMouseEnter={setSelectedIndex}
          renderMeta={(branch) => {
            const isCurrent = branch.name === currentBranch;
            const worktree = getWorktreeByBranch(
              workspaces,
              activeWorkspace,
              branch.name,
            );
            return (
              <span className="branch-switcher-modal-item-meta">
                {isCurrent && (
                  <span className="branch-switcher-modal-item-current">
                    current
                  </span>
                )}
                {worktree && (
                  <span className="branch-switcher-modal-item-worktree">
                    worktree
                  </span>
                )}
              </span>
            );
          }}
        />
      </div>
    </div>
  );
}
