import { useCallback } from "react";
import type { Dispatch } from "react";
import type { RequestUserInputRequest, RequestUserInputResponse } from "@/types";
import { respondToUserInputRequest } from "@services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadUserInputOptions = {
  dispatch: Dispatch<ThreadAction>;
};

export function useThreadUserInput({ dispatch }: UseThreadUserInputOptions) {
  const handleUserInputSubmit = useCallback(
    async (request: RequestUserInputRequest, response: RequestUserInputResponse) => {
      await respondToUserInputRequest(
        request.workspace_id,
        request.request_id,
        response.answers,
      );
      dispatch({
        type: "removeUserInputRequest",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
      });
    },
    [dispatch],
  );

  return { handleUserInputSubmit };
}
