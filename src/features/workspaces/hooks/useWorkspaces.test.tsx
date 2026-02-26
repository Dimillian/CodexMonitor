// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import {
  addWorkspace,
  addWorkspaceFromGitUrl,
  connectWorkspace as connectWorkspaceService,
  isWorkspacePathDir,
  listWorkspaces,
  renameWorktree,
  renameWorktreeUpstream,
  updateWorkspaceSettings,
} from "../../../services/tauri";
import { useWorkspaces } from "./useWorkspaces";

vi.mock("../../../services/tauri", () => ({
  listWorkspaces: vi.fn(),
  renameWorktree: vi.fn(),
  renameWorktreeUpstream: vi.fn(),
  addClone: vi.fn(),
  addWorkspace: vi.fn(),
  addWorkspaceFromGitUrl: vi.fn(),
  addWorktree: vi.fn(),
  connectWorkspace: vi.fn(),
  isWorkspacePathDir: vi.fn(),
  pickWorkspacePaths: vi.fn(),
  removeWorkspace: vi.fn(),
  removeWorktree: vi.fn(),
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

    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/repo");
    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.activeWorkspaceId).toBe("workspace-1");
  });
});

describe("useWorkspaces.connectWorkspace", () => {
  it("marks workspace as connected after a successful connect", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const connectWorkspaceMock = vi.mocked(connectWorkspaceService);
    listWorkspacesMock.mockResolvedValue([
      {
        ...workspaceOne,
        connected: false,
      },
    ]);
    connectWorkspaceMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.connectWorkspace({
        ...workspaceOne,
        connected: false,
      });
    });

    expect(connectWorkspaceMock).toHaveBeenCalledWith(workspaceOne.id);
    expect(
      result.current.workspaces.find((entry) => entry.id === workspaceOne.id)
        ?.connected,
    ).toBe(true);
  });
});

