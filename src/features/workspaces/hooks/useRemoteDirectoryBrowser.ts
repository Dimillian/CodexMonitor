import { useCallback, useRef, useState } from "react";
import {
  listRemoteDirectories,
  type RemoteDirectoryEntry,
} from "@services/tauri";
import { mapRemoteDirectoryError } from "../utils/remoteDirectoryErrors";

const REMOTE_DIRECTORY_PAGE_SIZE = 300;

export type RemoteDirectoryBrowserState = {
  currentPath: string;
  parentPath: string | null;
  entries: RemoteDirectoryEntry[];
  includeHidden: boolean;
  isLoading: boolean;
  loadError: string | null;
  truncated: boolean;
  entryCount: number;
};

function loadingBrowserState(includeHidden: boolean): RemoteDirectoryBrowserState {
  return {
    currentPath: "",
    parentPath: null,
    entries: [],
    includeHidden,
    isLoading: true,
    loadError: null,
    truncated: false,
    entryCount: 0,
  };
}

export function useRemoteDirectoryBrowser() {
  const [browserState, setBrowserStateValue] =
    useState<RemoteDirectoryBrowserState | null>(null);
  const browserStateRef = useRef<RemoteDirectoryBrowserState | null>(null);
  const browserRequestIdRef = useRef(0);

  const setBrowserState = useCallback((next: RemoteDirectoryBrowserState | null) => {
    browserStateRef.current = next;
    setBrowserStateValue(next);
  }, []);

  const invalidateBrowserRequests = useCallback(() => {
    browserRequestIdRef.current += 1;
  }, []);

  const refreshBrowser = useCallback(
    async (path: string | null, includeHiddenOverride?: boolean) => {
      const current = browserStateRef.current;
      if (!current) {
        return;
      }

      const includeHidden = includeHiddenOverride ?? current.includeHidden;
      const requestId = browserRequestIdRef.current + 1;
      browserRequestIdRef.current = requestId;

      setBrowserState({
        ...current,
        includeHidden,
        isLoading: true,
        loadError: null,
      });

      try {
        const response = await listRemoteDirectories({
          path,
          includeHidden,
          limit: REMOTE_DIRECTORY_PAGE_SIZE,
          offset: 0,
        });

        if (browserRequestIdRef.current !== requestId) {
          return;
        }

        const latest = browserStateRef.current;
        if (!latest) {
          return;
        }

        setBrowserState({
          ...latest,
          currentPath: response.currentPath,
          parentPath: response.parentPath,
          entries: response.entries,
          includeHidden,
          isLoading: false,
          loadError: null,
          truncated: response.truncated,
          entryCount: response.entryCount,
        });
      } catch (error) {
        if (browserRequestIdRef.current !== requestId) {
          return;
        }

        const latest = browserStateRef.current;
        if (!latest) {
          return;
        }

        setBrowserState({
          ...latest,
          includeHidden,
          isLoading: false,
          loadError: mapRemoteDirectoryError(
            error instanceof Error ? error.message : String(error),
          ),
        });
      }
    },
    [setBrowserState],
  );

  const openBrowser = useCallback(
    (path: string | null, includeHidden = false) => {
      setBrowserState(loadingBrowserState(includeHidden));
      void refreshBrowser(path, includeHidden);
    },
    [refreshBrowser, setBrowserState],
  );

  const browseDirectory = useCallback(
    (path: string) => {
      void refreshBrowser(path);
    },
    [refreshBrowser],
  );

  const browseParentDirectory = useCallback(() => {
    const current = browserStateRef.current;
    if (!current?.parentPath) {
      return;
    }
    void refreshBrowser(current.parentPath);
  }, [refreshBrowser]);

  const browseHomeDirectory = useCallback(() => {
    void refreshBrowser(null);
  }, [refreshBrowser]);

  const retryBrowserListing = useCallback(() => {
    const current = browserStateRef.current;
    if (!current) {
      return;
    }
    void refreshBrowser(current.currentPath || null);
  }, [refreshBrowser]);

  const toggleHiddenDirectories = useCallback(() => {
    const current = browserStateRef.current;
    if (!current) {
      return;
    }
    void refreshBrowser(current.currentPath || null, !current.includeHidden);
  }, [refreshBrowser]);

  return {
    browserState,
    setBrowserState,
    invalidateBrowserRequests,
    openBrowser,
    refreshBrowser,
    browseDirectory,
    browseParentDirectory,
    browseHomeDirectory,
    retryBrowserListing,
    toggleHiddenDirectories,
  };
}
