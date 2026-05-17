// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushErrorToast } from "@/services/toasts";
import type { AccessMode, AppSettings } from "@/types";
import type { PendingNewThreadSeed } from "@threads/utils/threadOpenCodeParamsSeed";
import {
  useThreadOpenCodeSyncOrchestration,
  useThreadSelectionHandlersOrchestration,
  useThreadUiOrchestration,
} from "./useThreadOrchestration";

vi.mock("@/services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

type SelectionParams = Parameters<typeof useThreadSelectionHandlersOrchestration>[0];
type SyncParams = Parameters<typeof useThreadOpenCodeSyncOrchestration>[0];

function makeSelectionParams(): SelectionParams & {
  persistThreadOpenCodeParams: ReturnType<typeof vi.fn>;
  setSelectedOpenCodeArgsOverride: ReturnType<typeof vi.fn>;
} {
  const setAppSettings = vi.fn() as unknown as Dispatch<SetStateAction<AppSettings>>;
  const setAccessMode = vi.fn() as unknown as Dispatch<SetStateAction<AccessMode>>;
  const activeThreadIdRef = { current: null } as MutableRefObject<string | null>;
  const persistThreadOpenCodeParams = vi.fn();
  const setSelectedOpenCodeArgsOverride = vi.fn();

  return {
    appSettingsLoading: false,
    setAppSettings,
    queueSaveSettings: vi.fn(async () => undefined),
    activeThreadIdRef,
    setSelectedModelId: vi.fn(),
    setSelectedEffort: vi.fn(),
    setSelectedServiceTier: vi.fn(),
    setSelectedCollaborationModeId: vi.fn(),
    setAccessMode,
    setSelectedOpenCodeArgsOverride,
    persistThreadOpenCodeParams,
  };
}

function makeSyncParams(
  overrides: Partial<Omit<SyncParams, "getThreadOpenCodeParams" | "patchThreadOpenCodeParams">> = {},
): SyncParams & {
  getThreadOpenCodeParams: ReturnType<typeof vi.fn>;
  patchThreadOpenCodeParams: ReturnType<typeof vi.fn>;
} {
  const getThreadOpenCodeParams = vi.fn(() => null);
  const patchThreadOpenCodeParams = vi.fn();

  return {
    activeWorkspaceId: "ws-1",
    activeThreadId: "thread-2",
    appSettings: {
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
    },
    threadOpenCodeParamsVersion: 0,
    getThreadOpenCodeParams,
    patchThreadOpenCodeParams,
    setThreadOpenCodeSelectionKey: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    setAccessMode: vi.fn() as unknown as Dispatch<SetStateAction<AccessMode>>,
    setPreferredModelId: vi.fn() as unknown as Dispatch<SetStateAction<string | null>>,
    setPreferredEffort: vi.fn() as unknown as Dispatch<SetStateAction<string | null>>,
    setPreferredServiceTier: vi.fn() as unknown as Dispatch<
      SetStateAction<"fast" | "flex" | null | undefined>
    >,
    setPreferredCollabModeId: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    setPreferredOpenCodeArgsOverride: vi.fn() as unknown as Dispatch<
      SetStateAction<string | null>
    >,
    activeThreadIdRef: { current: null } as MutableRefObject<string | null>,
    pendingNewThreadSeedRef: {
      current: null,
    } as MutableRefObject<PendingNewThreadSeed | null>,
    selectedModelId: "gpt-5",
    resolvedEffort: "high",
    selectedServiceTier: undefined,
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
      result.current.handleSelectOpenCodeArgsOverride(
        "--profile dev --model gpt-5 --sandbox workspace-write",
      );
    });

    expect(params.persistThreadOpenCodeParams).toHaveBeenCalledWith({
      opencodeArgsOverride: "--profile dev --model gpt-5 --sandbox workspace-write",
    });
    expect(params.setSelectedOpenCodeArgsOverride).toHaveBeenCalledWith(
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
      result.current.handleSelectOpenCodeArgsOverride("--profile dev --config codex.toml");
    });

    expect(params.persistThreadOpenCodeParams).toHaveBeenCalledWith({
      opencodeArgsOverride: "--profile dev --config codex.toml",
    });
    expect(pushErrorToast).not.toHaveBeenCalled();
  });

  it("persists service tier selections per thread", () => {
    const params = makeSelectionParams();
    const { result } = renderHook(() => useThreadSelectionHandlersOrchestration(params));

    act(() => {
      result.current.handleSelectServiceTier("fast");
    });

    expect(params.persistThreadOpenCodeParams).toHaveBeenCalledWith({
      serviceTier: "fast",
    });
  });

  it("normalizes smart quotes/dashes before persisting selected override", () => {
    const params = makeSelectionParams();
    const { result } = renderHook(() => useThreadSelectionHandlersOrchestration(params));

    act(() => {
      result.current.handleSelectOpenCodeArgsOverride("“—search —enable memory_tool”");
    });

    expect(params.persistThreadOpenCodeParams).toHaveBeenCalledWith({
      opencodeArgsOverride: "--search --enable memory_tool",
    });
    expect(params.setSelectedOpenCodeArgsOverride).toHaveBeenCalledWith(
      "--search --enable memory_tool",
    );
  });
});

