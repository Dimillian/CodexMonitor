import { describe, expect, it, vi } from "vitest";
import { pushErrorToast, subscribeErrorToasts } from "./toasts";

describe("error toasts", () => {
  it("publishes error toasts to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorToasts(listener);

    const id = pushErrorToast({
      title: "Test error",
      message: "Something went wrong",
      durationMs: 1234,
    });

    expect(id).toMatch(/^error-toast-/);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        title: "Test error",
        message: "Something went wrong",
        durationMs: 1234,
      }),
    );

    unsubscribe();
  });
});

