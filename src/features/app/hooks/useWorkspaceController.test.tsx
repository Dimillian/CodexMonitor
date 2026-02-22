// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ask, message } from "@tauri-apps/plugin-dialog";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import {
  addWorkspace,
  isWorkspacePathDir,
  listWorkspaces,
  pickWorkspacePaths,
  removeWorkspace,
} from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { useWorkspaceController } from "./useWorkspaceController";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  message: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  addClone: vi.fn(),
  addWorkspace: vi.fn(),
  addWorkspaceFromGitUrl: vi.fn(),
  addWorktree: vi.fn(),
  connectWorkspace: vi.fn(),
  isWorkspacePathDir: vi.fn(),
  listWorkspaces: vi.fn(),
  pickWorkspacePaths: vi.fn(),
  removeWorkspace: vi.fn(),
  removeWorktree: vi.fn(),
  renameWorktree: vi.fn(),
  renameWorktreeUpstream: vi.fn(),
  updateWorkspaceCodexBin: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("../../../utils/platformPaths", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/platformPaths")>(
    "../../../utils/platformPaths",
  );
  return {
    ...actual,
    isMobilePlatform: vi.fn(() => false),
  };
});

const workspaceOne: WorkspaceInfo = {
  id: "ws-1",
  name: "workspace-one",
  path: "/tmp/ws-1",
  connected: true,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: { sidebarCollapsed: false, groupId: null },
};

const workspaceTwo: WorkspaceInfo = {
  id: "ws-2",
  name: "workspace-two",
  path: "/tmp/ws-2",
  connected: true,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: { sidebarCollapsed: false, groupId: null },
};

const baseAppSettings = {
  ...({} as AppSettings),
  codexBin: null,
  backendMode: "local",
  workspaceGroups: [],
} as AppSettings;

describe("useWorkspaceController dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMobilePlatform).mockReturnValue(false);
  });

  it("shows add-workspaces summary in controller layer", async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([workspaceOne]);
    vi.mocked(pickWorkspacePaths).mockResolvedValue([workspaceOne.path, workspaceTwo.path]);
    vi.mocked(isWorkspacePathDir).mockResolvedValue(true);
    vi.mocked(addWorkspace).mockResolvedValue(workspaceTwo);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: baseAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let added: WorkspaceInfo | null = null;
    await act(async () => {
      added = await result.current.addWorkspace();
    });

    expect(added).toMatchObject({ id: workspaceTwo.id });
    expect(message).toHaveBeenCalledTimes(1);
    const [summary] = vi.mocked(message).mock.calls[0];
    expect(String(summary)).toContain("Skipped 1 already added workspace");
  });

  it("collects server paths via modal prompt on mobile remote before adding", async () => {
    const remoteAppSettings = {
      ...baseAppSettings,
      backendMode: "remote",
    } as AppSettings;
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);
    vi.mocked(isWorkspacePathDir).mockResolvedValue(true);
    vi.mocked(addWorkspace).mockResolvedValue(workspaceOne);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: remoteAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let addPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    act(() => {
      addPromise = result.current.addWorkspace();
    });

    expect(result.current.workspacePathsPrompt).toEqual({
      value: "",
      error: null,
    });

    act(() => {
      result.current.updateWorkspacePathsPromptValue("/srv/repos/my-project");
      result.current.confirmWorkspacePathsPrompt();
    });

    await act(async () => {
      await addPromise;
    });

    await expect(addPromise).resolves.toMatchObject({ id: workspaceOne.id });
    expect(addWorkspace).toHaveBeenCalledWith("/srv/repos/my-project", null);
    expect(pickWorkspacePaths).not.toHaveBeenCalled();
  });

  it("keeps the mobile remote path prompt open for empty input", async () => {
    const remoteAppSettings = {
      ...baseAppSettings,
      backendMode: "remote",
    } as AppSettings;
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: remoteAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let addPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    act(() => {
      addPromise = result.current.addWorkspace();
    });
    let resolved = false;
    addPromise = addPromise.then((value) => {
      resolved = true;
      return value;
    });

    act(() => {
      result.current.updateWorkspacePathsPromptValue("  , ;\n");
      result.current.confirmWorkspacePathsPrompt();
    });

    expect(result.current.workspacePathsPrompt?.error).toBe(
      "Enter at least one absolute path.",
    );
    expect(resolved).toBe(false);

    await act(async () => {
      result.current.cancelWorkspacePathsPrompt();
      await addPromise;
    });

    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the mobile remote path prompt open for non-absolute paths", async () => {
    const remoteAppSettings = {
      ...baseAppSettings,
      backendMode: "remote",
    } as AppSettings;
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: remoteAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let addPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    act(() => {
      addPromise = result.current.addWorkspace();
    });

    act(() => {
      result.current.updateWorkspacePathsPromptValue("relative/path");
      result.current.confirmWorkspacePathsPrompt();
    });

    expect(result.current.workspacePathsPrompt?.error).toBe("Use absolute paths only.");

    await act(async () => {
      result.current.cancelWorkspacePathsPrompt();
      await addPromise;
    });

    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("shows feedback when add workspace is triggered while prompt is already open", async () => {
    const remoteAppSettings = {
      ...baseAppSettings,
      backendMode: "remote",
    } as AppSettings;
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: remoteAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let firstAddPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    let secondAddPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);

    act(() => {
      firstAddPromise = result.current.addWorkspace();
    });
    act(() => {
      secondAddPromise = result.current.addWorkspace();
    });

    await expect(secondAddPromise).resolves.toBeNull();
    expect(pushErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Add workspaces",
      }),
    );
    expect(result.current.workspacePathsPrompt).toEqual({
      value: "",
      error: null,
    });

    await act(async () => {
      result.current.cancelWorkspacePathsPrompt();
      await firstAddPromise;
    });
  });

  it("confirms workspace deletion and reports service errors", async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([workspaceOne]);
    vi.mocked(ask).mockResolvedValue(true);
    vi.mocked(removeWorkspace).mockRejectedValue(new Error("delete failed"));

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: baseAppSettings,
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.removeWorkspace(workspaceOne.id);
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(removeWorkspace).toHaveBeenCalledWith(workspaceOne.id);
    expect(message).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(message).mock.calls[0];
    expect(options).toEqual(
      expect.objectContaining({ title: "Delete workspace failed", kind: "error" }),
    );
  });
});
