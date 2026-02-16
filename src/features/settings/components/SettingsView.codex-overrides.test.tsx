// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../../../utils/commitMessagePrompt";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  open: vi.fn(),
}));

afterEach(async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
  });
  cleanup();
});

const baseSettings: AppSettings = {
  codexBin: null,
  codexArgs: null,
  backendMode: "local",
  remoteBackendProvider: "tcp",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  orbitWsUrl: null,
  orbitAuthUrl: null,
  orbitRunnerName: null,
  orbitAutoStartRunner: false,
  keepDaemonRunningAfterAppClose: false,
  orbitUseAccess: false,
  orbitAccessClientId: null,
  orbitAccessClientSecretRef: null,
  reviewDeliveryMode: "inline",
  composerModelShortcut: null,
  composerReasoningShortcut: null,
  composerCollaborationShortcut: null,
  interruptShortcut: null,
  newAgentShortcut: null,
  newWorktreeAgentShortcut: null,
  newCloneAgentShortcut: null,
  archiveThreadShortcut: null,
  toggleProjectsSidebarShortcut: null,
  toggleGitSidebarShortcut: null,
  branchSwitcherShortcut: null,
  toggleDebugPanelShortcut: null,
  toggleTerminalShortcut: null,
  cycleAgentNextShortcut: null,
  cycleAgentPrevShortcut: null,
  cycleWorkspaceNextShortcut: null,
  cycleWorkspacePrevShortcut: null,
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: 1,
  theme: "system",
  usageShowRemaining: false,
  showMessageFilePath: true,
  threadScrollRestoreMode: "latest",
  threadTitleAutogenerationEnabled: false,
  uiFontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  codeFontFamily:
    'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  codeFontSize: 11,
  notificationSoundsEnabled: true,
  systemNotificationsEnabled: true,
  preloadGitDiffs: true,
  gitDiffIgnoreWhitespaceChanges: false,
  commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
  experimentalCollabEnabled: false,
  collaborationModesEnabled: true,
  steerEnabled: true,
  unifiedExecEnabled: true,
  autoArchiveSubAgentThreadsEnabled: true,
  autoArchiveSubAgentThreadsMaxAgeMinutes: 30,
  experimentalAppsEnabled: false,
  personality: "friendly",
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: "alt",
  composerEditorPreset: "default",
  composerFenceExpandOnSpace: false,
  composerFenceExpandOnEnter: false,
  composerFenceLanguageTags: false,
  composerFenceWrapSelection: false,
  composerFenceAutoWrapPasteMultiline: false,
  composerFenceAutoWrapPasteCodeLike: false,
  composerListContinuation: false,
  composerCodeBlockCopyUseModifier: false,
  workspaceGroups: [],
  openAppTargets: [
    {
      id: "vscode",
      label: "VS Code",
      kind: "app",
      appName: "Visual Studio Code",
      command: null,
      args: [],
    },
  ],
  selectedOpenAppId: "vscode",
};

const createDoctorResult = () => ({
  ok: true,
  codexBin: null,
  version: null,
  appServerOk: true,
  details: null,
  path: null,
  nodeOk: true,
  nodeVersion: null,
  nodeDetails: null,
});

const createUpdateResult = () => ({
  ok: true,
  method: "brew_formula" as const,
  package: "codex",
  beforeVersion: "codex 0.0.0",
  afterVersion: "codex 0.0.1",
  upgraded: true,
  output: null,
  details: null,
});

