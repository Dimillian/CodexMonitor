import { useCallback } from "react";
import type { Dispatch } from "react";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadStatusOptions = {
  dispatch: Dispatch<ThreadAction>;
};

export function useThreadStatus({ dispatch }: UseThreadStatusOptions) {
  const markProcessing = useCallback(
    (threadId: string, isProcessing: boolean) => {
      dispatch({
        type: "markProcessing",
        threadId,
        isProcessing,
        timestamp: Date.now(),
      });
    },
    [dispatch],
  );

  const markReviewing = useCallback(
    (threadId: string, isReviewing: boolean) => {
      dispatch({ type: "markReviewing", threadId, isReviewing });
    },
    [dispatch],
  );

  const markThreadError = useCallback(
    (threadId: string, message: string) => {
      dispatch({
        type: "markThreadError",
        threadId,
        timestamp: Date.now(),
        message,
      });
    },
    [dispatch],
  );

  const setActiveTurnId = useCallback(
    (threadId: string, turnId: string | null) => {
      dispatch({ type: "setActiveTurnId", threadId, turnId });
    },
    [dispatch],
  );

  const resetThreadRuntimeState = useCallback(
    (threadId: string) => {
      markReviewing(threadId, false);
      markProcessing(threadId, false);
      setActiveTurnId(threadId, null);
    },
    [markProcessing, markReviewing, setActiveTurnId],
  );

  return {
    markProcessing,
    markReviewing,
    markThreadError,
    setActiveTurnId,
    resetThreadRuntimeState,
  };
}
