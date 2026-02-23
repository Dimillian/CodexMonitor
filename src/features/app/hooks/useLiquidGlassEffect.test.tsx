// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCurrentWindowHudEffect,
  clearCurrentWindowEffects,
  isLiquidGlassSupported,
  setLiquidGlassEnabled,
} from "@services/tauri";
import { useLiquidGlassEffect } from "./useLiquidGlassEffect";

vi.mock("@services/tauri", () => ({
  applyCurrentWindowHudEffect: vi.fn(async () => undefined),
  clearCurrentWindowEffects: vi.fn(async () => undefined),
  isLiquidGlassSupported: vi.fn(async () => false),
  setLiquidGlassEnabled: vi.fn(async () => undefined),
}));

function setNavigatorState(value: string, platform: string, maxTouchPoints: number) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value,
  });
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

describe("useLiquidGlassEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setNavigatorState(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "MacIntel",
      0,
    );
    vi.mocked(clearCurrentWindowEffects).mockResolvedValue(undefined);
    vi.mocked(applyCurrentWindowHudEffect).mockResolvedValue(undefined);
    vi.mocked(isLiquidGlassSupported).mockResolvedValue(false);
    vi.mocked(setLiquidGlassEnabled).mockResolvedValue(undefined);
  });

  it("does not query liquid glass support on mobile reduce-transparency flow", async () => {
    setNavigatorState(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "iPhone",
      5,
    );

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: true,
      }),
    );
    await waitFor(() => expect(clearCurrentWindowEffects).toHaveBeenCalledTimes(1));

    expect(isLiquidGlassSupported).not.toHaveBeenCalled();
    expect(setLiquidGlassEnabled).not.toHaveBeenCalled();
  });

  it("treats desktop-mode iPad user agent as mobile", async () => {
    setNavigatorState(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1",
      "MacIntel",
      5,
    );

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: true,
      }),
    );
    await waitFor(() => expect(clearCurrentWindowEffects).toHaveBeenCalledTimes(1));

    expect(isLiquidGlassSupported).not.toHaveBeenCalled();
    expect(setLiquidGlassEnabled).not.toHaveBeenCalled();
  });

  it("enables liquid glass on supported desktop platforms", async () => {
    vi.mocked(isLiquidGlassSupported).mockResolvedValueOnce(true);

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: false,
      }),
    );
    await waitFor(() => expect(setLiquidGlassEnabled).toHaveBeenCalledWith(true, 16));

    expect(clearCurrentWindowEffects).toHaveBeenCalledTimes(1);
    expect(isLiquidGlassSupported).toHaveBeenCalledTimes(1);
    expect(applyCurrentWindowHudEffect).not.toHaveBeenCalled();
  });

  it("falls back to HUD effect when liquid glass is not supported", async () => {
    vi.mocked(isLiquidGlassSupported).mockResolvedValueOnce(false);

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: false,
      }),
    );
    await waitFor(() => expect(applyCurrentWindowHudEffect).toHaveBeenCalledWith(16));

    expect(isLiquidGlassSupported).toHaveBeenCalledTimes(1);
    expect(setLiquidGlassEnabled).not.toHaveBeenCalled();
  });

  it("logs support errors and still applies HUD fallback on desktop", async () => {
    vi.mocked(isLiquidGlassSupported).mockRejectedValueOnce(new Error("support boom"));
    const onDebug = vi.fn();

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: false,
        onDebug,
      }),
    );
    await waitFor(() =>
      expect(onDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "liquid-glass/is-supported-error",
          payload: "support boom",
        }),
      ),
    );

    expect(applyCurrentWindowHudEffect).toHaveBeenCalledWith(16);
  });

  it("logs disable errors in reduce-transparency desktop flow", async () => {
    vi.mocked(setLiquidGlassEnabled).mockRejectedValueOnce(new Error("disable boom"));
    const onDebug = vi.fn();

    renderHook(() =>
      useLiquidGlassEffect({
        reduceTransparency: true,
        onDebug,
      }),
    );
    await waitFor(() =>
      expect(onDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "liquid-glass/disable-error",
          payload: "disable boom",
        }),
      ),
    );

    expect(clearCurrentWindowEffects).toHaveBeenCalledTimes(1);
    expect(setLiquidGlassEnabled).toHaveBeenCalledWith(false);
  });
});
