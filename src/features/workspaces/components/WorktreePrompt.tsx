import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import type { BranchInfo } from "../../../types";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { BranchList } from "../../git/components/BranchList";
import { filterBranches } from "../../git/utils/branchSearch";

type WorktreePromptProps = {
  workspaceName: string;
  name: string;
  branch: string;
  branchWasEdited?: boolean;
  branchSuggestions?: BranchInfo[];
  copyAgentsMd: boolean;
  setupScript: string;
  scriptError?: string | null;
  error?: string | null;
  onNameChange: (value: string) => void;
  onChange: (value: string) => void;
  onCopyAgentsMdChange: (value: boolean) => void;
  onSetupScriptChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
  isSavingScript?: boolean;
};

export function WorktreePrompt({
  workspaceName,
  name,
  branch,
  branchWasEdited = false,
  branchSuggestions = [],
  copyAgentsMd,
  setupScript,
  scriptError = null,
  error = null,
  onNameChange,
  onChange,
  onCopyAgentsMdChange,
  onSetupScriptChange,
  onCancel,
  onConfirm,
  isBusy = false,
  isSavingScript = false,
}: WorktreePromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const branchContainerRef = useRef<HTMLDivElement | null>(null);
  const branchListRef = useRef<HTMLDivElement | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [selectedBranchIndex, setSelectedBranchIndex] = useState(0);
  const [didNavigateBranches, setDidNavigateBranches] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const filteredBranches = useMemo(() => {
    const query = !branchWasEdited && branchMenuOpen ? "" : branch;
    return filterBranches(branchSuggestions, query, { mode: "fuzzy", whenEmptyLimit: 8 });
  }, [branch, branchMenuOpen, branchSuggestions, branchWasEdited]);

  useEffect(() => {
    if (!branchMenuOpen) {
      return;
    }
    setDidNavigateBranches(false);
    setSelectedBranchIndex(0);
  }, [branchMenuOpen, filteredBranches.length]);

  useEffect(() => {
    if (!branchMenuOpen) {
      return;
    }
    const itemEl = branchListRef.current?.children[selectedBranchIndex] as
      | HTMLElement
      | undefined;
    itemEl?.scrollIntoView({ block: "nearest" });
  }, [branchMenuOpen, selectedBranchIndex]);

  const handleBranchSelect = (branchInfo: BranchInfo) => {
    onChange(branchInfo.name);
    setBranchMenuOpen(false);
    requestAnimationFrame(() => {
      const input = branchContainerRef.current?.querySelector(
        "input",
      ) as HTMLInputElement | null;
      input?.focus();
    });
  };

  const handleBranchContainerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (!nextFocus) {
      setBranchMenuOpen(false);
      return;
    }
    if (event.currentTarget.contains(nextFocus)) {
      return;
    }
    setBranchMenuOpen(false);
  };

  return (
    <ModalShell
      className="worktree-modal"
      ariaLabel="新建工作树对话"
      onBackdropClick={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="ds-modal-title worktree-modal-title">新建工作树对话</div>
      <div className="ds-modal-subtitle worktree-modal-subtitle">
        在 "{workspaceName}" 下创建工作树。
      </div>
      <label className="ds-modal-label worktree-modal-label" htmlFor="worktree-name">
        名称
      </label>
      <input
        id="worktree-name"
        ref={inputRef}
        className="ds-modal-input worktree-modal-input"
        value={name}
        placeholder="（可选）"
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!isBusy) {
              onCancel();
            }
          }
          if (event.key === "Enter" && !isBusy) {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      <label className="ds-modal-label worktree-modal-label" htmlFor="worktree-branch">
        分支名称
      </label>
      <div
        className="worktree-modal-branch"
        ref={branchContainerRef}
        onFocusCapture={() => setBranchMenuOpen(true)}
        onBlurCapture={handleBranchContainerBlur}
      >
        <input
          id="worktree-branch"
          className="ds-modal-input worktree-modal-input"
          value={branch}
          onChange={(event) => {
            setDidNavigateBranches(false);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (!isBusy) {
                onCancel();
              }
              return;
            }

            if (!branchMenuOpen || filteredBranches.length === 0) {
              if (event.key === "Enter" && !isBusy) {
                event.preventDefault();
                onConfirm();
              }
              if (event.key === "ArrowDown") {
                setBranchMenuOpen(true);
              }
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setDidNavigateBranches(true);
              setSelectedBranchIndex((prev) =>
                prev < filteredBranches.length - 1 ? prev + 1 : prev,
              );
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setDidNavigateBranches(true);
              setSelectedBranchIndex((prev) => (prev > 0 ? prev - 1 : prev));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (didNavigateBranches) {
                const picked = filteredBranches[selectedBranchIndex];
                if (picked) {
                  handleBranchSelect(picked);
                  return;
                }
              }
              if (!isBusy) {
                onConfirm();
              }
            }
          }}
        />
        {branchMenuOpen && (
          <BranchList
            branches={filteredBranches}
            currentBranch={null}
            selectedIndex={selectedBranchIndex}
            listClassName="worktree-modal-branch-list"
            listRef={branchListRef}
            itemClassName="worktree-modal-branch-item"
            itemLabelClassName="worktree-modal-branch-item-name"
            selectedItemClassName="selected"
            emptyClassName="worktree-modal-branch-empty"
            emptyText={
              branch.trim().length > 0 ? "没有匹配的分支" : "未找到分支"
            }
            onMouseEnter={(index) => {
              setDidNavigateBranches(true);
              setSelectedBranchIndex(index);
            }}
            onSelect={handleBranchSelect}
          />
        )}
      </div>
      <div className="worktree-modal-checkbox-row">
        <input
          id="worktree-copy-agents"
          type="checkbox"
          className="worktree-modal-checkbox-input"
          checked={copyAgentsMd}
          disabled={isBusy}
          onChange={(event) => onCopyAgentsMdChange(event.target.checked)}
        />
        <label className="worktree-modal-checkbox-label" htmlFor="worktree-copy-agents">
          复制 <code>AGENTS.md</code> 到工作树
        </label>
      </div>
      <div className="ds-modal-divider worktree-modal-divider" />
      <div className="worktree-modal-section-title">环境设置脚本</div>
      <div className="worktree-modal-hint">
        存储在项目中（设置 → 环境），每次创建新工作树后在专用终端中运行一次。
      </div>
      <textarea
        id="worktree-setup-script"
        className="ds-modal-textarea worktree-modal-textarea"
        value={setupScript}
        onChange={(event) => onSetupScriptChange(event.target.value)}
        placeholder="pnpm install"
        rows={4}
        disabled={isBusy || isSavingScript}
      />
      {scriptError && <div className="ds-modal-error worktree-modal-error">{scriptError}</div>}
      {error && <div className="ds-modal-error worktree-modal-error">{error}</div>}
      <div className="ds-modal-actions worktree-modal-actions">
        <button
          className="ghost ds-modal-button worktree-modal-button"
          onClick={onCancel}
          type="button"
          disabled={isBusy}
        >
          取消
        </button>
        <button
          className="primary ds-modal-button worktree-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={isBusy || branch.trim().length === 0}
        >
          创建
        </button>
      </div>
    </ModalShell>
  );
}
