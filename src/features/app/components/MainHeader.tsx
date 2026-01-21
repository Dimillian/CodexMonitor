import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { openWorkspaceIn } from "../../../services/tauri";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import type { ReactNode } from "react";
import { OPEN_APP_STORAGE_KEY, type OpenAppId } from "../constants";
import { getStoredOpenAppId } from "../utils/openApp";
import cursorIcon from "../../../assets/app-icons/cursor.png";
import finderIcon from "../../../assets/app-icons/finder.png";
import antigravityIcon from "../../../assets/app-icons/antigravity.png";
import ghosttyIcon from "../../../assets/app-icons/ghostty.png";
import vscodeIcon from "../../../assets/app-icons/vscode.png";
import zedIcon from "../../../assets/app-icons/zed.png";

type MainHeaderProps = {
  workspace: WorkspaceInfo;
  parentName?: string | null;
  worktreeLabel?: string | null;
  disableBranchMenu?: boolean;
  parentPath?: string | null;
  worktreePath?: string | null;
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

type OpenTarget = {
  id: OpenAppId;
  label: string;
  icon: string;
  open: (path: string) => Promise<void>;
};

export function MainHeader({
  workspace,
  parentName = null,
  worktreeLabel = null,
  disableBranchMenu = false,
  parentPath = null,
  worktreePath = null,
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
  worktreeRename,
}: MainHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameConfirmRef = useRef<HTMLButtonElement | null>(null);
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const renameOnCancel = worktreeRename?.onCancel;
  const [openAppId, setOpenAppId] = useState<OpenTarget["id"]>(() => (
    getStoredOpenAppId()
  ));

  const recentBranches = branches.slice(0, 12);
  const resolvedWorktreePath = worktreePath ?? workspace.path;
  const relativeWorktreePath =
    parentPath && resolvedWorktreePath.startsWith(`${parentPath}/`)
      ? resolvedWorktreePath.slice(parentPath.length + 1)
      : resolvedWorktreePath;
  const cdCommand = `cd "${relativeWorktreePath}"`;
  const openTargets: OpenTarget[] = [
    {
      id: "vscode",
      label: "VS Code",
      icon: vscodeIcon,
      open: async (path) => openWorkspaceIn(path, "Visual Studio Code"),
    },
    {
      id: "cursor",
      label: "Cursor",
      icon: cursorIcon,
      open: async (path) => openWorkspaceIn(path, "Cursor"),
    },
    {
      id: "zed",
      label: "Zed",
      icon: zedIcon,
      open: async (path) => openWorkspaceIn(path, "Zed"),
    },
    {
      id: "ghostty",
      label: "Ghostty",
      icon: ghosttyIcon,
      open: async (path) => openWorkspaceIn(path, "Ghostty"),
    },
    {
      id: "antigravity",
      label: "Antigravity",
      icon: antigravityIcon,
      open: async (path) => openWorkspaceIn(path, "Antigravity"),
    },
    {
      id: "finder",
      label: "Finder",
      icon: finderIcon,
      open: async (path) => revealItemInDir(path),
    },
  ];
  const selectedOpenTarget =
    openTargets.find((target) => target.id === openAppId) ?? openTargets[0];

  useEffect(() => {
    if (!menuOpen && !infoOpen && !openMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuContains = menuRef.current?.contains(target) ?? false;
      const infoContains = infoRef.current?.contains(target) ?? false;
      const openContains = openMenuRef.current?.contains(target) ?? false;
      if (!menuContains && !infoContains && !openContains) {
        setMenuOpen(false);
        setInfoOpen(false);
        setOpenMenuOpen(false);
        setIsCreating(false);
        setNewBranch("");
        setError(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [infoOpen, menuOpen, openMenuOpen]);

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

  const handleOpenWorkspace = async () => {
    await selectedOpenTarget.open(resolvedWorktreePath);
  };

  const handleSelectOpenTarget = async (target: OpenTarget) => {
    setOpenAppId(target.id);
    window.localStorage.setItem(OPEN_APP_STORAGE_KEY, target.id);
    setOpenMenuOpen(false);
    await target.open(resolvedWorktreePath);
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
                      Reveal in Finder
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
                    {!isCreating ? (
                      <button
                        type="button"
                        className="branch-action"
                        onClick={() => setIsCreating(true)}
                        data-tauri-drag-region="false"
                      >
                        <span className="branch-action-icon">+</span>
                        Create branch
                      </button>
                    ) : (
                      <div className="branch-create">
                        <input
                          value={newBranch}
                          onChange={(event) => setNewBranch(event.target.value)}
                          placeholder="new-branch-name"
                          className="branch-input"
                          autoFocus
                          data-tauri-drag-region="false"
                        />
                        <button
                          type="button"
                          className="branch-create-button"
                          onClick={async () => {
                            const name = newBranch.trim();
                            if (!name) {
                              return;
                            }
                            try {
                              await onCreateBranch(name);
                              setMenuOpen(false);
                              setIsCreating(false);
                              setNewBranch("");
                              setError(null);
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : String(err),
                              );
                            }
                          }}
                          data-tauri-drag-region="false"
                        >
                          Create + checkout
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="branch-list" role="none">
                    {recentBranches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        className={`branch-item${
                          branch.name === branchName ? " is-active" : ""
                        }`}
                        onClick={async () => {
                          if (branch.name === branchName) {
                            return;
                          }
                          try {
                            await onCheckoutBranch(branch.name);
                            setMenuOpen(false);
                            setIsCreating(false);
                            setNewBranch("");
                            setError(null);
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            );
                          }
                        }}
                        role="menuitem"
                        data-tauri-drag-region="false"
                      >
                        {branch.name}
                      </button>
                    ))}
                    {recentBranches.length === 0 && (
                      <div className="branch-empty">No branches found</div>
                    )}
                  </div>
                  {error && <div className="branch-error">{error}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="main-header-actions">
        <div className="open-app-menu" ref={openMenuRef}>
          <div className="open-app-button">
            <button
              type="button"
              className="ghost main-header-action open-app-action"
              onClick={handleOpenWorkspace}
              data-tauri-drag-region="false"
              aria-label={`Open in ${selectedOpenTarget.label}`}
              title={`Open in ${selectedOpenTarget.label}`}
            >
              <span className="open-app-label">
                <img
                  className="open-app-icon"
                  src={selectedOpenTarget.icon}
                  alt=""
                  aria-hidden
                />
                {selectedOpenTarget.label}
              </span>
            </button>
            <button
              type="button"
              className="ghost main-header-action open-app-toggle"
              onClick={() => setOpenMenuOpen((prev) => !prev)}
              data-tauri-drag-region="false"
              aria-haspopup="menu"
              aria-expanded={openMenuOpen}
              aria-label="Select editor"
              title="Select editor"
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
          {openMenuOpen && (
            <div className="open-app-dropdown" role="menu">
              {openTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={`open-app-option${
                    target.id === openAppId ? " is-active" : ""
                  }`}
                  onClick={() => handleSelectOpenTarget(target)}
                  role="menuitem"
                  data-tauri-drag-region="false"
                >
                  <img className="open-app-icon" src={target.icon} alt="" aria-hidden />
                  {target.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
