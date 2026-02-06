import { useEffect, useMemo, useRef, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Copy from "lucide-react/dist/esm/icons/copy";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { BranchInfo, OpenAppTarget, WorkspaceInfo } from "../../../types";
import type { ReactNode } from "react";
import { revealInFileManagerLabel } from "../../../utils/platformPaths";
import { BranchList } from "../../git/components/BranchList";
import { filterBranches, findExactBranch } from "../../git/utils/branchSearch";
import { validateBranchName } from "../../git/utils/branchValidation";
import { OpenAppMenu } from "./OpenAppMenu";
import { LaunchScriptButton } from "./LaunchScriptButton";
import { LaunchScriptEntryButton } from "./LaunchScriptEntryButton";
import type { WorkspaceLaunchScriptsState } from "../hooks/useWorkspaceLaunchScripts";

type MainHeaderProps = {
  workspace: WorkspaceInfo;
  parentName?: string | null;
  worktreeLabel?: string | null;
  disableBranchMenu?: boolean;
  parentPath?: string | null;
  worktreePath?: string | null;
  openTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  branchName: string;
  branches: BranchInfo[];
  onCheckoutBranch: (name: string) => Promise<void> | void;
  onCreateBranch: (name: string) => Promise<void> | void;
  canCopyThread?: boolean;
  onCopyThread?: () => void | Promise<void>;
  onToggleTerminal: () => void;
  isTerminalOpen: boolean;
  showTerminalButton?: boolean;
  extraActionsNode?: ReactNode;
  launchScript?: string | null;
  launchScriptEditorOpen?: boolean;
  launchScriptDraft?: string;
  launchScriptSaving?: boolean;
  launchScriptError?: string | null;
  onRunLaunchScript?: () => void;
  onOpenLaunchScriptEditor?: () => void;
  onCloseLaunchScriptEditor?: () => void;
  onLaunchScriptDraftChange?: (value: string) => void;
  onSaveLaunchScript?: () => void;
  launchScriptsState?: WorkspaceLaunchScriptsState;
  worktreeRename?: {
    name: string;
    error: string | null;
    notice: string | null;
    isSubmitting: boolean;
    isDirty: boolean;
    upstream?: {
      oldBranch: string;
      newBranch: string;
      error: string | null;
      isSubmitting: boolean;
      onConfirm: () => void;
    } | null;
    onFocus: () => void;
    onChange: (value: string) => void;
    onCancel: () => void;
    onCommit: () => void;
  };
};

export function MainHeader({
  workspace,
  parentName = null,
  worktreeLabel = null,
  disableBranchMenu = false,
  parentPath = null,
  worktreePath = null,
  openTargets,
  openAppIconById,
  selectedOpenAppId,
  onSelectOpenAppId,
  branchName,
  branches,
  onCheckoutBranch,
  onCreateBranch,
  canCopyThread = false,
  onCopyThread,
  onToggleTerminal,
  isTerminalOpen,
  showTerminalButton = true,
  extraActionsNode,
  launchScript = null,
  launchScriptEditorOpen = false,
  launchScriptDraft = "",
  launchScriptSaving = false,
  launchScriptError = null,
  onRunLaunchScript,
  onOpenLaunchScriptEditor,
  onCloseLaunchScriptEditor,
  onLaunchScriptDraftChange,
  onSaveLaunchScript,
  launchScriptsState,
  worktreeRename,
}: MainHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameConfirmRef = useRef<HTMLButtonElement | null>(null);
  const renameOnCancel = worktreeRename?.onCancel;

  const trimmedQuery = branchQuery.trim();
  const filteredBranches = useMemo(
    () => filterBranches(branches, branchQuery, { mode: "includes", whenEmptyLimit: 12 }),
    [branches, branchQuery],
  );
  const exactMatch = useMemo(
    () => findExactBranch(branches, trimmedQuery),
    [branches, trimmedQuery],
  );
  const canCreate = trimmedQuery.length > 0 && !exactMatch;
  const branchValidationMessage = useMemo(
    () => validateBranchName(trimmedQuery),
    [trimmedQuery],
  );
  const resolvedWorktreePath = worktreePath ?? workspace.path;
  const relativeWorktreePath = useMemo(() => {
    if (!parentPath) {
      return resolvedWorktreePath;
    }
    return resolvedWorktreePath.startsWith(`${parentPath}/`)
      ? resolvedWorktreePath.slice(parentPath.length + 1)
      : resolvedWorktreePath;
  }, [parentPath, resolvedWorktreePath]);
  const cdCommand = useMemo(
    () => `cd "${relativeWorktreePath}"`,
    [relativeWorktreePath],
  );

  useEffect(() => {
    if (!menuOpen && !infoOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuContains = menuRef.current?.contains(target) ?? false;
      const infoContains = infoRef.current?.contains(target) ?? false;
      if (!menuContains && !infoContains) {
        setMenuOpen(false);
        setInfoOpen(false);
        setBranchQuery("");
        setError(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [infoOpen, menuOpen]);

  useEffect(() => {
    if (!infoOpen && renameOnCancel) {
      renameOnCancel();
    }
  }, [infoOpen, renameOnCancel]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyClick = async () => {
    if (!onCopyThread) {
      return;
    }
    try {
      await onCopyThread();
      setCopyFeedback(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopyFeedback(false);
      }, 1200);
    } catch {
      // Errors are handled upstream in the copy handler.
    }
  };

  return (
    <header className="main-header" data-tauri-drag-region>
      <div className="workspace-header">
        <div className="workspace-title-line">
          <span className="workspace-title">
            {parentName ? parentName : workspace.name}
          </span>
          <span className="workspace-separator" aria-hidden>
            ›
          </span>
          {disableBranchMenu ? (
            <div className="workspace-branch-static-row" ref={infoRef}>
              <button
                type="button"
                className="workspace-branch-static-button"
                onClick={() => setInfoOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={infoOpen}
                data-tauri-drag-region="false"
                title="Worktree info"
              >
                {worktreeLabel || branchName}
              </button>
              {infoOpen && (
                <div className="worktree-info-popover popover-surface" role="dialog">
                  {worktreeRename && (
                    <div className="worktree-info-rename">
                      <span className="worktree-info-label">Name</span>
                      <div className="worktree-info-command">
                        <input
                          ref={renameInputRef}
                          className="worktree-info-input"
                          value={worktreeRename.name}
                          onFocus={() => {
                            worktreeRename.onFocus();
                            renameInputRef.current?.select();
                          }}
                          onChange={(event) => worktreeRename.onChange(event.target.value)}
                          onBlur={(event) => {
                            const nextTarget = event.relatedTarget as Node | null;
                            if (
                              renameConfirmRef.current &&
                              nextTarget &&
                              renameConfirmRef.current.contains(nextTarget)
                            ) {
                              return;
                            }
                            if (!worktreeRename.isSubmitting && worktreeRename.isDirty) {
                              worktreeRename.onCommit();
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              if (!worktreeRename.isSubmitting) {
                                worktreeRename.onCancel();
                              }
                            }
                            if (event.key === "Enter" && !worktreeRename.isSubmitting) {
                              event.preventDefault();
                              worktreeRename.onCommit();
                            }
                          }}
                          data-tauri-drag-region="false"
                          disabled={worktreeRename.isSubmitting}
                        />
                        <button
                          type="button"
                          className="icon-button worktree-info-confirm"
                          ref={renameConfirmRef}
                          onClick={() => worktreeRename.onCommit()}
                          disabled={
                            worktreeRename.isSubmitting || !worktreeRename.isDirty
                          }
                          aria-label="Confirm rename"
                          title="Confirm rename"
                        >
                          <Check aria-hidden />
                        </button>
                      </div>
                      {worktreeRename.error && (
                        <div className="worktree-info-error">{worktreeRename.error}</div>
                      )}
                      {worktreeRename.notice && (
                        <span className="worktree-info-subtle">
                          {worktreeRename.notice}
                        </span>
                      )}
                      {worktreeRename.upstream && (
                        <div className="worktree-info-upstream">
                          <span className="worktree-info-subtle">
                            Do you want to update the upstream branch to{" "}
                            <strong>{worktreeRename.upstream.newBranch}</strong>?
                          </span>
                          <button
                            type="button"
                            className="ghost worktree-info-upstream-button"
                            onClick={worktreeRename.upstream.onConfirm}
                            disabled={worktreeRename.upstream.isSubmitting}
                          >
                            Update upstream
                          </button>
                          {worktreeRename.upstream.error && (
                            <div className="worktree-info-error">
                              {worktreeRename.upstream.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="worktree-info-title">Worktree</div>
                  <div className="worktree-info-row">
                    <span className="worktree-info-label">
                      Terminal{parentPath ? " (repo root)" : ""}
                    </span>
                    <div className="worktree-info-command">
                      <code className="worktree-info-code">
                        {cdCommand}
                      </code>
                      <button
                        type="button"
                        className="worktree-info-copy"
                        onClick={async () => {
                          await navigator.clipboard.writeText(cdCommand);
                        }}
                        data-tauri-drag-region="false"
                        aria-label="Copy command"
                        title="Copy command"
                      >
                        <Copy aria-hidden />
                      </button>
                    </div>
                    <span className="worktree-info-subtle">
                      Open this worktree in your terminal.
                    </span>
                  </div>
                  <div className="worktree-info-row">
                    <span className="worktree-info-label">Reveal</span>
                    <button
                      type="button"
                      className="worktree-info-reveal"
                      onClick={async () => {
                        await revealItemInDir(resolvedWorktreePath);
                      }}
                      data-tauri-drag-region="false"
                    >
                      {revealInFileManagerLabel()}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-branch-menu" ref={menuRef}>
              <button
                type="button"
                className="workspace-branch-button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                data-tauri-drag-region="false"
              >
                <span className="workspace-branch">{branchName}</span>
                <span className="workspace-branch-caret" aria-hidden>
                  ›
                </span>
              </button>
              {menuOpen && (
                <div
                  className="workspace-branch-dropdown popover-surface"
                  role="menu"
                  data-tauri-drag-region="false"
                >
                  <div className="branch-actions">
                    <div className="branch-search">
                      <input
                        value={branchQuery}
                        onChange={(event) => {
                          setBranchQuery(event.target.value);
                          setError(null);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key !== "Enter") {
                            return;
                          }
                          event.preventDefault();
                          if (branchValidationMessage) {
                            setError(branchValidationMessage);
                            return;
                          }
                          if (canCreate) {
                            try {
                              await onCreateBranch(trimmedQuery);
                              setMenuOpen(false);
                              setBranchQuery("");
                              setError(null);
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            }
                            return;
                          }
                          if (exactMatch && exactMatch.name !== branchName) {
                            try {
                              await onCheckoutBranch(exactMatch.name);
                              setMenuOpen(false);
                              setBranchQuery("");
                              setError(null);
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            }
                          }
                        }}
                        placeholder="Search or create branch"
                        className="branch-input"
                        autoFocus
                        data-tauri-drag-region="false"
                        aria-label="Search branches"
                      />
                      <button
                        type="button"
                        className="branch-create-button"
                        disabled={!canCreate || Boolean(branchValidationMessage)}
                        onClick={async () => {
                          if (branchValidationMessage) {
                            setError(branchValidationMessage);
                            return;
                          }
                          if (!canCreate) {
                            return;
                          }
                          try {
                            await onCreateBranch(trimmedQuery);
                            setMenuOpen(false);
                            setBranchQuery("");
                            setError(null);
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          }
                        }}
                        data-tauri-drag-region="false"
                      >
                        Create
                      </button>
                    </div>
                    {branchValidationMessage && (
                      <div className="branch-error">{branchValidationMessage}</div>
                    )}
                    {canCreate && !branchValidationMessage && (
                      <div className="branch-create-hint">
                        Create branch “{trimmedQuery}”
                      </div>
                    )}
                  </div>
                  <BranchList
                    branches={filteredBranches}
                    currentBranch={branchName}
                    listClassName="branch-list"
                    listRole="none"
                    itemClassName="branch-item"
                    currentItemClassName="is-active"
                    itemRole="menuitem"
                    itemDataTauriDragRegion="false"
                    emptyClassName="branch-empty"
                    emptyText="No branches found"
                    onSelect={async (branch) => {
                      if (branch.name === branchName) {
                        return;
                      }
                      try {
                        await onCheckoutBranch(branch.name);
                        setMenuOpen(false);
                        setBranchQuery("");
                        setError(null);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  />
                  {error && <div className="branch-error">{error}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="main-header-actions">
        {onRunLaunchScript &&
          onOpenLaunchScriptEditor &&
          onCloseLaunchScriptEditor &&
          onLaunchScriptDraftChange &&
          onSaveLaunchScript && (
            <div className="launch-script-cluster">
              <LaunchScriptButton
                launchScript={launchScript}
                editorOpen={launchScriptEditorOpen}
                draftScript={launchScriptDraft}
                isSaving={launchScriptSaving}
                error={launchScriptError}
                onRun={onRunLaunchScript}
                onOpenEditor={onOpenLaunchScriptEditor}
                onCloseEditor={onCloseLaunchScriptEditor}
                onDraftChange={onLaunchScriptDraftChange}
                onSave={onSaveLaunchScript}
                showNew={Boolean(launchScriptsState)}
                newEditorOpen={launchScriptsState?.newEditorOpen}
                newDraftScript={launchScriptsState?.newDraftScript}
                newDraftIcon={launchScriptsState?.newDraftIcon}
                newDraftLabel={launchScriptsState?.newDraftLabel}
                newError={launchScriptsState?.newError ?? null}
                onOpenNew={launchScriptsState?.onOpenNew}
                onCloseNew={launchScriptsState?.onCloseNew}
                onNewDraftChange={launchScriptsState?.onNewDraftScriptChange}
                onNewDraftIconChange={launchScriptsState?.onNewDraftIconChange}
                onNewDraftLabelChange={launchScriptsState?.onNewDraftLabelChange}
                onCreateNew={launchScriptsState?.onCreateNew}
              />
              {launchScriptsState?.launchScripts.map((entry) => (
                <LaunchScriptEntryButton
                  key={entry.id}
                  entry={entry}
                  editorOpen={launchScriptsState.editorOpenId === entry.id}
                  draftScript={launchScriptsState.draftScript}
                  draftIcon={launchScriptsState.draftIcon}
                  draftLabel={launchScriptsState.draftLabel}
                  isSaving={launchScriptsState.isSaving}
                  error={launchScriptsState.errorById[entry.id] ?? null}
                  onRun={() => launchScriptsState.onRunScript(entry.id)}
                  onOpenEditor={() => launchScriptsState.onOpenEditor(entry.id)}
                  onCloseEditor={launchScriptsState.onCloseEditor}
                  onDraftChange={launchScriptsState.onDraftScriptChange}
                  onDraftIconChange={launchScriptsState.onDraftIconChange}
                  onDraftLabelChange={launchScriptsState.onDraftLabelChange}
                  onSave={launchScriptsState.onSaveScript}
                  onDelete={launchScriptsState.onDeleteScript}
                />
              ))}
            </div>
          )}
        <OpenAppMenu
          path={resolvedWorktreePath}
          openTargets={openTargets}
          selectedOpenAppId={selectedOpenAppId}
          onSelectOpenAppId={onSelectOpenAppId}
          iconById={openAppIconById}
        />
        {showTerminalButton && (
          <button
            type="button"
            className={`ghost main-header-action${isTerminalOpen ? " is-active" : ""}`}
            onClick={onToggleTerminal}
            data-tauri-drag-region="false"
            aria-label="Toggle terminal panel"
            title="Terminal"
          >
            <Terminal size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={`ghost main-header-action${copyFeedback ? " is-copied" : ""}`}
          onClick={handleCopyClick}
          disabled={!canCopyThread || !onCopyThread}
          data-tauri-drag-region="false"
          aria-label="Copy thread"
          title="Copy thread"
        >
          <span className="main-header-icon" aria-hidden>
            <Copy className="main-header-icon-copy" size={14} />
            <Check className="main-header-icon-check" size={14} />
          </span>
        </button>
        {extraActionsNode}
      </div>
    </header>
  );
}
