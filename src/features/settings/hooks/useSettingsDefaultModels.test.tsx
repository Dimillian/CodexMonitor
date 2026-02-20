// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { connectWorkspace, getConfigModel, getModelList } from "@services/tauri";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";

vi.mock("@services/tauri", () => ({
  connectWorkspace: vi.fn(),
  getConfigModel: vi.fn(),
  getModelList: vi.fn(),
}));

const connectWorkspaceMock = vi.mocked(connectWorkspace);
const getConfigModelMock = vi.mocked(getConfigModel);
const getModelListMock = vi.mocked(getModelList);

function workspace(id: string, connected = true): WorkspaceInfo {
  return {
    id,
    name: `Workspace ${id}`,
    path: `/tmp/${id}`,
    connected,
    settings: { sidebarCollapsed: false },
  };
}

function modelListResponse(model: string) {
  return {
    result: {
      data: [
        {
          id: model,
          model,
          displayName: model,
          description: "",
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          isDefault: false,
        },
      ],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSettingsDefaultModels", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates in-flight results when workspace list becomes empty", async () => {
    const pending = deferred<any>();
    getModelListMock.mockReturnValueOnce(pending.promise);
    getConfigModelMock.mockResolvedValueOnce(null);

    const { result, rerender } = renderHook(
      ({ projects }: { projects: WorkspaceInfo[] }) => useSettingsDefaultModels(projects),
      {
        initialProps: {
          projects: [workspace("w1", true)],
        },
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
      expect(result.current.connectedWorkspaceCount).toBe(1);
    });

    rerender({ projects: [] });

    await waitFor(() => {
      expect(result.current.models).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.connectedWorkspaceCount).toBe(0);
    });

    await act(async () => {
      pending.resolve(modelListResponse("gpt-5"));
      await Promise.resolve();
    });

    expect(result.current.models).toEqual([]);
    expect(result.current.connectedWorkspaceCount).toBe(0);
  });

  it("ignores stale results when the first workspace changes", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    getModelListMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    getConfigModelMock.mockResolvedValue(null);

    const { result, rerender } = renderHook(
      ({ projects }: { projects: WorkspaceInfo[] }) => useSettingsDefaultModels(projects),
      {
        initialProps: {
          projects: [workspace("w1", true)],
        },
      },
    );

    await waitFor(() => {
      expect(getModelListMock).toHaveBeenCalledWith("w1");
    });

    rerender({ projects: [workspace("w2", true)] });

    await waitFor(() => {
      expect(getModelListMock).toHaveBeenCalledWith("w2");
    });

    await act(async () => {
      second.resolve(modelListResponse("gpt-5.1"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.models[0]?.model).toBe("gpt-5.1");
    });

    await act(async () => {
      first.resolve(modelListResponse("gpt-4.1"));
      await Promise.resolve();
    });

    expect(result.current.models[0]?.model).toBe("gpt-5.1");
  });

  it("uses the first workspace as the model source even when disconnected", async () => {
    connectWorkspaceMock.mockResolvedValueOnce(undefined);
    getConfigModelMock.mockResolvedValueOnce(null);
    getModelListMock.mockResolvedValueOnce(modelListResponse("gpt-5.1"));

    const { result } = renderHook(
      ({ projects }: { projects: WorkspaceInfo[] }) => useSettingsDefaultModels(projects),
      {
        initialProps: {
          projects: [workspace("w1", false), workspace("w2", true)],
        },
      },
    );

    await waitFor(() => {
      expect(connectWorkspaceMock).toHaveBeenCalledWith("w1");
      expect(getModelListMock).toHaveBeenCalledWith("w1");
      expect(getModelListMock).not.toHaveBeenCalledWith("w2");
      expect(result.current.models[0]?.model).toBe("gpt-5.1");
    });
  });

  it("falls back to config model when model list cannot be fetched", async () => {
    connectWorkspaceMock.mockRejectedValueOnce(new Error("connect failed"));
    getConfigModelMock.mockResolvedValueOnce("gpt-5-codex");

    const { result } = renderHook(
      ({ projects }: { projects: WorkspaceInfo[] }) => useSettingsDefaultModels(projects),
      {
        initialProps: {
          projects: [workspace("w1", false)],
        },
      },
    );

    await waitFor(() => {
      expect(result.current.models[0]?.model).toBe("gpt-5-codex");
      expect(result.current.models[0]?.displayName).toContain("(config)");
      expect(getModelListMock).not.toHaveBeenCalled();
    });
  });
});
