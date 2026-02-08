import { describe, expect, it } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import {
  getActiveCliArgs,
  getActiveCliPath,
  getWorkspaceCliArgsOverride,
  getWorkspaceCliBinOverride,
  getWorkspaceCliHomeOverride,
  normalizeOverrideValue,
  withActiveCliArgs,
  withActiveCliPath,
  withWorkspaceCliArgsOverride,
  withWorkspaceCliHomeOverride,
} from "./cliBackend";

const baseSettings: AppSettings = {
  cliType: "codex",
  codexBin: "codex",
  codexArgs: "--codex",
  geminiBin: "gemini",
  geminiArgs: "--gemini",
  cursorBin: "cursor",
  cursorArgs: "--cursor",
  claudeBin: "claude",
  claudeArgs: "--claude",
  cursorVimMode: false,
  cursorDefaultMode: "agent",
  cursorOutputFormat: "text",
  cursorAttributeCommits: true,
  cursorAttributePRs: true,
  cursorUseHttp1: false,
  backendMode: "local",
  remoteBackendProvider: "tcp",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  orbitWsUrl: null,
  orbitAuthUrl: null,
  orbitRunnerName: null,
  orbitAutoStartRunner: false,
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
  uiFontFamily: "system-ui",
  codeFontFamily: "monospace",
  codeFontSize: 11,
  notificationSoundsEnabled: true,
  systemNotificationsEnabled: true,
  preloadGitDiffs: true,
  gitDiffIgnoreWhitespaceChanges: false,
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
  openAppTargets: [],
  selectedOpenAppId: "default",
};

const workspaceFixture: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: false,
  codex_bin: "legacy-codex",
  kind: "main",
  parentId: null,
  worktree: null,
  settings: {
    sidebarCollapsed: false,
    codexBin: "codex-override",
    geminiBin: "gemini-override",
    cursorBin: "cursor-override",
    claudeBin: "claude-override",
    codexHome: ".codex-home",
    geminiHome: ".gemini-home",
    cursorHome: ".cursor-home",
    claudeHome: ".claude-home",
    codexArgs: "--codex-args",
    geminiArgs: "--gemini-args",
    cursorArgs: "--cursor-args",
    claudeArgs: "--claude-args",
  },
};

describe("cliBackend utils", () => {
  it("normalizes override drafts", () => {
    expect(normalizeOverrideValue("  ")).toBeNull();
    expect(normalizeOverrideValue("  abc  ")).toBe("abc");
  });

  it("resolves active default path/args by cli type", () => {
    expect(getActiveCliPath({ ...baseSettings, cliType: "codex" })).toBe("codex");
    expect(getActiveCliPath({ ...baseSettings, cliType: "gemini" })).toBe("gemini");
    expect(getActiveCliPath({ ...baseSettings, cliType: "cursor" })).toBe("cursor");
    expect(getActiveCliPath({ ...baseSettings, cliType: "claude" })).toBe("claude");
    expect(getActiveCliArgs({ ...baseSettings, cliType: "codex" })).toBe("--codex");
    expect(getActiveCliArgs({ ...baseSettings, cliType: "gemini" })).toBe("--gemini");
    expect(getActiveCliArgs({ ...baseSettings, cliType: "cursor" })).toBe("--cursor");
    expect(getActiveCliArgs({ ...baseSettings, cliType: "claude" })).toBe("--claude");
  });

  it("writes active default path/args to the selected cli fields", () => {
    expect(
      withActiveCliPath({ ...baseSettings, cliType: "claude" }, "/x/claude").claudeBin,
    ).toBe("/x/claude");
    expect(
      withActiveCliPath({ ...baseSettings, cliType: "cursor" }, "/x/cursor").cursorBin,
    ).toBe("/x/cursor");
    expect(
      withActiveCliArgs({ ...baseSettings, cliType: "gemini" }, "--x").geminiArgs,
    ).toBe("--x");
    expect(withActiveCliArgs({ ...baseSettings, cliType: "codex" }, "--y").codexArgs).toBe(
      "--y",
    );
  });

  it("resolves workspace overrides per active cli type", () => {
    expect(getWorkspaceCliBinOverride(workspaceFixture, "codex")).toBe("codex-override");
    expect(getWorkspaceCliBinOverride(workspaceFixture, "gemini")).toBe("gemini-override");
    expect(getWorkspaceCliBinOverride(workspaceFixture, "cursor")).toBe("cursor-override");
    expect(getWorkspaceCliBinOverride(workspaceFixture, "claude")).toBe("claude-override");

    expect(getWorkspaceCliHomeOverride(workspaceFixture, "codex")).toBe(".codex-home");
    expect(getWorkspaceCliHomeOverride(workspaceFixture, "gemini")).toBe(".gemini-home");
    expect(getWorkspaceCliHomeOverride(workspaceFixture, "cursor")).toBe(".cursor-home");
    expect(getWorkspaceCliHomeOverride(workspaceFixture, "claude")).toBe(".claude-home");

    expect(getWorkspaceCliArgsOverride(workspaceFixture, "codex")).toBe("--codex-args");
    expect(getWorkspaceCliArgsOverride(workspaceFixture, "gemini")).toBe("--gemini-args");
    expect(getWorkspaceCliArgsOverride(workspaceFixture, "cursor")).toBe("--cursor-args");
    expect(getWorkspaceCliArgsOverride(workspaceFixture, "claude")).toBe("--claude-args");
  });

  it("builds settings patches for workspace home and args", () => {
    expect(withWorkspaceCliHomeOverride("claude", ".claude")).toEqual({
      claudeHome: ".claude",
    });
    expect(withWorkspaceCliHomeOverride("codex", ".codex")).toEqual({
      codexHome: ".codex",
    });
    expect(withWorkspaceCliArgsOverride("gemini", "--g")).toEqual({
      geminiArgs: "--g",
    });
    expect(withWorkspaceCliArgsOverride("cursor", "--c")).toEqual({
      cursorArgs: "--c",
    });
  });
});
