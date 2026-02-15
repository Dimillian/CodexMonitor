// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushErrorToast } from "@/services/toasts";
import type { AccessMode, AppSettings } from "@/types";
import { useThreadSelectionHandlersOrchestration } from "./useThreadOrchestration";

vi.mock("@/services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

type SelectionParams = Parameters<typeof useThreadSelectionHandlersOrchestration>[0];

function makeSelectionParams(): SelectionParams & {
  persistThreadCodexParams: ReturnType<typeof vi.fn>;
  setSelectedCodexArgsOverride: ReturnType<typeof vi.fn>;
} {
  const setAppSettings = vi.fn() as unknown as Dispatch<SetStateAction<AppSettings>>;
  const setAccessMode = vi.fn() as unknown as Dispatch<SetStateAction<AccessMode>>;
  const activeThreadIdRef = { current: null } as MutableRefObject<string | null>;
  const persistThreadCodexParams = vi.fn();
  const setSelectedCodexArgsOverride = vi.fn();

  return {
    appSettingsLoading: false,
    setAppSettings,
    queueSaveSettings: vi.fn(async () => undefined),
    activeThreadIdRef,
    setSelectedModelId: vi.fn(),
    setSelectedEffort: vi.fn(),
    setSelectedCollaborationModeId: vi.fn(),
    setAccessMode,
    setSelectedCodexArgsOverride,
    persistThreadCodexParams,
  };
}

describe("useThreadSelectionHandlersOrchestration codex args selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pushes a warning toast when selected override includes ignored flags", () => {
    const params = makeSelectionParams();
    const { result } = renderHook(() => useThreadSelectionHandlersOrchestration(params));

    act(() => {
      result.current.handleSelectCodexArgsOverride(
        "--profile dev --model gpt-5 --sandbox workspace-write",
      );
    });

    expect(params.persistThreadCodexParams).toHaveBeenCalledWith({
      codexArgsOverride: "--profile dev --model gpt-5 --sandbox workspace-write",
    });
    expect(params.setSelectedCodexArgsOverride).toHaveBeenCalledWith(
      "--profile dev --model gpt-5 --sandbox workspace-write",
    );
    expect(pushErrorToast).toHaveBeenCalledTimes(1);
    expect(pushErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/ignored/i),
        message: expect.stringContaining("ignored for per-thread overrides"),
      }),
    );
  });

  it("does not push a warning toast when selected override only includes supported flags", () => {
    const params = makeSelectionParams();
    const { result } = renderHook(() => useThreadSelectionHandlersOrchestration(params));

    act(() => {
      result.current.handleSelectCodexArgsOverride("--profile dev --config codex.toml");
    });

    expect(params.persistThreadCodexParams).toHaveBeenCalledWith({
      codexArgsOverride: "--profile dev --config codex.toml",
    });
    expect(pushErrorToast).not.toHaveBeenCalled();
  });

  it("normalizes smart quotes/dashes before persisting selected override", () => {
    const params = makeSelectionParams();
    const { result } = renderHook(() => useThreadSelectionHandlersOrchestration(params));

    act(() => {
      result.current.handleSelectCodexArgsOverride("“—search —enable memory_tool”");
    });

    expect(params.persistThreadCodexParams).toHaveBeenCalledWith({
      codexArgsOverride: "--search --enable memory_tool",
    });
    expect(params.setSelectedCodexArgsOverride).toHaveBeenCalledWith(
      "--search --enable memory_tool",
    );
  });
});
