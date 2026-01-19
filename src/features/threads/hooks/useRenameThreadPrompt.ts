import { useCallback, useState } from "react";
import type { ThreadSummary } from "../../../types";

type RenamePromptState = {
  workspaceId: string;
  threadId: string;
  name: string;
  originalName: string;
};

type UseRenameThreadPromptOptions = {
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  renameThread: (workspaceId: string, threadId: string, name: string) => void;
};

export function useRenameThreadPrompt({
  threadsByWorkspace,
  renameThread,
}: UseRenameThreadPromptOptions) {
  const [renamePrompt, setRenamePrompt] = useState<RenamePromptState | null>(
    null,
  );

  const openRenamePrompt = useCallback(
    (workspaceId: string, threadId: string) => {
      const threads = threadsByWorkspace[workspaceId] ?? [];
      const thread = threads.find((entry) => entry.id === threadId);
      const currentName = thread?.name || "Thread";
      setRenamePrompt({
        workspaceId,
        threadId,
        name: currentName,
        originalName: currentName,
      });
    },
    [threadsByWorkspace],
  );

  const handleRenamePromptChange = useCallback((value: string) => {
    setRenamePrompt((prev) =>
      prev
        ? {
            ...prev,
            name: value,
          }
        : prev,
    );
  }, []);

  const handleRenamePromptCancel = useCallback(() => {
    setRenamePrompt(null);
  }, []);

  const handleRenamePromptConfirm = useCallback(() => {
    setRenamePrompt((prev) => {
      if (!prev) {
        return prev;
      }
      const trimmed = prev.name.trim();
      if (!trimmed || trimmed === prev.originalName) {
        return null;
      }
      renameThread(prev.workspaceId, prev.threadId, trimmed);
      return null;
    });
  }, [renameThread]);

  return {
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  };
}
