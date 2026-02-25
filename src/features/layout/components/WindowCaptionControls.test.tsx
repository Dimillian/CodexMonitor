/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isTauriMock = vi.hoisted(() => vi.fn());
const getCurrentWindowMock = vi.hoisted(() => vi.fn());
const isWindowsPlatformMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("@utils/platformPaths", () => ({
  isWindowsPlatform: isWindowsPlatformMock,
}));

import { WindowCaptionControls } from "./WindowCaptionControls";

describe("WindowCaptionControls", () => {
  const minimize = vi.fn();
  const toggleMaximize = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    isWindowsPlatformMock.mockReturnValue(true);
    isTauriMock.mockReturnValue(true);
    getCurrentWindowMock.mockReturnValue({
      minimize,
      toggleMaximize,
      close,
      isMaximized: vi.fn().mockResolvedValue(false),
      onResized: vi.fn().mockResolvedValue(() => undefined),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders controls on Windows in Tauri and wires actions", () => {
    render(<WindowCaptionControls />);

    expect(screen.getByRole("group", { name: "Window controls" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    expect(minimize).toHaveBeenCalledTimes(1);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not render when not on Windows", () => {
    isWindowsPlatformMock.mockReturnValue(false);

    render(<WindowCaptionControls />);

    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
  });

  it("does not render when not running in Tauri", () => {
    isTauriMock.mockReturnValue(false);

    render(<WindowCaptionControls />);

    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
  });
});
