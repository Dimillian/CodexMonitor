// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../../types";
import { useUiScaleShortcuts } from "./useUiScaleShortcuts";

const pushErrorToastMock = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    setZoom: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: (...args: unknown[]) => pushErrorToastMock(...args),
}));

describe("useUiScaleShortcuts", () => {
  beforeEach(() => {
    pushErrorToastMock.mockReset();
  });

  it("shows a visible toast when queueSaveSettings fails", async () => {
    const saveSettings = vi.fn(async () => {
      throw new Error("save failed");
    });
    const settings = ({ uiScale: 1 } as unknown) as AppSettings;
    const setSettings = vi.fn();
    const { result } = renderHook(() =>
      useUiScaleShortcuts({
        settings,
        setSettings,
        saveSettings,
      }),
    );

    await act(async () => {
      await expect(result.current.queueSaveSettings(settings)).rejects.toThrow("save failed");
    });

    expect(pushErrorToastMock).toHaveBeenCalledWith({
      title: "保存设置失败",
      message: "save failed",
    });
  });

  it("deduplicates repeated save error toasts in a short window", async () => {
    const saveSettings = vi.fn(async () => {
      throw new Error("save failed");
    });
    const settings = ({ uiScale: 1 } as unknown) as AppSettings;
    const setSettings = vi.fn();
    const { result } = renderHook(() =>
      useUiScaleShortcuts({
        settings,
        setSettings,
        saveSettings,
      }),
    );

    await act(async () => {
      await expect(result.current.queueSaveSettings(settings)).rejects.toThrow("save failed");
      await expect(result.current.queueSaveSettings(settings)).rejects.toThrow("save failed");
    });

    expect(pushErrorToastMock).toHaveBeenCalledTimes(1);
  });
});
