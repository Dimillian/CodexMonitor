import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

function isDragFileTransfer(types: readonly string[] | undefined) {
  if (!types || types.length === 0) {
    return false;
  }
  return (
    types.includes("Files") ||
    types.includes("public.file-url") ||
    types.includes("application/x-moz-file")
  );
}

type DropPathsHandler = (paths: string[]) => void | Promise<void>;

type UseWorkspaceDropZoneArgs = {
  disabled?: boolean;
  onDropPaths: DropPathsHandler;
};

export function useWorkspaceDropZone({
  disabled = false,
  onDropPaths,
}: UseWorkspaceDropZoneArgs) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropTargetRef = useRef<HTMLDivElement | null>(null);
  const lastDropRef = useRef<{
    at: number;
    paths: string[];
  } | null>(null);

  const emitPaths = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      const now = Date.now();
      const previous = lastDropRef.current;
      if (
        previous &&
        now - previous.at < 750 &&
        previous.paths.length === paths.length &&
        previous.paths.every((value, index) => value === paths[index])
      ) {
        return;
      }
      lastDropRef.current = { at: now, paths };
      try {
        const result = onDropPaths(paths);
        void Promise.resolve(result).catch((error) => {
          console.error("Failed to handle workspace drop paths", error);
        });
      } catch (error) {
        console.error("Failed to handle workspace drop paths", error);
      }
    },
    [onDropPaths],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const register = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (disabled || !dropTargetRef.current) {
            return;
          }
          if (event.payload.type === "leave") {
            setIsDragOver(false);
            return;
          }
          if (event.payload.type === "over" || event.payload.type === "enter") {
            setIsDragOver(true);
            return;
          }
          if (event.payload.type === "drop") {
            setIsDragOver(false);
            const paths = event.payload.paths
              .map((path) => path.trim())
              .filter(Boolean);
            emitPaths(paths);
          }
        });
      } catch {
        unlisten = null;
      }
    };
    void register();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [disabled, emitPaths]);

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    if (isDragFileTransfer(event.dataTransfer?.types)) {
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    handleDragOver(event);
  };

  const handleDragLeave = (_event: DragEvent<HTMLElement>) => {
    if (isDragOver) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    const items = Array.from(event.dataTransfer?.items ?? []);
    const itemFiles = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const paths = [...files, ...itemFiles]
      .map((file) => (file as File & { path?: string }).path ?? "")
      .filter(Boolean);
    emitPaths(paths);
  };

  return {
    dropTargetRef,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
