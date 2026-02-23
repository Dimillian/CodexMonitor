import { useCallback, useEffect, useRef, useState } from "react";
import {
  listRemoteDirectories,
  type RemoteDirectoryEntry,
} from "@services/tauri";
import { pushErrorToast } from "@services/toasts";
import { mapRemoteDirectoryError } from "@/features/workspaces/utils/remoteDirectoryErrors";

const REMOTE_DIRECTORY_PAGE_SIZE = 300;

type RemoteDirectoryPickerRequest = {
  title: string;
  confirmLabel: string;
  initialPath: string | null;
};

export type RemoteDirectoryPickerState = {
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
} | null;

export function useRemoteDirectoryPicker() {
  const [remoteDirectoryPicker, setRemoteDirectoryPicker] =
    useState<RemoteDirectoryPickerState>(null);
  const remoteDirectoryPickerRef = useRef<RemoteDirectoryPickerState>(null);
  const remoteDirectoryPickerResolveRef = useRef<((path: string | null) => void) | null>(
    null,
  );
  const remoteDirectoryPickerRequestIdRef = useRef(0);

  const resolveRemoteDirectoryPicker = useCallback((path: string | null) => {
    remoteDirectoryPickerRequestIdRef.current += 1;
    const resolve = remoteDirectoryPickerResolveRef.current;
    remoteDirectoryPickerResolveRef.current = null;
    remoteDirectoryPickerRef.current = null;
    setRemoteDirectoryPicker(null);
    resolve?.(path);
  }, []);

  useEffect(() => {
    remoteDirectoryPickerRef.current = remoteDirectoryPicker;
  }, [remoteDirectoryPicker]);

  useEffect(() => {
    return () => {
      remoteDirectoryPickerRequestIdRef.current += 1;
      const resolve = remoteDirectoryPickerResolveRef.current;
      remoteDirectoryPickerResolveRef.current = null;
      resolve?.(null);
    };
  }, []);

  const refreshRemoteDirectoryPicker = useCallback(
    async (path: string | null, includeHiddenOverride?: boolean) => {
      const current = remoteDirectoryPickerRef.current;
      if (!current) {
        return;
      }

      const includeHidden = includeHiddenOverride ?? current.includeHidden;
      const requestId = remoteDirectoryPickerRequestIdRef.current + 1;
      remoteDirectoryPickerRequestIdRef.current = requestId;

      const loading = {
        ...current,
        includeHidden,
        isLoading: true,
        loadError: null,
      };
      remoteDirectoryPickerRef.current = loading;
      setRemoteDirectoryPicker(loading);

      try {
        const response = await listRemoteDirectories({
          path,
          includeHidden,
          limit: REMOTE_DIRECTORY_PAGE_SIZE,
          offset: 0,
        });

        if (remoteDirectoryPickerRequestIdRef.current !== requestId) {
          return;
        }

        const latest = remoteDirectoryPickerRef.current;
        if (!latest) {
          return;
        }

        const next = {
          ...latest,
          currentPath: response.currentPath,
          parentPath: response.parentPath,
          entries: response.entries,
          includeHidden,
          isLoading: false,
          loadError: null,
          truncated: response.truncated,
          entryCount: response.entryCount,
        };
        remoteDirectoryPickerRef.current = next;
        setRemoteDirectoryPicker(next);
      } catch (error) {
        if (remoteDirectoryPickerRequestIdRef.current !== requestId) {
          return;
        }

        const latest = remoteDirectoryPickerRef.current;
        if (!latest) {
          return;
        }

        const next = {
          ...latest,
          includeHidden,
          isLoading: false,
          loadError: mapRemoteDirectoryError(
            error instanceof Error ? error.message : String(error),
          ),
        };
        remoteDirectoryPickerRef.current = next;
        setRemoteDirectoryPicker(next);
      }
    },
    [],
  );

  const requestRemoteDirectory = useCallback(
    async (request?: Partial<RemoteDirectoryPickerRequest>) => {
      if (remoteDirectoryPickerResolveRef.current) {
        pushErrorToast({
          title: "Choose folder",
          message: "A folder picker is already open.",
        });
        return null;
      }

      return new Promise<string | null>((resolve) => {
        remoteDirectoryPickerResolveRef.current = resolve;

        const next: RemoteDirectoryPickerState = {
          title: request?.title ?? "Choose folder",
          confirmLabel: request?.confirmLabel ?? "Use folder",
          currentPath: "",
          parentPath: null,
          entries: [],
          includeHidden: false,
          isLoading: true,
          loadError: null,
          truncated: false,
          entryCount: 0,
        };

        remoteDirectoryPickerRef.current = next;
        setRemoteDirectoryPicker(next);
        void refreshRemoteDirectoryPicker(request?.initialPath ?? null, false);
      });
    },
    [refreshRemoteDirectoryPicker],
  );

  const browseRemoteDirectoryPickerDirectory = useCallback(
    (path: string) => {
      void refreshRemoteDirectoryPicker(path);
    },
    [refreshRemoteDirectoryPicker],
  );

  const browseRemoteDirectoryPickerParentDirectory = useCallback(() => {
    const current = remoteDirectoryPickerRef.current;
    if (!current?.parentPath) {
      return;
    }
    void refreshRemoteDirectoryPicker(current.parentPath);
  }, [refreshRemoteDirectoryPicker]);

  const browseRemoteDirectoryPickerHomeDirectory = useCallback(() => {
    void refreshRemoteDirectoryPicker(null);
  }, [refreshRemoteDirectoryPicker]);

  const retryRemoteDirectoryPickerListing = useCallback(() => {
    const current = remoteDirectoryPickerRef.current;
    if (!current) {
      return;
    }
    void refreshRemoteDirectoryPicker(current.currentPath || null);
  }, [refreshRemoteDirectoryPicker]);

  const toggleRemoteDirectoryPickerHiddenDirectories = useCallback(() => {
    const current = remoteDirectoryPickerRef.current;
    if (!current) {
      return;
    }
    void refreshRemoteDirectoryPicker(
      current.currentPath || null,
      !current.includeHidden,
    );
  }, [refreshRemoteDirectoryPicker]);

  const cancelRemoteDirectoryPicker = useCallback(() => {
    resolveRemoteDirectoryPicker(null);
  }, [resolveRemoteDirectoryPicker]);

  const confirmRemoteDirectoryPicker = useCallback(() => {
    const current = remoteDirectoryPickerRef.current;
    if (!current || !current.currentPath || current.isLoading) {
      return;
    }
    resolveRemoteDirectoryPicker(current.currentPath);
  }, [resolveRemoteDirectoryPicker]);

  return {
    remoteDirectoryPicker,
    requestRemoteDirectory,
    browseRemoteDirectoryPickerDirectory,
    browseRemoteDirectoryPickerParentDirectory,
    browseRemoteDirectoryPickerHomeDirectory,
    retryRemoteDirectoryPickerListing,
    toggleRemoteDirectoryPickerHiddenDirectories,
    cancelRemoteDirectoryPicker,
    confirmRemoteDirectoryPicker,
  };
}
