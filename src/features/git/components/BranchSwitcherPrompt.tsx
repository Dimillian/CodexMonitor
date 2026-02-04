import { useEffect, useMemo, useRef, useState } from "react";
import type { BranchInfo, WorkspaceInfo } from "../../../types";

type BranchSwitcherPromptProps = {
  branches: BranchInfo[];
  workspaces: WorkspaceInfo[];
  currentBranch: string | null;
  onSelect: (branch: string, worktreeWorkspace: WorkspaceInfo | null) => void;
  onCancel: () => void;
};

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

function getWorktreeByBranch(
  workspaces: WorkspaceInfo[],
  branch: string,
): WorkspaceInfo | null {
  return (
    workspaces.find(
      (ws) => ws.kind === "worktree" && ws.worktree?.branch === branch,
    ) ?? null
  );
}

export function BranchSwitcherPrompt({
  branches,
  workspaces,
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
    if (!query.trim()) {
      return branches;
    }
    return branches.filter((branch) => fuzzyMatch(query.trim(), branch.name));
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
    const worktree = getWorktreeByBranch(workspaces, branch.name);
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
        <div className="branch-switcher-modal-list" ref={listRef}>
          {filteredBranches.length === 0 && (
            <div className="branch-switcher-modal-empty">No branches found</div>
          )}
          {filteredBranches.map((branch, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = branch.name === currentBranch;
            const worktree = getWorktreeByBranch(workspaces, branch.name);
            return (
              <button
                key={branch.name}
                type="button"
                className={`branch-switcher-modal-item${isSelected ? " selected" : ""}`}
                onClick={() => handleSelect(branch)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="branch-switcher-modal-item-name">
                  {branch.name}
                </span>
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
