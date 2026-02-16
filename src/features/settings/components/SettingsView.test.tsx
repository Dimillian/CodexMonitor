// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

const renderDisplaySection = (
  options: {
    appSettings?: Partial<AppSettings>;
    reduceTransparency?: boolean;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
    onToggleTransparency?: ComponentProps<typeof SettingsView>["onToggleTransparency"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const onToggleTransparency = options.onToggleTransparency ?? vi.fn();
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: options.reduceTransparency ?? false,
    onToggleTransparency,
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceCodexBin: vi.fn().mockResolvedValue(undefined),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
  };

  render(<SettingsView {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "显示与声音" }));

  return { onUpdateAppSettings, onToggleTransparency };
};

const workspace = (
  overrides: Omit<Partial<WorkspaceInfo>, "settings"> &
    Pick<WorkspaceInfo, "id" | "name"> & {
      settings?: Partial<WorkspaceInfo["settings"]>;
    },
): WorkspaceInfo => ({
  id: overrides.id,
  name: overrides.name,
  path: overrides.path ?? `/tmp/${overrides.id}`,
  connected: overrides.connected ?? false,
  codex_bin: overrides.codex_bin ?? null,
  kind: overrides.kind ?? "main",
  parentId: overrides.parentId ?? null,
  worktree: overrides.worktree ?? null,
  settings: {
    sidebarCollapsed: false,
    sortOrder: null,
    groupId: null,
    gitRoot: null,
    codexHome: null,
    codexArgs: null,
    launchScript: null,
    launchScripts: null,
    worktreeSetupScript: null,
    ...overrides.settings,
  },
});

const renderEnvironmentsSection = (
  options: {
    groupedWorkspaces?: ComponentProps<typeof SettingsView>["groupedWorkspaces"];
    onUpdateWorkspaceSettings?: ComponentProps<typeof SettingsView>["onUpdateWorkspaceSettings"];
  } = {},
) => {
  cleanup();
  const onUpdateWorkspaceSettings =
    options.onUpdateWorkspaceSettings ?? vi.fn().mockResolvedValue(undefined);

  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: baseSettings,
    openAppIconById: {},
    onUpdateAppSettings: vi.fn().mockResolvedValue(undefined),
    workspaceGroups: [],
    groupedWorkspaces:
      options.groupedWorkspaces ??
      [
        {
          id: null,
          name: "Ungrouped",
          workspaces: [
            workspace({
              id: "w1",
              name: "Project One",
              settings: {
                sidebarCollapsed: false,
                worktreeSetupScript: "echo one",
              },
            }),
          ],
        },
      ],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceCodexBin: vi.fn().mockResolvedValue(undefined),
    onUpdateWorkspaceSettings,
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
    initialSection: "environments",
  };

  render(<SettingsView {...props} />);
  return { onUpdateWorkspaceSettings };
};

describe("SettingsView Display", () => {
  it("updates the theme selection", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const select = screen.getByLabelText("主题");
    fireEvent.change(select, { target: { value: "dark" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });
  });

  it("updates thread scroll restore mode", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const select = screen.getByLabelText("线程切换滚动策略");
    fireEvent.change(select, { target: { value: "remember" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ threadScrollRestoreMode: "remember" }),
      );
    });
  });

  it("toggles file path visibility in messages", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("在消息中显示文件路径")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected file path visibility row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected file path visibility toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ showMessageFilePath: false }),
      );
    });
  });

  it("toggles reduce transparency", async () => {
    const onToggleTransparency = vi.fn();
    renderDisplaySection({ onToggleTransparency, reduceTransparency: false });

    const row = screen
      .getByText("降低透明效果")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected reduce transparency row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected reduce transparency toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onToggleTransparency).toHaveBeenCalledWith(true);
    });
  });

  it("commits interface scale on blur and enter with clamping", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const scaleInput = screen.getByLabelText("界面缩放");

    fireEvent.change(scaleInput, { target: { value: "500%" } });
    fireEvent.blur(scaleInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 3 }),
      );
    });

    fireEvent.change(scaleInput, { target: { value: "3%" } });
    fireEvent.keyDown(scaleInput, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 0.1 }),
      );
    });
  });

  it("commits font family changes on blur and enter", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const uiFontInput = screen.getByLabelText("界面字体");
    fireEvent.change(uiFontInput, { target: { value: "Avenir, sans-serif" } });
    fireEvent.blur(uiFontInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiFontFamily: "Avenir, sans-serif" }),
      );
    });

    const codeFontInput = screen.getByLabelText("代码字体");
    fireEvent.change(codeFontInput, {
      target: { value: "JetBrains Mono, monospace" },
    });
    fireEvent.keyDown(codeFontInput, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontFamily: "JetBrains Mono, monospace" }),
      );
    });
  });

  it("resets font families to defaults", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const resetButtons = screen.getAllByRole("button", { name: "重置" });
    fireEvent.click(resetButtons[1]);
    fireEvent.click(resetButtons[2]);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          uiFontFamily: expect.stringContaining("system-ui"),
        }),
      );
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          codeFontFamily: expect.stringContaining("ui-monospace"),
        }),
      );
    });
  });

  it("updates code font size from the slider", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const slider = screen.getByLabelText("代码字号");
    fireEvent.change(slider, { target: { value: "14" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontSize: 14 }),
      );
    });
  });

  it("toggles notification sounds", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { notificationSoundsEnabled: false },
    });

    const row = screen
      .getByText("通知声音")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected notification sounds row");
    }
    fireEvent.click(within(row).getByRole("button"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationSoundsEnabled: true }),
      );
    });
  });
});

describe("SettingsView Environments", () => {
  it("saves the setup script for the selected project", async () => {
    const onUpdateWorkspaceSettings = vi.fn().mockResolvedValue(undefined);
    renderEnvironmentsSection({ onUpdateWorkspaceSettings });

    expect(
      screen.getByText("环境", { selector: ".settings-section-title" }),
    ).not.toBeNull();
    const textarea = screen.getByPlaceholderText("pnpm install");
    expect((textarea as HTMLTextAreaElement).value).toBe("echo one");

    fireEvent.change(textarea, { target: { value: "echo updated" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onUpdateWorkspaceSettings).toHaveBeenCalledWith("w1", {
        worktreeSetupScript: "echo updated",
      });
    });
  });

  it("normalizes whitespace-only scripts to null", async () => {
    const onUpdateWorkspaceSettings = vi.fn().mockResolvedValue(undefined);
    renderEnvironmentsSection({ onUpdateWorkspaceSettings });

    const textarea = screen.getByPlaceholderText("pnpm install");
    fireEvent.change(textarea, { target: { value: "   \n\t" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onUpdateWorkspaceSettings).toHaveBeenCalledWith("w1", {
        worktreeSetupScript: null,
      });
    });
  });

  it("copies the setup script to the clipboard", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    try {
      renderEnvironmentsSection();

      fireEvent.click(screen.getByRole("button", { name: "复制" }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("echo one");
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, "clipboard", originalDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (navigator as any).clipboard;
      }
    }
  });
});