describe("useWorkspaces.addWorkspacesFromPaths", () => {
  it("adds multiple workspaces, activates the first, and returns structured result", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([]);
    isWorkspacePathDirMock.mockResolvedValue(true);
    addWorkspaceMock
      .mockResolvedValueOnce({ ...workspaceOne, id: "added-1", path: "/tmp/ws-1" })
      .mockResolvedValueOnce({ ...workspaceTwo, id: "added-2", path: "/tmp/ws-2" });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths(["/tmp/ws-1", "/tmp/ws-2"]);
    });

    expect(addWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/ws-1");
    expect(addWorkspaceMock).toHaveBeenCalledWith("/tmp/ws-2");
    expect(result.current.workspaces).toHaveLength(2);
    expect(result.current.activeWorkspaceId).toBe("added-1");
    expect(addResult!.firstAdded?.id).toBe("added-1");
    expect(addResult!.added).toHaveLength(2);
    expect(addResult!.skippedExisting).toHaveLength(0);
    expect(addResult!.skippedInvalid).toHaveLength(0);
    expect(addResult!.failures).toHaveLength(0);
  });

  it("returns skipped and failure details without UI side effects", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([workspaceOne]);
    isWorkspacePathDirMock.mockImplementation(async (path: string) => path !== "/tmp/not-a-dir");
    addWorkspaceMock.mockResolvedValue(workspaceTwo);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths([
        workspaceOne.path,
        "/tmp/not-a-dir",
        workspaceTwo.path,
      ]);
    });

    expect(addWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(addWorkspaceMock).toHaveBeenCalledWith(workspaceTwo.path);
    expect(addResult!.added).toHaveLength(1);
    expect(addResult!.firstAdded?.id).toBe(workspaceTwo.id);
    expect(addResult!.skippedExisting).toEqual([workspaceOne.path]);
    expect(addResult!.skippedInvalid).toEqual(["/tmp/not-a-dir"]);
    expect(addResult!.failures).toHaveLength(0);
  });

  it("tries raw tilde paths before inferred home-prefix expansion", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([
      {
        ...workspaceOne,
        id: "existing",
        path: "/Users/vlad/dev/existing",
      },
    ]);
    isWorkspacePathDirMock.mockImplementation(async (path: string) => path === "~/dev/personal");
    addWorkspaceMock.mockResolvedValue({
      ...workspaceTwo,
      id: "added-home",
      path: "/Users/vlad/dev/personal",
    });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths(["~/dev/personal"]);
    });

    expect(isWorkspacePathDirMock).toHaveBeenCalledWith("~/dev/personal");
    expect(isWorkspacePathDirMock).not.toHaveBeenCalledWith("/Users/vlad/dev/personal");
    expect(addWorkspaceMock).toHaveBeenCalledWith("~/dev/personal");
    expect(addWorkspaceMock).not.toHaveBeenCalledWith("/Users/vlad/dev/personal");
    expect(addResult!.added).toHaveLength(1);
    expect(addResult!.skippedInvalid).toHaveLength(0);
    expect(addResult!.failures).toHaveLength(0);
  });

  it("skips raw tilde paths when an equivalent inferred path already exists", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([
      {
        ...workspaceOne,
        id: "existing-home",
        path: "/Users/vlad/dev/personal",
      },
    ]);
    isWorkspacePathDirMock.mockImplementation(async (path: string) => path === "~/dev/personal");

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths(["~/dev/personal"]);
    });

    expect(isWorkspacePathDirMock).toHaveBeenCalledWith("~/dev/personal");
    expect(isWorkspacePathDirMock).toHaveBeenCalledWith("/Users/vlad/dev/personal");
    expect(addWorkspaceMock).not.toHaveBeenCalled();
    expect(addResult!.added).toHaveLength(0);
    expect(addResult!.skippedExisting).toEqual(["~/dev/personal"]);
    expect(addResult!.skippedInvalid).toHaveLength(0);
    expect(addResult!.failures).toHaveLength(0);
  });

  it("falls back to inferred home-prefix expansion when raw tilde path is invalid", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([
      {
        ...workspaceOne,
        id: "existing",
        path: "/Users/vlad/dev/existing",
      },
    ]);
    isWorkspacePathDirMock.mockImplementation(async (path: string) => path === "/Users/vlad/dev/personal");
    addWorkspaceMock.mockResolvedValue({
      ...workspaceTwo,
      id: "added-home",
      path: "/Users/vlad/dev/personal",
    });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths(["~/dev/personal"]);
    });

    expect(isWorkspacePathDirMock).toHaveBeenNthCalledWith(1, "~/dev/personal");
    expect(isWorkspacePathDirMock).toHaveBeenNthCalledWith(2, "/Users/vlad/dev/personal");
    expect(addWorkspaceMock).toHaveBeenCalledWith("/Users/vlad/dev/personal");
    expect(addResult!.added).toHaveLength(1);
    expect(addResult!.skippedInvalid).toHaveLength(0);
    expect(addResult!.failures).toHaveLength(0);
  });

  it("does not skip when an earlier inferred fallback candidate already exists", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const isWorkspacePathDirMock = vi.mocked(isWorkspacePathDir);
    const addWorkspaceMock = vi.mocked(addWorkspace);

    listWorkspacesMock.mockResolvedValue([
      {
        ...workspaceOne,
        id: "existing-srv",
        path: "/srv/codex-monitor/project",
      },
      {
        ...workspaceTwo,
        id: "existing-home",
        path: "/Users/vlad/dev/existing",
      },
    ]);
    isWorkspacePathDirMock.mockImplementation(async (path: string) => {
      if (path === "~/project") {
        return false;
      }
      if (path === "/srv/codex-monitor/project") {
        return true;
      }
      return path === "/Users/vlad/project";
    });
    addWorkspaceMock.mockResolvedValue({
      ...workspaceOne,
      id: "added-home",
      path: "/Users/vlad/project",
    });

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let addResult: Awaited<ReturnType<typeof result.current.addWorkspacesFromPaths>>;
    await act(async () => {
      addResult = await result.current.addWorkspacesFromPaths(["~/project"]);
    });

    expect(isWorkspacePathDirMock).toHaveBeenNthCalledWith(1, "~/project");
    expect(isWorkspacePathDirMock).toHaveBeenNthCalledWith(2, "/srv/codex-monitor/project");
    expect(isWorkspacePathDirMock).toHaveBeenNthCalledWith(3, "/Users/vlad/project");
    expect(addWorkspaceMock).toHaveBeenCalledWith("/Users/vlad/project");
    expect(addResult!.added).toHaveLength(1);
    expect(addResult!.skippedExisting).toHaveLength(0);
    expect(addResult!.skippedInvalid).toHaveLength(0);
    expect(addResult!.failures).toHaveLength(0);
  });
});


describe("useWorkspaces.addWorkspaceFromGitUrl", () => {
  it("invokes service and activates workspace", async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([]);
    const added = { ...workspaceOne, id: "from-url", path: "/tmp/from-url" };
    vi.mocked(addWorkspaceFromGitUrl).mockResolvedValue(added);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.addWorkspaceFromGitUrl(
        "https://github.com/org/repo.git",
        "/tmp",
        "repo",
      );
    });

    expect(addWorkspaceFromGitUrl).toHaveBeenCalledWith(
      "https://github.com/org/repo.git",
      "/tmp",
      "repo",
    );
    expect(result.current.activeWorkspace?.id).toBe("from-url");
  });
});