describe("SettingsView Codex overrides", () => {
  it("updates workspace Codex args override on blur", async () => {
    const onUpdateWorkspaceSettings = vi.fn().mockResolvedValue(undefined);
    const workspace: WorkspaceInfo = {
      id: "w1",
      name: "Workspace",
      path: "/tmp/workspace",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          { id: null, name: "Ungrouped", workspaces: [workspace] },
        ]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onRunCodexUpdate={vi.fn().mockResolvedValue(createUpdateResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={onUpdateWorkspaceSettings}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="codex"
      />,
    );

    const input = screen.getByLabelText("Workspace 的 Codex 参数覆盖");
    fireEvent.change(input, { target: { value: "--profile dev" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onUpdateWorkspaceSettings).toHaveBeenCalledWith("w1", {
        codexArgs: "--profile dev",
      });
    });
  });

  it("updates review mode in codex section", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onRunCodexUpdate={vi.fn().mockResolvedValue(createUpdateResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="codex"
      />,
    );

    fireEvent.change(screen.getByLabelText("代码审查方式"), {
      target: { value: "detached" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ reviewDeliveryMode: "detached" }),
      );
    });
  });

  it("renders Orbit controls for Orbit provider even in local backend mode", async () => {
    cleanup();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "local",
          remoteBackendProvider: "orbit",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Orbit WebSocket 地址")).not.toBeNull();
      expect(screen.getByLabelText("Orbit 认证 URL")).not.toBeNull();
      expect(screen.getByLabelText("Orbit Runner 名称")).not.toBeNull();
      expect(screen.getByLabelText("Orbit Access 客户端 ID")).not.toBeNull();
      expect(screen.getByLabelText("Orbit Access 客户端密钥引用")).not.toBeNull();
      expect(screen.getByRole("button", { name: "连接测试" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "登出" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "启动 Runner" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "停止 Runner" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "刷新状态" })).not.toBeNull();
    });
  });

  it("renders mobile daemon controls in local backend mode for TCP provider", async () => {
    cleanup();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "local",
          remoteBackendProvider: "tcp",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动守护进程" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "停止守护进程" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "刷新状态" })).not.toBeNull();
      expect(screen.getByLabelText("远程后端 host")).not.toBeNull();
      expect(screen.getByLabelText("远程后端 token")).not.toBeNull();
    });
  });

  it("shows mobile-only server controls on iOS runtime", async () => {
    cleanup();
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "platform",
    );
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "userAgent",
    );
    const originalTouchPointsDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "maxTouchPoints",
    );

    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    });
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });

    try {
      render(
        <SettingsView
          workspaceGroups={[]}
          groupedWorkspaces={[]}
          ungroupedLabel="Ungrouped"
          onClose={vi.fn()}
          onMoveWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          reduceTransparency={false}
          onToggleTransparency={vi.fn()}
          appSettings={{
            ...baseSettings,
            backendMode: "local",
            remoteBackendProvider: "orbit",
          }}
          openAppIconById={{}}
          onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
          onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
          onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
          onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
          scaleShortcutTitle="Scale shortcut"
          scaleShortcutText="Use Command +/-"
          onTestNotificationSound={vi.fn()}
          onTestSystemNotification={vi.fn()}
          dictationModelStatus={null}
          onDownloadDictationModel={vi.fn()}
          onCancelDictationDownload={vi.fn()}
          onRemoveDictationModel={vi.fn()}
          initialSection="server"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("连接类型")).not.toBeNull();
        expect(screen.getByLabelText("Orbit WebSocket 地址")).not.toBeNull();
        expect(screen.getByLabelText("远程后端 token")).not.toBeNull();
        expect(screen.getByRole("button", { name: "连接并测试" })).not.toBeNull();
      });

      expect(screen.queryByLabelText("后端模式")).toBeNull();
      expect(screen.queryByRole("button", { name: "启动守护进程" })).toBeNull();
      expect(screen.queryByRole("button", { name: "检测 Tailscale" })).toBeNull();
      expect(screen.queryByRole("button", { name: "连接测试" })).toBeNull();
      expect(screen.queryByLabelText("远程后端 host")).toBeNull();
      expect(screen.queryByRole("button", { name: "登录" })).toBeNull();
      expect(screen.getByText(/Orbit WebSocket 地址和令牌/)).not.toBeNull();
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(window.navigator, "platform", originalPlatformDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "platform");
      }
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "userAgent");
      }
      if (originalTouchPointsDescriptor) {
        Object.defineProperty(
          window.navigator,
          "maxTouchPoints",
          originalTouchPointsDescriptor,
        );
      } else {
        Reflect.deleteProperty(window.navigator, "maxTouchPoints");
      }
    }
  });

  it("polls Orbit sign-in using deviceCode until authorized", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    const startSpy = vi.fn().mockResolvedValueOnce({
      deviceCode: "device-code-123",
      userCode: "ABCD-1234",
      verificationUri: "https://orbit.example/verify",
      verificationUriComplete: null,
      intervalSeconds: 1,
      expiresInSeconds: 30,
    });
    const pollSpy = vi
      .fn()
      .mockResolvedValueOnce({
        status: "pending",
        token: null,
        message: "Waiting for authorization.",
        intervalSeconds: 1,
      })
      .mockResolvedValueOnce({
        status: "authorized",
        token: "orbit-token-1",
        message: "Orbit 登录完成。",
        intervalSeconds: null,
      });
    const orbitServiceClient: NonNullable<
      ComponentProps<typeof SettingsView>["orbitServiceClient"]
    > = {
      orbitConnectTest: vi.fn().mockResolvedValue({
        ok: true,
        latencyMs: 12,
        message: "Connected to Orbit relay.",
      }),
      orbitSignInStart: startSpy,
      orbitSignInPoll: pollSpy,
      orbitSignOut: vi.fn().mockResolvedValue({ success: true, message: null }),
      orbitRunnerStart: vi.fn().mockResolvedValue({
        state: "running",
        pid: 123,
        startedAtMs: Date.now(),
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStop: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStatus: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
    };
    const rendered = render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "remote",
          remoteBackendProvider: "orbit",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
        orbitServiceClient={orbitServiceClient}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "登录" }));
    });
    await waitFor(() => {
      expect(pollSpy).toHaveBeenCalledTimes(1);
    }, { timeout: 2500 });

    rendered.rerender(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "remote",
          remoteBackendProvider: "orbit",
          theme: "dark",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
        orbitServiceClient={orbitServiceClient}
      />,
    );

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith("device-code-123");
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ remoteBackendToken: "orbit-token-1", theme: "dark" }),
      );
      expect(screen.getByText(/授权码：/).textContent ?? "").toContain("ABCD-1234");
      expect(screen.getByText("Orbit 登录完成。")).not.toBeNull();
    }, { timeout: 3500 });
  });

  it("syncs token state after Orbit sign-out", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    const orbitServiceClient: NonNullable<
      ComponentProps<typeof SettingsView>["orbitServiceClient"]
    > = {
      orbitConnectTest: vi.fn().mockResolvedValue({
        ok: true,
        latencyMs: 12,
        message: "Connected to Orbit relay.",
      }),
      orbitSignInStart: vi.fn(),
      orbitSignInPoll: vi.fn(),
      orbitSignOut: vi.fn().mockResolvedValue({ success: true, message: null }),
      orbitRunnerStart: vi.fn().mockResolvedValue({
        state: "running",
        pid: 123,
        startedAtMs: Date.now(),
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStop: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStatus: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "remote",
          remoteBackendProvider: "orbit",
          remoteBackendToken: "token-to-clear",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
        orbitServiceClient={orbitServiceClient}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "登出" }));
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ remoteBackendToken: null }),
      );
    });
  });

  it("retries Orbit token persistence after a failed save", async () => {
    cleanup();
    const onUpdateAppSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error("settings write failed"))
      .mockResolvedValue(undefined);
    const orbitServiceClient: NonNullable<
      ComponentProps<typeof SettingsView>["orbitServiceClient"]
    > = {
      orbitConnectTest: vi.fn().mockResolvedValue({
        ok: true,
        latencyMs: 12,
        message: "Connected to Orbit relay.",
      }),
      orbitSignInStart: vi.fn(),
      orbitSignInPoll: vi.fn(),
      orbitSignOut: vi.fn().mockResolvedValue({ success: true, message: null }),
      orbitRunnerStart: vi.fn().mockResolvedValue({
        state: "running",
        pid: 123,
        startedAtMs: Date.now(),
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStop: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
      orbitRunnerStatus: vi.fn().mockResolvedValue({
        state: "stopped",
        pid: null,
        startedAtMs: null,
        lastError: null,
        orbitUrl: "wss://orbit.example/ws",
      }),
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "remote",
          remoteBackendProvider: "orbit",
          remoteBackendToken: "token-to-clear",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
        orbitServiceClient={orbitServiceClient}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "登出" }));
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
      expect(screen.getByText("退出登录失败：settings write failed")).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "登出" }));
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledTimes(2);
      expect(onUpdateAppSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ remoteBackendToken: null }),
      );
    });
  });
});
