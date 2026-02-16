import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import * as notification from "@tauri-apps/plugin-notification";
import {
  addWorkspace,
  compactThread,
  createGitHubRepo,
  fetchGit,
  forkThread,
  getAppsList,
  getExperimentalFeatureList,
  getGitHubIssues,
  getGitLog,
  getGitStatus,
  getOpenAppIcon,
  listMcpServerStatus,
  readGlobalAgentsMd,
  readGlobalCodexConfigToml,
  listWorkspaces,
  openWorkspaceIn,
  readAgentMd,
  stageGitAll,
  respondToServerRequest,
  respondToUserInputRequest,
  sendUserMessage,
  steerTurn,
  sendNotification,
  setCodexFeatureFlag,
  startReview,
  setThreadName,
  tailscaleDaemonStart,
  tailscaleDaemonCommandPreview,
  tailscaleDaemonStatus,
  tailscaleDaemonStop,
  tailscaleStatus,
  pickWorkspacePaths,
  writeGlobalAgentsMd,
  writeGlobalCodexConfigToml,
  writeAgentMd,
} from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe("tauri invoke wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "is_macos_debug_build") {
        return false;
      }
      return undefined;
    });
  });

  it("uses codex_bin for addWorkspace", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ id: "ws-1" });

    await addWorkspace("/tmp/project", null);

    expect(invokeMock).toHaveBeenCalledWith("add_workspace", {
      path: "/tmp/project",
      codex_bin: null,
    });
  });

  it("returns an empty list when workspace picker is cancelled", async () => {
    const openMock = vi.mocked(open);
    openMock.mockResolvedValueOnce(null);

    await expect(pickWorkspacePaths()).resolves.toEqual([]);
  });

  it("wraps a single workspace selection in an array", async () => {
    const openMock = vi.mocked(open);
    openMock.mockResolvedValueOnce("/tmp/project");

    await expect(pickWorkspacePaths()).resolves.toEqual(["/tmp/project"]);
  });

  it("returns multiple workspace selections as-is", async () => {
    const openMock = vi.mocked(open);
    openMock.mockResolvedValueOnce(["/tmp/one", "/tmp/two"]);

    await expect(pickWorkspacePaths()).resolves.toEqual(["/tmp/one", "/tmp/two"]);
  });

  it("maps workspace_id to workspaceId for git status", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({
      branchName: "main",
      files: [],
      stagedFiles: [],
      unstagedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
    });

    await getGitStatus("ws-1");

    expect(invokeMock).toHaveBeenCalledWith("get_git_status", {
      workspaceId: "ws-1",
    });
  });

  it("maps args for createGitHubRepo", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ status: "ok", repo: "me/repo" });

    await createGitHubRepo("ws-77", "me/repo", "private", "main");

    expect(invokeMock).toHaveBeenCalledWith("create_github_repo", {
      workspaceId: "ws-77",
      repo: "me/repo",
      visibility: "private",
      branch: "main",
    });
  });

  it("maps workspace_id to workspaceId for GitHub issues", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ total: 0, issues: [] });

    await getGitHubIssues("ws-2");

    expect(invokeMock).toHaveBeenCalledWith("get_github_issues", {
      workspaceId: "ws-2",
    });
  });

  it("returns an empty list when the Tauri invoke bridge is missing", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockRejectedValueOnce(
      new TypeError("Cannot read properties of undefined (reading 'invoke')"),
    );

    await expect(listWorkspaces()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("list_workspaces");
  });

  it("applies default limit for git log", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({
      total: 0,
      entries: [],
      ahead: 0,
      behind: 0,
      aheadEntries: [],
      behindEntries: [],
      upstream: null,
    });

    await getGitLog("ws-3");

    expect(invokeMock).toHaveBeenCalledWith("get_git_log", {
      workspaceId: "ws-3",
      limit: 40,
    });
  });

  it("maps workspaceId and threadId for fork_thread", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await forkThread("ws-9", "thread-9");

    expect(invokeMock).toHaveBeenCalledWith("fork_thread", {
      workspaceId: "ws-9",
      threadId: "thread-9",
    });
  });

  it("maps workspaceId and threadId for compact_thread", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await compactThread("ws-10", "thread-10");

    expect(invokeMock).toHaveBeenCalledWith("compact_thread", {
      workspaceId: "ws-10",
      threadId: "thread-10",
    });
  });

  it("maps workspaceId/threadId/name for set_thread_name", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await setThreadName("ws-9", "thread-9", "New Name");

    expect(invokeMock).toHaveBeenCalledWith("set_thread_name", {
      workspaceId: "ws-9",
      threadId: "thread-9",
      name: "New Name",
    });
  });

  it("maps workspaceId/cursor/limit for list_mcp_server_status", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await listMcpServerStatus("ws-10", "cursor-1", 25);

    expect(invokeMock).toHaveBeenCalledWith("list_mcp_server_status", {
      workspaceId: "ws-10",
      cursor: "cursor-1",
      limit: 25,
    });
  });

  it("maps workspaceId/cursor/limit/threadId for apps_list", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await getAppsList("ws-11", "cursor-1", 25, "thread-11");

    expect(invokeMock).toHaveBeenCalledWith("apps_list", {
      workspaceId: "ws-11",
      cursor: "cursor-1",
      limit: 25,
      threadId: "thread-11",
    });
  });

  it("maps workspaceId/cursor/limit for experimental_feature_list", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await getExperimentalFeatureList("ws-11", "cursor-2", 50);

    expect(invokeMock).toHaveBeenCalledWith("experimental_feature_list", {
      workspaceId: "ws-11",
      cursor: "cursor-2",
      limit: 50,
    });
  });

  it("maps feature key and enabled for set_codex_feature_flag", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce(undefined);

    await setCodexFeatureFlag("collab", true);

    expect(invokeMock).toHaveBeenCalledWith("set_codex_feature_flag", {
      featureKey: "collab",
      enabled: true,
    });
  });

  it("invokes stage_git_all", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await stageGitAll("ws-6");

    expect(invokeMock).toHaveBeenCalledWith("stage_git_all", {
      workspaceId: "ws-6",
    });
  });

  it("invokes fetch_git", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await fetchGit("ws-7");

    expect(invokeMock).toHaveBeenCalledWith("fetch_git", {
      workspaceId: "ws-7",
    });
  });

  it("maps openWorkspaceIn options", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await openWorkspaceIn("/tmp/project", {
      appName: "Xcode",
      args: ["--reuse-window"],
    });

    expect(invokeMock).toHaveBeenCalledWith("open_workspace_in", {
      path: "/tmp/project",
      app: "Xcode",
      command: null,
      args: ["--reuse-window"],
    });
  });

  it("invokes get_open_app_icon", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce("data:image/png;base64,abc");

    await getOpenAppIcon("Xcode");

    expect(invokeMock).toHaveBeenCalledWith("get_open_app_icon", {
      appName: "Xcode",
    });
  });

  it("invokes tailscale wrappers", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValue(undefined);

    await tailscaleStatus();
    await tailscaleDaemonCommandPreview();
    await tailscaleDaemonStart();
    await tailscaleDaemonStop();
    await tailscaleDaemonStatus();

    expect(invokeMock).toHaveBeenCalledWith("tailscale_status");
    expect(invokeMock).toHaveBeenCalledWith("tailscale_daemon_command_preview");
    expect(invokeMock).toHaveBeenCalledWith("tailscale_daemon_start");
    expect(invokeMock).toHaveBeenCalledWith("tailscale_daemon_stop");
    expect(invokeMock).toHaveBeenCalledWith("tailscale_daemon_status");
  });

  it("reads agent.md for a workspace", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ exists: true, content: "# Agent", truncated: false });

    await readAgentMd("ws-agent");

    expect(invokeMock).toHaveBeenCalledWith("file_read", {
      scope: "workspace",
      kind: "agents",
      workspaceId: "ws-agent",
    });
  });

  it("writes agent.md for a workspace", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await writeAgentMd("ws-agent", "# Agent");

    expect(invokeMock).toHaveBeenCalledWith("file_write", {
      scope: "workspace",
      kind: "agents",
      workspaceId: "ws-agent",
      content: "# Agent",
    });
  });

  it("reads global AGENTS.md", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ exists: true, content: "# Global", truncated: false });

    await readGlobalAgentsMd();

    expect(invokeMock).toHaveBeenCalledWith("file_read", {
      scope: "global",
      kind: "agents",
      workspaceId: undefined,
    });
  });

  it("writes global AGENTS.md", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await writeGlobalAgentsMd("# Global");

    expect(invokeMock).toHaveBeenCalledWith("file_write", {
      scope: "global",
      kind: "agents",
      workspaceId: undefined,
      content: "# Global",
    });
  });

  it("reads global config.toml", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ exists: true, content: "model = \"gpt-5\"", truncated: false });

    await readGlobalCodexConfigToml();

    expect(invokeMock).toHaveBeenCalledWith("file_read", {
      scope: "global",
      kind: "config",
      workspaceId: undefined,
    });
  });

  it("writes global config.toml", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await writeGlobalCodexConfigToml("model = \"gpt-5\"");

    expect(invokeMock).toHaveBeenCalledWith("file_write", {
      scope: "global",
      kind: "config",
      workspaceId: undefined,
      content: "model = \"gpt-5\"",
    });
  });

  it("fills sendUserMessage defaults in payload", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await sendUserMessage("ws-4", "thread-1", "hello", {
      accessMode: "full-access",
      images: ["image.png"],
    });

    expect(invokeMock).toHaveBeenCalledWith("send_user_message", {
      workspaceId: "ws-4",
      threadId: "thread-1",
      text: "hello",
      model: null,
      effort: null,
      accessMode: "full-access",
      images: ["image.png"],
    });
  });

  it("includes app mentions when sending a message", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await sendUserMessage("ws-4", "thread-1", "hello $calendar", {
      appMentions: [{ name: "Calendar", path: "app://connector_calendar" }],
    });

    expect(invokeMock).toHaveBeenCalledWith("send_user_message", {
      workspaceId: "ws-4",
      threadId: "thread-1",
      text: "hello $calendar",
      model: null,
      effort: null,
      accessMode: null,
      images: null,
      appMentions: [{ name: "Calendar", path: "app://connector_calendar" }],
    });
  });

  it("invokes turn_steer for steer payloads", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await steerTurn("ws-4", "thread-1", "turn-2", "continue", ["image.png"]);

    expect(invokeMock).toHaveBeenCalledWith("turn_steer", {
      workspaceId: "ws-4",
      threadId: "thread-1",
      turnId: "turn-2",
      text: "continue",
      images: ["image.png"],
    });
  });

  it("omits delivery when starting reviews without override", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await startReview("ws-5", "thread-2", { type: "uncommittedChanges" });

    expect(invokeMock).toHaveBeenCalledWith("start_review", {
      workspaceId: "ws-5",
      threadId: "thread-2",
      target: { type: "uncommittedChanges" },
    });
  });

  it("nests decisions for server request responses", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await respondToServerRequest("ws-6", 101, "accept");

    expect(invokeMock).toHaveBeenCalledWith("respond_to_server_request", {
      workspaceId: "ws-6",
      requestId: 101,
      result: { decision: "accept" },
    });
  });

  it("nests answers for user input responses", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await respondToUserInputRequest("ws-7", 202, {
      confirm_path: { answers: ["Yes"] },
    });

    expect(invokeMock).toHaveBeenCalledWith("respond_to_server_request", {
      workspaceId: "ws-7",
      requestId: 202,
      result: {
        answers: {
          confirm_path: { answers: ["Yes"] },
        },
      },
    });
  });

  it("passes through multiple user input answers", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    const answers = {
      confirm_path: { answers: ["Yes"] },
      notes: { answers: ["First line", "Second line"] },
    };

    await respondToUserInputRequest("ws-8", 303, answers);

    expect(invokeMock).toHaveBeenCalledWith("respond_to_server_request", {
      workspaceId: "ws-8",
      requestId: 303,
      result: {
        answers,
      },
    });
  });

  it("sends a notification without re-requesting permission when already granted", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const requestPermissionMock = vi.mocked(notification.requestPermission);
    const sendNotificationMock = vi.mocked(notification.sendNotification);
    isPermissionGrantedMock.mockResolvedValueOnce(true);

    await sendNotification("Hello", "World");

    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
    });
  });

  it("passes extra metadata when provided", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const sendNotificationMock = vi.mocked(notification.sendNotification);
    isPermissionGrantedMock.mockResolvedValueOnce(true);

    await sendNotification("Hello", "World", {
      extra: { kind: "thread", workspaceId: "ws-1", threadId: "t-1" },
    });

    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
      extra: { kind: "thread", workspaceId: "ws-1", threadId: "t-1" },
    });
  });

  it("requests permission once when needed and sends on grant", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const requestPermissionMock = vi.mocked(notification.requestPermission);
    const sendNotificationMock = vi.mocked(notification.sendNotification);
    isPermissionGrantedMock.mockResolvedValueOnce(false);
    requestPermissionMock.mockResolvedValueOnce("granted");

    await sendNotification("Grant", "Please");

    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "Grant",
      body: "Please",
    });
  });

  it("does not send and warns when permission is denied", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const requestPermissionMock = vi.mocked(notification.requestPermission);
    const sendNotificationMock = vi.mocked(notification.sendNotification);
    const invokeMock = vi.mocked(invoke);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    isPermissionGrantedMock.mockResolvedValueOnce(false);
    requestPermissionMock.mockResolvedValueOnce("denied");

    await sendNotification("Denied", "Nope");

    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Notification permission not granted.",
      { permission: "denied" },
    );
    expect(invokeMock).toHaveBeenCalledWith("send_notification_fallback", {
      title: "Denied",
      body: "Nope",
    });
    warnSpy.mockRestore();
  });

  it("falls back when the notification plugin throws", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const invokeMock = vi.mocked(invoke);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    isPermissionGrantedMock.mockRejectedValueOnce(new Error("boom"));

    await sendNotification("Plugin", "Failed");

    expect(invokeMock).toHaveBeenCalledWith("send_notification_fallback", {
      title: "Plugin",
      body: "Failed",
    });
    warnSpy.mockRestore();
  });

  it("prefers the fallback on macOS debug builds", async () => {
    const isPermissionGrantedMock = vi.mocked(notification.isPermissionGranted);
    const invokeMock = vi.mocked(invoke);

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "is_macos_debug_build") {
        return true;
      }
      if (command === "send_notification_fallback") {
        return undefined;
      }
      return undefined;
    });

    await sendNotification("Dev", "Fallback");

    expect(invokeMock).toHaveBeenCalledWith("is_macos_debug_build");
    expect(invokeMock).toHaveBeenCalledWith("send_notification_fallback", {
      title: "Dev",
      body: "Fallback",
    });
    expect(isPermissionGrantedMock).not.toHaveBeenCalled();
  });
});
