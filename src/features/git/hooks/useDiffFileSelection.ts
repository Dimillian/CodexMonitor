import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FileEntry = {
  path: string;
};

type UseDiffFileSelectionParams = {
  stagedFiles: FileEntry[];
  unstagedFiles: FileEntry[];
  onSelectFile?: (path: string) => void;
};

export function useDiffFileSelection({
  stagedFiles,
  unstagedFiles,
  onSelectFile,
}: UseDiffFileSelectionParams) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastClickedFile, setLastClickedFile] = useState<string | null>(null);

  const allFiles = useMemo(
    () => [
      ...stagedFiles.map((file) => ({ ...file, section: "staged" as const })),
      ...unstagedFiles.map((file) => ({ ...file, section: "unstaged" as const })),
    ],
    [stagedFiles, unstagedFiles],
  );

  const selectOnlyFile = useCallback((path: string) => {
    setSelectedFiles(new Set([path]));
    setLastClickedFile(path);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setLastClickedFile(null);
  }, []);

  const handleFileClick = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      path: string,
      _section: "staged" | "unstaged",
    ) => {
      const isMetaKey = event.metaKey || event.ctrlKey;
      const isShiftKey = event.shiftKey;

      if (isMetaKey) {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return next;
        });
        setLastClickedFile(path);
        return;
      }

      if (isShiftKey && lastClickedFile) {
        const currentIndex = allFiles.findIndex((file) => file.path === path);
        const lastIndex = allFiles.findIndex((file) => file.path === lastClickedFile);
        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          const range = allFiles.slice(start, end + 1).map((file) => file.path);
          setSelectedFiles((prev) => {
            const next = new Set(prev);
            for (const rangePath of range) {
              next.add(rangePath);
            }
            return next;
          });
        }
        return;
      }

      selectOnlyFile(path);
      onSelectFile?.(path);
    },
    [allFiles, lastClickedFile, onSelectFile, selectOnlyFile],
  );

  const filesKey = useMemo(
    () => [...stagedFiles, ...unstagedFiles].map((file) => file.path).join(","),
    [stagedFiles, unstagedFiles],
  );
  const prevFilesKeyRef = useRef(filesKey);

  useEffect(() => {
    if (filesKey === prevFilesKeyRef.current) {
      return;
    }
    prevFilesKeyRef.current = filesKey;
    clearSelection();
  }, [clearSelection, filesKey]);

  const handleDiffListClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".diff-row")) {
        return;
      }
      clearSelection();
    },
    [clearSelection],
  );

  return {
    selectedFiles,
    setSelectedFiles,
    handleFileClick,
    handleDiffListClick,
    selectOnlyFile,
  };
}
