// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";

describe("useThreadUserInputEvents", () => {
  it("queues request user input without clearing turn state", () => {
    const dispatch = vi.fn();

    const { result } = renderHook(() =>
      useThreadUserInputEvents({
        dispatch,
      }),
    );

    const request = {
      workspace_id: "ws-1",
      request_id: "req-1",
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [],
      },
    };

    act(() => {
      result.current(request);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "addUserInputRequest", request });
  });
});
