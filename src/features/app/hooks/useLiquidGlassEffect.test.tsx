/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useLiquidGlassEffect } from "./useLiquidGlassEffect";
import { isGlassSupported, setLiquidGlassEffect } from "tauri-plugin-liquid-glass-api";
import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";

vi.mock("tauri-plugin-liquid-glass-api", () => ({
  isGlassSupported: vi.fn(),
  setLiquidGlassEffect: vi.fn(),
  GlassMaterialVariant: {
    Regular: "regular",
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  Effect: {
    Acrylic: "acrylic",
    HudWindow: "hud-window",
  },
  EffectState: {
    Active: "active",
  },
  getCurrentWindow: vi.fn(),
}));

describe("useLiquidGlassEffect", () => {
  const originalUserAgent = navigator.userAgent;
  let mockSetEffects: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetEffects = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getCurrentWindow).mockReturnValue({
      setEffects: mockSetEffects,
    } as any);
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  const setUserAgent = (ua: string) => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: ua,
      configurable: true,
    });
  };

  it("clears effects when reduceTransparency is true", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(true);

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: true }));

    await waitFor(() => {
      expect(mockSetEffects).toHaveBeenCalledWith({ effects: [] });
      expect(setLiquidGlassEffect).toHaveBeenCalledWith({ enabled: false });
    });
  });

  it("applies liquid glass plugin if supported", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(true);

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: false }));

    await waitFor(() => {
      expect(mockSetEffects).toHaveBeenCalledWith({ effects: [] });
      expect(setLiquidGlassEffect).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });
  });

  it("applies Acrylic effect on Windows when liquid glass is unsupported", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(false);
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: false }));

    await waitFor(() => {
      expect(mockSetEffects).toHaveBeenCalledWith({
        effects: [Effect.Acrylic],
        state: EffectState.Active,
      });
      expect(setLiquidGlassEffect).not.toHaveBeenCalled();
    });
  });

  it("applies HudWindow effect on macOS when liquid glass is unsupported", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(false);
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: false }));

    await waitFor(() => {
      expect(mockSetEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          effects: [Effect.HudWindow],
        })
      );
    });
  });

  it("applies HudWindow effect on Linux when liquid glass is unsupported", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(false);
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: false }));

    await waitFor(() => {
      expect(mockSetEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          effects: [Effect.HudWindow],
        })
      );
    });
  });

  it("does not apply any effect on unknown OS when liquid glass is unsupported", async () => {
    vi.mocked(isGlassSupported).mockResolvedValue(false);
    setUserAgent("Mozilla/5.0 (UnknownOS)");

    renderHook(() => useLiquidGlassEffect({ reduceTransparency: false }));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });
});
