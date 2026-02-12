// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { message } from "@tauri-apps/plugin-dialog";
import type { WorkspaceInfo } from "../../../types";
import {
  addWorkspace,
  isWorkspacePathDir,
  listWorkspaces,
  pickWorkspacePaths,
  renameWorktree,
  renameWorktreeUpstream,
  updateWorkspaceSettings,
} from "../../../services/tauri";
import { useWorkspaces } from "./useWorkspaces";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  message: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  listWorkspaces: vi.fn(),
  renameWorktree: vi.fn(),
  renameWorktreeUpstream: vi.fn(),
  addClone: vi.fn(),
  addWorkspace: vi.fn(),
  addWorktree: vi.fn(),
  connectWorkspace: vi.fn(),
  isWorkspacePathDir: vi.fn(),
  pickWorkspacePaths: vi.fn(),
  removeWorkspace: vi.fn(),
  removeWorktree: vi.fn(),
  updateWorkspaceCodexBin: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const worktree: WorkspaceInfo = {
  id: "wt-1",
  name: "feature/old",
  path: "/tmp/wt-1",
  connected: true,
  kind: "worktree",
  parentId: "parent-1",
  worktree: { branch: "feature/old" },
  settings: { sidebarCollapsed: false },
};

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

describe("useWorkspaces.renameWorktree", () => {
  it("optimistically updates and reconciles on success", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeMock = vi.mocked(renameWorktree);
    listWorkspacesMock.mockResolvedValue([worktree]);

    let resolveRename: (value: WorkspaceInfo) => void = () => {};
    const renamePromise = new Promise<WorkspaceInfo>((resolve) => {
      resolveRename = resolve;
    });
    renameWorktreeMock.mockReturnValue(renamePromise);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let renameCall: Promise<WorkspaceInfo>;
    act(() => {
      renameCall = result.current.renameWorktree("wt-1", "feature/new");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workspaces[0].name).toBe("feature/new");
    expect(result.current.workspaces[0].worktree?.branch).toBe("feature/new");

    resolveRename({
      ...worktree,
      name: "feature/new",
      path: "/tmp/wt-1-renamed",
      worktree: { branch: "feature/new" },
    });

    await act(async () => {
      await renameCall;
    });

    expect(result.current.workspaces[0].path).toBe("/tmp/wt-1-renamed");
  });

  it("rolls back optimistic update on failure", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeMock = vi.mocked(renameWorktree);
    listWorkspacesMock.mockResolvedValue([worktree]);
    let rejectRename: (error: Error) => void = () => {};
    const renamePromise = new Promise<WorkspaceInfo>((_, reject) => {
      rejectRename = reject;
    });
    renameWorktreeMock.mockReturnValue(renamePromise);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let renameCall: Promise<WorkspaceInfo>;
    act(() => {
      renameCall = result.current.renameWorktree("wt-1", "feature/new");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workspaces[0].name).toBe("feature/new");

    rejectRename(new Error("rename failed"));

    await act(async () => {
      try {
        await renameCall;
      } catch {
        // Expected rejection.
      }
    });

    expect(result.current.workspaces[0].name).toBe("feature/old");
    expect(result.current.workspaces[0].worktree?.branch).toBe("feature/old");
  });

  it("exposes upstream rename helper", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeUpstreamMock = vi.mocked(renameWorktreeUpstream);
    listWorkspacesMock.mockResolvedValue([worktree]);
    renameWorktreeUpstreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.renameWorktreeUpstream(
        "wt-1",
        "feature/old",
        "feature/new",
      );
    });

    expect(renameWorktreeUpstreamMock).toHaveBeenCalledWith(
      "wt-1",
      "feature/old",
      "feature/new",
    );
  });
});

describe("useWorkspaces.updateWorkspaceSettings", () => {
  it("does not throw when multiple updates are queued in the same tick", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const updateWorkspaceSettingsMock = vi.mocked(updateWorkspaceSettings);
    listWorkspacesMock.mockResolvedValue([workspaceOne, workspaceTwo]);
    updateWorkspaceSettingsMock.mockImplementation(async (workspaceId, settings) => {
      const base = workspaceId === workspaceOne.id ? workspaceOne : workspaceTwo;
      return { ...base, settings };
    });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let updatePromise: Promise<WorkspaceInfo[]>;
    act(() => {
      updatePromise = Promise.all([
        result.current.updateWorkspaceSettings(workspaceOne.id, {
          sidebarCollapsed: true,
        }),
        result.current.updateWorkspaceSettings(workspaceTwo.id, {
          sidebarCollapsed: true,
        }),
      ]);
    });

    await act(async () => {
      await updatePromise;
    });

    expect(updateWorkspaceSettingsMock).toHaveBeenCalledTimes(2);
    expect(
      result.current.workspaces.find((entry) => entry.id === workspaceOne.id)
        ?.settings.sidebarCollapsed,
    ).toBe(true);
    expect(
      result.current.workspaces.find((entry) => entry.id === workspaceTwo.id)
        ?.settings.sidebarCollapsed,
    ).toBe(true);
  });
});

describe("useWorkspaces.addWorkspaceFromPath", () => {
  it("adds a workspace and sets it active", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const addWorkspaceMock = vi.mocked(addWorkspace);
    listWorkspacesMock.mockResolvedValue([]);
    addWorkspaceMock.mockResolvedValue({
      id: "workspace-1",
      name: "repo",
      path: "/tmp/repo",
      connected: true,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false },
    });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.addWorkspaceFromPath("/tmp/repo");
    });

    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/repo", null);
    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.activeWorkspaceId).toBe("workspace-1");
  });
});

describe("useWorkspaces.addWorkspace (bulk)", () => {
  it("adds multiple workspaces and activates the first", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const pickWorkspacePathsMock = vi.mocked(pickWorkspacePaths);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);
    const messageMock = vi.mocked(message);

    listWorkspacesMock.mockResolvedValue([]);
    pickWorkspacePathsMock.mockResolvedValue(["/tmp/ws-1", "/tmp/ws-2"]);
    isWorkspacePathDirMock.mockResolvedValue(true);
    addWorkspaceMock
      .mockResolvedValueOnce({ ...workspaceOne, id: "added-1", path: "/tmp/ws-1" })
      .mockResolvedValueOnce({ ...workspaceTwo, id: "added-2", path: "/tmp/ws-2" });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.addWorkspace();
    });

    expect(addWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/ws-1", null);
    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/ws-2", null);
    expect(result.current.workspaces).toHaveLength(2);
    expect(result.current.activeWorkspaceId).toBe("added-1");
    expect(messageMock).not.toHaveBeenCalled();
  });

  it("shows a summary when some selections are skipped or fail", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const pickWorkspacePathsMock = vi.mocked(pickWorkspacePaths);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);
    const messageMock = vi.mocked(message);

    listWorkspacesMock.mockResolvedValue([workspaceOne]);
    pickWorkspacePathsMock.mockResolvedValue([workspaceOne.path, workspaceTwo.path]);
    isWorkspacePathDirMock.mockResolvedValue(true);
    addWorkspaceMock.mockResolvedValue(workspaceTwo);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.addWorkspace();
    });

    expect(addWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(addWorkspaceMock).toHaveBeenCalledWith(workspaceTwo.path, null);
    expect(messageMock).toHaveBeenCalledTimes(1);
    const [summary, options] = messageMock.mock.calls[0];
    expect(String(summary)).toContain("Skipped 1 already added workspace");
    expect(options).toEqual(
      expect.objectContaining({ title: "Some workspaces were skipped", kind: "warning" }),
    );
  });
});
