// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushErrorToast } from "@/services/toasts";
import type { AccessMode, AppSettings } from "@/types";
import type { PendingNewThreadSeed } from "@threads/utils/threadCodexParamsSeed";
import {
  useThreadCodexSyncOrchestration,
  useThreadSelectionHandlersOrchestration,
} from "./useThreadOrchestration";

vi.mock("@/services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

type SelectionParams = Parameters<typeof useThreadSelectionHandlersOrchestration>[0];
type SyncParams = Parameters<typeof useThreadCodexSyncOrchestration>[0];

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

function makeSyncParams(
  overrides: Partial<Omit<SyncParams, "getThreadCodexParams" | "patchThreadCodexParams">> = {},
): SyncParams & {
  getThreadCodexParams: ReturnType<typeof vi.fn>;
  patchThreadCodexParams: ReturnType<typeof vi.fn>;
} {
  const getThreadCodexParams = vi.fn(() => null);
  const patchThreadCodexParams = vi.fn();

  return {
    activeWorkspaceId: "ws-1",
    activeThreadId: "thread-2",
    appSettings: {
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
    },
    threadCodexParamsVersion: 0,
    getThreadCodexParams,
    patchThreadCodexParams,
    setThreadCodexSelectionKey: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    setAccessMode: vi.fn() as unknown as Dispatch<SetStateAction<AccessMode>>,
    setPreferredModelId: vi.fn() as unknown as Dispatch<SetStateAction<string | null>>,
    setPreferredEffort: vi.fn() as unknown as Dispatch<SetStateAction<string | null>>,
    setPreferredCollabModeId: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    setPreferredCodexArgsOverride: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    activeThreadIdRef: { current: null } as MutableRefObject<string | null>,
    pendingNewThreadSeedRef: {
      current: null,
    } as MutableRefObject<PendingNewThreadSeed | null>,
    selectedModelId: "gpt-5",
    resolvedEffort: "high",
    accessMode: "full-access",
    selectedCollaborationModeId: "default",
    ...overrides,
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

describe("useThreadCodexSyncOrchestration seed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves inherit semantics when seeding unseeded thread scope", async () => {
    const params = makeSyncParams();

    renderHook(() => useThreadCodexSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadCodexParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadCodexParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ codexArgsOverride: undefined }),
    );
  });

  it("seeds codex args from pending thread seed when available", async () => {
    const params = makeSyncParams({
      pendingNewThreadSeedRef: {
        current: {
          workspaceId: "ws-1",
          collaborationModeId: "plan",
          accessMode: "read-only",
          codexArgsOverride: "--profile pending",
        },
      } as MutableRefObject<PendingNewThreadSeed | null>,
    });

    renderHook(() => useThreadCodexSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadCodexParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadCodexParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ codexArgsOverride: "--profile pending" }),
    );
  });

  it("seeds selected codex args override when creating thread outside pending flow", async () => {
    const params = makeSyncParams({
      selectedCodexArgsOverride: "--profile selected",
    });

    renderHook(() => useThreadCodexSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadCodexParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadCodexParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ codexArgsOverride: "--profile selected" }),
    );
  });

  it("preserves explicit default codex args selection when creating thread outside pending flow", async () => {
    const params = makeSyncParams({
      selectedCodexArgsOverride: null,
    });

    renderHook(() => useThreadCodexSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadCodexParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadCodexParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ codexArgsOverride: null }),
    );
  });

  it("syncs selected codex args from no-thread fallback when thread scope is inherit", async () => {
    const params = makeSyncParams();
    params.getThreadCodexParams.mockImplementation(
      (_workspaceId: string, threadId: string) => {
        if (threadId === "thread-2") {
          return {
            modelId: null,
            effort: null,
            accessMode: null,
            collaborationModeId: null,
            codexArgsOverride: undefined,
            updatedAt: 1,
          };
        }
        if (threadId === "__no_thread__") {
          return {
            modelId: null,
            effort: null,
            accessMode: null,
            collaborationModeId: null,
            codexArgsOverride: "--profile inherited",
            updatedAt: 2,
          };
        }
        return null;
      },
    );

    renderHook(() => useThreadCodexSyncOrchestration(params));

    await waitFor(() => {
      expect(params.setPreferredCodexArgsOverride).toHaveBeenCalledWith(
        "--profile inherited",
      );
    });

    expect(params.patchThreadCodexParams).not.toHaveBeenCalled();
  });
});
