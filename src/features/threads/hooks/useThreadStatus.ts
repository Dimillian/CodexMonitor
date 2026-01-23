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

  const setActiveTurnId = useCallback(
    (threadId: string, turnId: string | null) => {
      dispatch({ type: "setActiveTurnId", threadId, turnId });
    },
    [dispatch],
  );

  return { markProcessing, markReviewing, setActiveTurnId };
}
