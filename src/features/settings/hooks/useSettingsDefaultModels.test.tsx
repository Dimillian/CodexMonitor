// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getModelList } from "../../../services/tauri";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";

vi.mock("../../../services/tauri", () => ({
  getModelList: vi.fn(),
}));

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

  it("invalidates in-flight results when connected workspaces drop to zero", async () => {
    const pending = deferred<any>();
    getModelListMock.mockReturnValueOnce(pending.promise);

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

    rerender({ projects: [workspace("w1", false)] });

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

  it("ignores stale results when the connected workspace set changes", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    getModelListMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

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
});