describe("useThreadOpenCodeSyncOrchestration seed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves inherit semantics when seeding unseeded thread scope", async () => {
    const params = makeSyncParams();

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadOpenCodeParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadOpenCodeParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({
        opencodeArgsOverride: undefined,
        serviceTier: undefined,
      }),
    );
  });

  it("seeds codex args from pending thread seed when available", async () => {
    const params = makeSyncParams({
      pendingNewThreadSeedRef: {
        current: {
          workspaceId: "ws-1",
          serviceTier: "fast",
          collaborationModeId: "plan",
          accessMode: "read-only",
          opencodeArgsOverride: "--profile pending",
        },
      } as MutableRefObject<PendingNewThreadSeed | null>,
    });

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadOpenCodeParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadOpenCodeParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({
        opencodeArgsOverride: "--profile pending",
        serviceTier: "fast",
      }),
    );
  });

  it("seeds selected codex args override when creating thread outside pending flow", async () => {
    const params = makeSyncParams({
      selectedOpenCodeArgsOverride: "--profile selected",
    });

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadOpenCodeParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadOpenCodeParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ opencodeArgsOverride: "--profile selected" }),
    );
  });

  it("preserves explicit default codex args selection when creating thread outside pending flow", async () => {
    const params = makeSyncParams({
      selectedOpenCodeArgsOverride: null,
    });

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadOpenCodeParams).toHaveBeenCalledTimes(1);
    });

    expect(params.patchThreadOpenCodeParams).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      expect.objectContaining({ opencodeArgsOverride: null }),
    );
  });

  it("syncs selected codex args from no-thread fallback when thread scope is inherit", async () => {
    const params = makeSyncParams();
    params.getThreadOpenCodeParams.mockImplementation(
      (_workspaceId: string, threadId: string) => {
        if (threadId === "thread-2") {
          return {
            modelId: null,
            effort: null,
            accessMode: null,
            collaborationModeId: null,
            opencodeArgsOverride: undefined,
            updatedAt: 1,
          };
        }
        if (threadId === "__no_thread__") {
          return {
            modelId: null,
            effort: null,
            accessMode: null,
            collaborationModeId: null,
            opencodeArgsOverride: "--profile inherited",
            updatedAt: 2,
          };
        }
        return null;
      },
    );

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.setPreferredOpenCodeArgsOverride).toHaveBeenCalledWith(
        "--profile inherited",
      );
    });

    expect(params.patchThreadOpenCodeParams).not.toHaveBeenCalled();
  });

  it("backfills missing no-thread fast mode from the active thread selection", async () => {
    const params = makeSyncParams({
      selectedServiceTier: "fast",
    });

    renderHook(() => useThreadOpenCodeSyncOrchestration(params));

    await waitFor(() => {
      expect(params.patchThreadOpenCodeParams).toHaveBeenCalledWith(
        "ws-1",
        "__no_thread__",
        expect.objectContaining({ serviceTier: "fast" }),
      );
    });
  });
});

describe("useThreadUiOrchestration", () => {
  it("opens thread links in their source workspace", () => {
    const setActiveTab = vi.fn() as unknown as Dispatch<
      SetStateAction<"home" | "projects" | "opencode" | "git" | "log">
    >;
    const params = {
      activeWorkspaceId: "ws-1",
      activeThreadId: "thread-1",
      accessMode: "current" as const,
      selectedServiceTier: null,
      selectedCollaborationModeId: null,
      selectedOpenCodeArgsOverride: null,
      pendingNewThreadSeedRef: {
        current: null,
      } as MutableRefObject<PendingNewThreadSeed | null>,
      runWithDraftStart: vi.fn(async (runner: () => Promise<void>) => runner()),
      handleComposerSend: vi.fn(async () => undefined),
      clearDraftState: vi.fn(),
      exitDiffView: vi.fn(),
      resetPullRequestSelection: vi.fn(),
      selectWorkspace: vi.fn(),
      setActiveThreadId: vi.fn(),
      setActiveTab,
      isCompact: false,
      removeThread: vi.fn(),
      clearDraftForThread: vi.fn(),
      removeImagesForThread: vi.fn(),
    };

    const { result } = renderHook(() => useThreadUiOrchestration(params));

    act(() => {
      result.current.handleOpenThreadLink("thread-review-1", "ws-2");
    });

    expect(params.exitDiffView).toHaveBeenCalledTimes(1);
    expect(params.resetPullRequestSelection).toHaveBeenCalledTimes(1);
    expect(params.clearDraftState).toHaveBeenCalledTimes(1);
    expect(params.selectWorkspace).toHaveBeenCalledWith("ws-2");
    expect(params.setActiveThreadId).toHaveBeenCalledWith("thread-review-1", "ws-2");
  });
});
