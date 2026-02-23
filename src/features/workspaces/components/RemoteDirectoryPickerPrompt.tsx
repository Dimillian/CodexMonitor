import type { RemoteDirectoryEntry } from "@services/tauri";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { RemoteDirectoryBrowser } from "./RemoteDirectoryBrowser";

type RemoteDirectoryPickerPromptProps = {
  title: string;
  confirmLabel: string;
  currentPath: string;
  parentPath: string | null;
  entries: RemoteDirectoryEntry[];
  includeHidden: boolean;
  isLoading: boolean;
  loadError: string | null;
  truncated: boolean;
  entryCount: number;
  onBrowseDirectory: (path: string) => void;
  onBrowseParentDirectory: () => void;
  onBrowseHomeDirectory: () => void;
  onRetryDirectoryListing: () => void;
  onToggleHiddenDirectories: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RemoteDirectoryPickerPrompt({
  title,
  confirmLabel,
  currentPath,
  parentPath,
  entries,
  includeHidden,
  isLoading,
  loadError,
  truncated,
  entryCount,
  onBrowseDirectory,
  onBrowseParentDirectory,
  onBrowseHomeDirectory,
  onRetryDirectoryListing,
  onToggleHiddenDirectories,
  onCancel,
  onConfirm,
}: RemoteDirectoryPickerPromptProps) {
  return (
    <ModalShell
      className="remote-directory-picker-modal"
      cardClassName="remote-directory-picker-modal-card"
      ariaLabel={title}
      onBackdropClick={onCancel}
    >
      <div className="ds-modal-title">{title}</div>
      <div className="ds-modal-subtitle">
        Select a folder on the connected server.
      </div>

      <RemoteDirectoryBrowser
        currentPath={currentPath}
        parentPath={parentPath}
        entries={entries}
        includeHidden={includeHidden}
        isLoading={isLoading}
        loadError={loadError}
        truncated={truncated}
        entryCount={entryCount}
        onBrowseDirectory={onBrowseDirectory}
        onBrowseParentDirectory={onBrowseParentDirectory}
        onBrowseHomeDirectory={onBrowseHomeDirectory}
        onRetryDirectoryListing={onRetryDirectoryListing}
        onToggleHiddenDirectories={onToggleHiddenDirectories}
      />

      <div className="remote-directory-picker-current">
        <label className="ds-modal-label" htmlFor="remote-directory-picker-current-path">
          Current folder
        </label>
        <textarea
          id="remote-directory-picker-current-path"
          className="ds-modal-input"
          value={currentPath}
          readOnly
          rows={1}
          wrap="off"
        />
      </div>

      <div className="ds-modal-actions">
        <button className="ghost ds-modal-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="primary ds-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={!currentPath || isLoading}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
