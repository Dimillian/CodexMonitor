// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAppQuit } from "../../../services/tauri";
import { useHoldToQuit } from "./useHoldToQuit";

vi.mock("../../../services/tauri", () => ({
  requestAppQuit: vi.fn(),
}));
vi.mock("../../../services/events", () => ({
  subscribeMenuQuit: () => () => {},
}));

describe("useHoldToQuit", () => {
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  it("cancels hold and hides toast on key release", () => {
    const { result } = renderHook(() => useHoldToQuit({ enabled: true }));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "q", metaKey: true }),
      );
    });

    expect(result.current.state.status).toBe("holding");
    expect(result.current.state.isVisible).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "q" }));
    });

    expect(result.current.state.status).toBe("canceled");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.state.isVisible).toBe(false);
  });

  it("requests quit after holding long enough", async () => {
    const requestMock = vi.mocked(requestAppQuit);
    requestMock.mockResolvedValue();

    renderHook(() => useHoldToQuit({ enabled: true }));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "q", metaKey: true }),
      );
    });

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
