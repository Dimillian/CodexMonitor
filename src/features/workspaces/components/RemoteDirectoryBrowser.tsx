import type { RemoteDirectoryEntry } from "@services/tauri";
import { useMemo } from "react";
import { buildRemoteDirectoryBreadcrumbs } from "../utils/remoteDirectoryBreadcrumbs";

type RemoteDirectoryBrowserProps = {
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
  onUseCurrentDirectory?: () => void;
  currentActionLabel?: string;
  disableCurrentAction?: boolean;
};

export function RemoteDirectoryBrowser({
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
  onUseCurrentDirectory,
  currentActionLabel,
  disableCurrentAction = false,
}: RemoteDirectoryBrowserProps) {
  const breadcrumbs = useMemo(
    () => buildRemoteDirectoryBreadcrumbs(currentPath),
    [currentPath],
  );

  return (
    <section className="workspace-paths-browser" aria-label="Remote directory browser">
      <div className="workspace-paths-browser-controls">
        <button className="ghost ds-modal-button" onClick={onBrowseHomeDirectory} type="button">
          Home
        </button>
        <button
          className="ghost ds-modal-button"
          onClick={onBrowseParentDirectory}
          type="button"
          disabled={!parentPath || isLoading}
        >
          Back
        </button>
        <button
          className="ghost ds-modal-button"
          onClick={onToggleHiddenDirectories}
          type="button"
          disabled={isLoading}
        >
          {includeHidden ? "Hide hidden" : "Show hidden"}
        </button>
        {onUseCurrentDirectory && currentActionLabel && (
          <button
            className="ghost ds-modal-button"
            onClick={onUseCurrentDirectory}
            type="button"
            disabled={disableCurrentAction}
          >
            {currentActionLabel}
          </button>
        )}
      </div>

      <div className="workspace-paths-breadcrumb" role="navigation" aria-label="Current path">
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((segment) => (
            <button
              key={segment.path}
              type="button"
              className="workspace-paths-breadcrumb-segment"
              onClick={() => onBrowseDirectory(segment.path)}
              disabled={isLoading}
              title={segment.path}
            >
              {segment.label}
            </button>
          ))
        ) : (
          <span className="workspace-paths-breadcrumb-empty">Loading directory…</span>
        )}
      </div>

      <div className="workspace-paths-directory-list" role="list">
        {isLoading && entries.length === 0 && (
          <div className="workspace-paths-directory-empty">Loading directories…</div>
        )}

        {loadError && (
          <div className="workspace-paths-directory-error">
            <div className="ds-modal-error" role="alert" aria-live="assertive">
              {loadError}
            </div>
            <button
              type="button"
              className="ghost ds-modal-button"
              onClick={onRetryDirectoryListing}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !loadError && entries.length === 0 && (
          <div className="workspace-paths-directory-empty">No subdirectories in this folder.</div>
        )}

        {!loadError &&
          entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              role="listitem"
              className="workspace-paths-directory-row"
              onClick={() => onBrowseDirectory(entry.path)}
              disabled={isLoading}
              title={entry.path}
            >
              <span className="workspace-paths-directory-row-name">{entry.name}</span>
              <span className="workspace-paths-directory-row-meta">
                {entry.isSymlink ? "symlink" : "folder"}
                {entry.isReadable ? "" : " • unreadable"}
              </span>
            </button>
          ))}
      </div>

      {truncated && (
        <div className="workspace-paths-directory-hint">
          Showing {entries.length} of {entryCount} folders.
        </div>
      )}
    </section>
  );
}
