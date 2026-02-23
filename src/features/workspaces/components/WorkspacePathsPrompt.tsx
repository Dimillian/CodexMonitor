import { useEffect, useRef } from "react";
import type { RemoteDirectoryEntry } from "@services/tauri";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { RemoteDirectoryBrowser } from "./RemoteDirectoryBrowser";

type WorkspacePathsBrowserState = {
  currentPath: string;
  parentPath: string | null;
  entries: RemoteDirectoryEntry[];
  includeHidden: boolean;
  isLoading: boolean;
  loadError: string | null;
  truncated: boolean;
  entryCount: number;
};

type WorkspacePathsPromptProps = {
  value: string;
  error: string | null;
  browser: WorkspacePathsBrowserState | null;
  onChange: (value: string) => void;
  onBrowseDirectory: (path: string) => void;
  onBrowseParentDirectory: () => void;
  onBrowseHomeDirectory: () => void;
  onRetryDirectoryListing: () => void;
  onToggleHiddenDirectories: () => void;
  onUseCurrentDirectory: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WorkspacePathsPrompt({
  value,
  error,
  browser,
  onChange,
  onBrowseDirectory,
  onBrowseParentDirectory,
  onBrowseHomeDirectory,
  onRetryDirectoryListing,
  onToggleHiddenDirectories,
  onUseCurrentDirectory,
  onCancel,
  onConfirm,
}: WorkspacePathsPromptProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const helpId = "workspace-paths-input-help";
  const errorId = "workspace-paths-input-error";
  const describedBy = error ? `${helpId} ${errorId}` : helpId;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <ModalShell
      className="workspace-paths-modal"
      cardClassName="workspace-paths-modal-card"
      ariaLabel="Add workspace paths"
      onBackdropClick={onCancel}
    >
      <div className="ds-modal-title">Add workspace</div>
      <div id={helpId} className="ds-modal-subtitle">
        Browse folders on the connected server, then add one or more absolute paths.
      </div>

      {browser && (
        <RemoteDirectoryBrowser
          currentPath={browser.currentPath}
          parentPath={browser.parentPath}
          entries={browser.entries}
          includeHidden={browser.includeHidden}
          isLoading={browser.isLoading}
          loadError={browser.loadError}
          truncated={browser.truncated}
          entryCount={browser.entryCount}
          onBrowseDirectory={onBrowseDirectory}
          onBrowseParentDirectory={onBrowseParentDirectory}
          onBrowseHomeDirectory={onBrowseHomeDirectory}
          onRetryDirectoryListing={onRetryDirectoryListing}
          onToggleHiddenDirectories={onToggleHiddenDirectories}
          onUseCurrentDirectory={onUseCurrentDirectory}
          currentActionLabel="Use this folder"
          disableCurrentAction={!browser.currentPath || browser.isLoading}
        />
      )}

      <label className="ds-modal-label" htmlFor="workspace-paths-input">
        Absolute server paths (fallback)
      </label>
      <textarea
        id="workspace-paths-input"
        ref={inputRef}
        className="ds-modal-textarea"
        value={value}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="/home/dev/project-one\n/home/dev/project-two"
        rows={4}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      {error && (
        <div id={errorId} className="ds-modal-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <div className="ds-modal-actions">
        <button className="ghost ds-modal-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary ds-modal-button" onClick={onConfirm} type="button">
          Add workspace
        </button>
      </div>
    </ModalShell>
  );
}
