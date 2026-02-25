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
  updateWorkspaceSettings: vi.fn(),
}));

vi.mock("../../../utils/platformPaths", () => ({
  isMobilePlatform: vi.fn(() => false),
}));

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
  codexBin: null,
  backendMode: "local",
  workspaceGroups: [],
} as unknown as AppSettings;

describe("useWorkspaceController dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMobilePlatform).mockReturnValue(false);
    window.localStorage.clear();
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

  it("opens the in-app remote path prompt on mobile remote mode", async () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);
    vi.mocked(isWorkspacePathDir).mockResolvedValue(true);
    vi.mocked(addWorkspace).mockResolvedValue(workspaceOne);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: {
          ...baseAppSettings,
          backendMode: "remote",
        },
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let addPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    await act(async () => {
      addPromise = result.current.addWorkspace();
    });

    expect(result.current.mobileRemoteWorkspacePathPrompt).not.toBeNull();
    expect(pickWorkspacePaths).not.toHaveBeenCalled();

    await act(async () => {
      result.current.updateMobileRemoteWorkspacePathInput("/srv/codex-monitor");
    });

    await act(async () => {
      result.current.submitMobileRemoteWorkspacePathPrompt();
    });

    let added: WorkspaceInfo | null = null;
    await act(async () => {
      added = await addPromise;
    });

    expect(added).toMatchObject({ id: workspaceOne.id });
    expect(isWorkspacePathDir).toHaveBeenCalledWith("/srv/codex-monitor");
    expect(result.current.mobileRemoteWorkspacePathPrompt).toBeNull();
    expect(window.localStorage.getItem("mobile-remote-workspace-recent-paths")).toBe(
      JSON.stringify(["/tmp/ws-1"]),
    );
  });

  it("appends selected recent path only when missing", async () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    window.localStorage.setItem(
      "mobile-remote-workspace-recent-paths",
      JSON.stringify(["/srv/one", "/srv/two"]),
    );
    vi.mocked(listWorkspaces).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: {
          ...baseAppSettings,
          backendMode: "remote",
        },
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      void result.current.addWorkspace();
    });

    expect(result.current.mobileRemoteWorkspacePathPrompt?.recentPaths).toEqual([
      "/srv/one",
      "/srv/two",
    ]);

    await act(async () => {
      result.current.appendMobileRemoteWorkspacePathFromRecent("/srv/one");
    });
    expect(result.current.mobileRemoteWorkspacePathPrompt?.value).toBe("/srv/one");

    await act(async () => {
      result.current.appendMobileRemoteWorkspacePathFromRecent("/srv/one");
    });
    expect(result.current.mobileRemoteWorkspacePathPrompt?.value).toBe("/srv/one");

    await act(async () => {
      result.current.appendMobileRemoteWorkspacePathFromRecent("/srv/two");
    });
    expect(result.current.mobileRemoteWorkspacePathPrompt?.value).toBe(
      "/srv/one\n/srv/two",
    );
  });

  it("accepts quoted mobile remote paths", async () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    vi.mocked(listWorkspaces).mockResolvedValue([]);
    vi.mocked(isWorkspacePathDir).mockResolvedValue(true);
    vi.mocked(addWorkspace).mockResolvedValue(workspaceOne);

    const { result } = renderHook(() =>
      useWorkspaceController({
        appSettings: {
          ...baseAppSettings,
          backendMode: "remote",
        },
        addDebugEntry: vi.fn(),
        queueSaveSettings: vi.fn(async (next) => next),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    let addPromise: Promise<WorkspaceInfo | null> = Promise.resolve(null);
    await act(async () => {
      addPromise = result.current.addWorkspace();
    });

    await act(async () => {
      result.current.updateMobileRemoteWorkspacePathInput("'~/dev/personal'");
    });

    await act(async () => {
      result.current.submitMobileRemoteWorkspacePathPrompt();
    });

    await act(async () => {
      await addPromise;
    });

    expect(isWorkspacePathDir).toHaveBeenCalledWith("~/dev/personal");
  });
});
