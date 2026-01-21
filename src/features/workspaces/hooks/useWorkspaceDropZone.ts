import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { subscribeWindowDragDrop } from "../../../services/dragDrop";

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

function getDragPosition(position: { x: number; y: number }) {
  return position;
}

function normalizeDragPosition(
  position: { x: number; y: number },
  lastClientPosition: { x: number; y: number } | null,
) {
  const scale = window.devicePixelRatio || 1;
  if (scale === 1 || !lastClientPosition) {
    return getDragPosition(position);
  }
  const logicalDistance = Math.hypot(
    position.x - lastClientPosition.x,
    position.y - lastClientPosition.y,
  );
  const scaled = { x: position.x / scale, y: position.y / scale };
  const scaledDistance = Math.hypot(
    scaled.x - lastClientPosition.x,
    scaled.y - lastClientPosition.y,
  );
  return scaledDistance < logicalDistance ? scaled : position;
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
  const dropTargetRef = useRef<HTMLElement | null>(null);
  const dragDepthRef = useRef(0);
  const lastClientPositionRef = useRef<{ x: number; y: number } | null>(null);
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
    if (disabled) {
      return undefined;
    }
    unlisten = subscribeWindowDragDrop((event) => {
      if (!dropTargetRef.current) {
        return;
      }
      const payload = event.payload;
      if (payload.type === "leave") {
        setIsDragOver(false);
        return;
      }
      if (payload.type === "over" || payload.type === "enter") {
        const position = normalizeDragPosition(
          payload.position,
          lastClientPositionRef.current,
        );
        const rect = dropTargetRef.current.getBoundingClientRect();
        const isInside =
          position.x >= rect.left &&
          position.x <= rect.right &&
          position.y >= rect.top &&
          position.y <= rect.bottom;
        setIsDragOver(isInside);
        return;
      }
      if (payload.type === "drop") {
        setIsDragOver(false);
        const position = normalizeDragPosition(
          payload.position,
          lastClientPositionRef.current,
        );
        const rect = dropTargetRef.current.getBoundingClientRect();
        const isInside =
          position.x >= rect.left &&
          position.x <= rect.right &&
          position.y >= rect.top &&
          position.y <= rect.bottom;
        if (!isInside) {
          return;
        }
        const paths = (payload.paths ?? [])
          .map((path) => path.trim())
          .filter(Boolean);
        emitPaths(paths);
      }
    });
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
      lastClientPositionRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    dragDepthRef.current += 1;
    handleDragOver(event);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0 && isDragOver) {
      setIsDragOver(false);
      lastClientPositionRef.current = null;
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    dragDepthRef.current = 0;
    if (isDragFileTransfer(event.dataTransfer?.types)) {
      event.preventDefault();
    }
    setIsDragOver(false);
    lastClientPositionRef.current = null;
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
