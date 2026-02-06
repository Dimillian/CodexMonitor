import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";

const STARTING_DRAFT_CLEAR_MS = 1500;
const STARTING_DRAFT_FALLBACK_MS = 4000;

type UseNewAgentDraftOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
};

export function useNewAgentDraft({
  activeWorkspace,
  activeWorkspaceId,
  activeThreadId,
}: UseNewAgentDraftOptions) {
  const clearStartingTimeoutRef = useRef<number | null>(null);
  const draftStartChainByWorkspaceRef = useRef<Record<string, Promise<void>>>({});
  const [newAgentDraftWorkspaceId, setNewAgentDraftWorkspaceId] = useState<string | null>(
    null,
  );
  const [startingDraftThreadWorkspaceId, setStartingDraftThreadWorkspaceId] = useState<
    string | null
  >(null);

  const clearStartingTimeout = useCallback(() => {
    if (clearStartingTimeoutRef.current !== null) {
      window.clearTimeout(clearStartingTimeoutRef.current);
      clearStartingTimeoutRef.current = null;
    }
  }, []);

  const clearDraftState = useCallback(() => {
    clearStartingTimeout();
    setNewAgentDraftWorkspaceId(null);
    setStartingDraftThreadWorkspaceId(null);
  }, [clearStartingTimeout]);

  useEffect(() => () => clearStartingTimeout(), [clearStartingTimeout]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      clearDraftState();
      return;
    }
    if (activeThreadId && newAgentDraftWorkspaceId === activeWorkspaceId) {
      setNewAgentDraftWorkspaceId(null);
      clearStartingTimeout();
      clearStartingTimeoutRef.current = window.setTimeout(() => {
        clearStartingTimeoutRef.current = null;
        setStartingDraftThreadWorkspaceId((current) =>
          current === activeWorkspaceId ? null : current,
        );
      }, STARTING_DRAFT_CLEAR_MS);
    }
  }, [
    activeThreadId,
    activeWorkspaceId,
    clearDraftState,
    clearStartingTimeout,
    newAgentDraftWorkspaceId,
  ]);

  const isDraftModeForActiveWorkspace = useMemo(
    () =>
      Boolean(
        activeWorkspaceId &&
          !activeThreadId &&
          newAgentDraftWorkspaceId === activeWorkspaceId,
      ),
    [activeThreadId, activeWorkspaceId, newAgentDraftWorkspaceId],
  );

  const startNewAgentDraft = useCallback((workspaceId: string) => {
    clearStartingTimeout();
    setNewAgentDraftWorkspaceId(workspaceId);
    setStartingDraftThreadWorkspaceId(null);
  }, [clearStartingTimeout]);

  const clearDraftStateIfDifferentWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId !== newAgentDraftWorkspaceId) {
        clearDraftState();
      }
    },
    [clearDraftState, newAgentDraftWorkspaceId],
  );

  const runWithDraftStart = useCallback(
    async (runner: () => Promise<void>) => {
      const shouldMarkStarting = Boolean(activeWorkspace && !activeThreadId);
      const draftWorkspaceId = activeWorkspace?.id ?? null;
      if (shouldMarkStarting && draftWorkspaceId) {
        const previous = draftStartChainByWorkspaceRef.current[draftWorkspaceId] ?? Promise.resolve();
        const current = previous
          .catch(() => {
            // Keep the chain alive even if a previous send fails.
          })
          .then(async () => {
            setStartingDraftThreadWorkspaceId(draftWorkspaceId);
            try {
              await runner();
              clearStartingTimeout();
              clearStartingTimeoutRef.current = window.setTimeout(() => {
                clearStartingTimeoutRef.current = null;
                setStartingDraftThreadWorkspaceId((value) =>
                  value === draftWorkspaceId ? null : value,
                );
              }, STARTING_DRAFT_FALLBACK_MS);
            } catch (error) {
              clearStartingTimeout();
              setStartingDraftThreadWorkspaceId((value) =>
                value === draftWorkspaceId ? null : value,
              );
              throw error;
            }
          })
          .finally(() => {
            if (draftStartChainByWorkspaceRef.current[draftWorkspaceId] === current) {
              delete draftStartChainByWorkspaceRef.current[draftWorkspaceId];
            }
          });
        draftStartChainByWorkspaceRef.current[draftWorkspaceId] = current;
        await current;
        return;
      }

      await runner();
    },
    [activeThreadId, activeWorkspace, clearStartingTimeout],
  );

  return {
    newAgentDraftWorkspaceId,
    startingDraftThreadWorkspaceId,
    isDraftModeForActiveWorkspace,
    startNewAgentDraft,
    clearDraftState,
    clearDraftStateIfDifferentWorkspace,
    runWithDraftStart,
  };
}
