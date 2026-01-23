import { useMemo } from "react";
import type { ConversationItem } from "../../../types";
import type { ThreadState } from "./useThreadsReducer";

type UseThreadSelectorsOptions = {
  activeWorkspaceId: string | null;
  activeThreadIdByWorkspace: ThreadState["activeThreadIdByWorkspace"];
  itemsByThread: ThreadState["itemsByThread"];
};

export function useThreadSelectors({
  activeWorkspaceId,
  activeThreadIdByWorkspace,
  itemsByThread,
}: UseThreadSelectorsOptions) {
  const activeThreadId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return activeThreadIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeThreadIdByWorkspace, activeWorkspaceId]);

  const activeItems = useMemo<ConversationItem[]>(
    () => (activeThreadId ? itemsByThread[activeThreadId] ?? [] : []),
    [activeThreadId, itemsByThread],
  );

  return { activeThreadId, activeItems };
}
