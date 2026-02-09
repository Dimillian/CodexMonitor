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
import { describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../../../utils/commitMessagePrompt";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  open: vi.fn(),
}));

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
  defaultAccessMode: "current",
  reviewDeliveryMode: "inline",
  composerModelShortcut: null,
  composerAccessShortcut: null,
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
  experimentalAppsEnabled: false,
  personality: "friendly",
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: null,
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
  fireEvent.click(screen.getByRole("button", { name: "Display & Sound" }));

  return { onUpdateAppSettings, onToggleTransparency };
};

const renderFeaturesSection = (
  options: {
    appSettings?: Partial<AppSettings>;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
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
    initialSection: "features",
  };

  render(<SettingsView {...props} />);
  return { onUpdateAppSettings };
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

    const select = screen.getByLabelText("Theme");
    fireEvent.change(select, { target: { value: "dark" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });
  });

  it("toggles remaining limits display", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("Show remaining Codex limits")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected remaining limits row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected remaining limits toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ usageShowRemaining: true }),
      );
    });
  });

  it("toggles file path visibility in messages", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("Show file path in messages")
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
      .getByText("Reduce transparency")
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

    const scaleInput = screen.getByLabelText("Interface scale");

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

    const uiFontInput = screen.getByLabelText("UI font family");
    fireEvent.change(uiFontInput, { target: { value: "Avenir, sans-serif" } });
    fireEvent.blur(uiFontInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiFontFamily: "Avenir, sans-serif" }),
      );
    });

    const codeFontInput = screen.getByLabelText("Code font family");
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

    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
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

    const slider = screen.getByLabelText("Code font size");
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
      .getByText("Notification sounds")
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
      screen.getByText("Environments", { selector: ".settings-section-title" }),
    ).toBeTruthy();
    const textarea = screen.getByPlaceholderText("pnpm install");
    expect((textarea as HTMLTextAreaElement).value).toBe("echo one");

    fireEvent.change(textarea, { target: { value: "echo updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

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

    const input = screen.getByLabelText("Codex args override for Workspace");
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

    fireEvent.change(screen.getByLabelText("Review mode"), {
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
      expect(screen.getByLabelText("Orbit websocket URL")).toBeTruthy();
      expect(screen.getByLabelText("Orbit auth URL")).toBeTruthy();
      expect(screen.getByLabelText("Orbit runner name")).toBeTruthy();
      expect(screen.getByLabelText("Orbit access client ID")).toBeTruthy();
      expect(screen.getByLabelText("Orbit access client secret ref")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Connect test" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Start Runner" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Stop Runner" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Refresh Status" })).toBeTruthy();
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
      expect(screen.getByRole("button", { name: "Start daemon" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Stop daemon" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Refresh status" })).toBeTruthy();
      expect(screen.getByLabelText("Remote backend host")).toBeTruthy();
      expect(screen.getByLabelText("Remote backend token")).toBeTruthy();
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
        expect(screen.getByLabelText("Connection type")).toBeTruthy();
        expect(screen.getByLabelText("Orbit websocket URL")).toBeTruthy();
        expect(screen.getByLabelText("Remote backend token")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Connect & test" })).toBeTruthy();
      });

      expect(screen.queryByLabelText("Backend mode")).toBeNull();
      expect(screen.queryByRole("button", { name: "Start daemon" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Detect Tailscale" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Connect test" })).toBeNull();
      expect(screen.queryByLabelText("Remote backend host")).toBeNull();
      expect(screen.queryByRole("button", { name: "Sign In" })).toBeNull();
      expect(
        screen.getByText(/use the orbit websocket url and token configured/i),
      ).toBeTruthy();
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
        message: "Orbit sign in complete.",
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
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
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
      expect(screen.getByText(/Auth code:/).textContent ?? "").toContain("ABCD-1234");
      expect(screen.getByText("Orbit sign in complete.")).toBeTruthy();
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
      fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Sign Out failed: settings write failed")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledTimes(2);
      expect(onUpdateAppSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ remoteBackendToken: null }),
      );
    });
  });
});

describe("SettingsView Features", () => {
  it("updates personality selection", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderFeaturesSection({ onUpdateAppSettings });

    fireEvent.change(screen.getByLabelText("Personality"), {
      target: { value: "pragmatic" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ personality: "pragmatic" }),
      );
    });
  });

  it("toggles steer mode in stable features", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderFeaturesSection({
      onUpdateAppSettings,
      appSettings: { steerEnabled: true },
    });

    const steerTitle = screen.getByText("Steer mode");
    const steerRow = steerTitle.closest(".settings-toggle-row");
    expect(steerRow).not.toBeNull();

    const toggle = within(steerRow as HTMLElement).getByRole("button");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ steerEnabled: false }),
      );
    });
  });

  it("toggles background terminal in stable features", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderFeaturesSection({
      onUpdateAppSettings,
      appSettings: { unifiedExecEnabled: true },
    });

    const terminalTitle = screen.getByText("Background terminal");
    const terminalRow = terminalTitle.closest(".settings-toggle-row");
    expect(terminalRow).not.toBeNull();

    const toggle = within(terminalRow as HTMLElement).getByRole("button");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ unifiedExecEnabled: false }),
      );
    });
  });
});

describe("SettingsView mobile layout", () => {
  it("uses a master/detail flow on narrow mobile widths", async () => {
    cleanup();
    const originalMatchMedia = window.matchMedia;
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

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 720px"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
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
          appSettings={baseSettings}
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
        />,
      );

      expect(
        within(rendered.container).queryByText("Sections"),
      ).toBeNull();
      expect(
        rendered.container.querySelectorAll(".ds-panel-nav-item-disclosure")
          .length,
      ).toBeGreaterThan(0);

      fireEvent.click(
        within(rendered.container).getByRole("button", {
          name: "Display & Sound",
        }),
      );

      await waitFor(() => {
        expect(
          within(rendered.container).getByRole("button", {
            name: "Back to settings sections",
          }),
        ).toBeTruthy();
        expect(
          within(rendered.container).getByText("Display & Sound", {
            selector: ".settings-mobile-detail-title",
          }),
        ).toBeTruthy();
      });

      fireEvent.click(
        within(rendered.container).getByRole("button", {
          name: "Back to settings sections",
        }),
      );

      await waitFor(() => {
        expect(within(rendered.container).queryByText("Sections")).toBeNull();
      });
    } finally {
      if (originalMatchMedia) {
        Object.defineProperty(window, "matchMedia", {
          configurable: true,
          writable: true,
          value: originalMatchMedia,
        });
      } else {
        Reflect.deleteProperty(window, "matchMedia");
      }
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
});

describe("SettingsView Shortcuts", () => {
  it("closes on Cmd+W", async () => {
    const onClose = vi.fn();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
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
      />,
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "w", metaKey: true, bubbles: true }),
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
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
      />,
    );

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes when clicking the modal backdrop", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
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
      />,
    );

    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(backdrop).toBeTruthy();
    if (!backdrop) {
      throw new Error("Expected settings modal backdrop");
    }

    await act(async () => {
      fireEvent.click(backdrop);
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
