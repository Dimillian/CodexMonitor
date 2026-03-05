// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { respondToUserInputRequest } from "@services/tauri";
import { useThreadUserInput } from "./useThreadUserInput";

vi.mock("@services/tauri", () => ({
  respondToUserInputRequest: vi.fn().mockResolvedValue(undefined),
}));

describe("useThreadUserInput", () => {
  it("submits request-user-input answers and appends an answered item", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useThreadUserInput({ dispatch }));
    const request = {
      workspace_id: "ws-1",
      request_id: "req-7",
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [
          {
            id: "q-choice",
            header: "Pick",
            question: "Which option?",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" },
            ],
          },
        ],
      },
    };
    const response = {
      answers: {
        "q-choice": { answers: ["A", "user_note: with details"] },
      },
    };

    await act(async () => {
      await result.current.handleUserInputSubmit(request, response);
    });

    expect(respondToUserInputRequest).toHaveBeenCalledWith(
      "ws-1",
      "req-7",
      response.answers,
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: expect.objectContaining({
          id: "user-input-ws-1-thread-1-turn-1-item-1",
          kind: "userInput",
          status: "answered",
        }),
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "removeUserInputRequest",
      requestId: "req-7",
      workspaceId: "ws-1",
    });
  });
});
