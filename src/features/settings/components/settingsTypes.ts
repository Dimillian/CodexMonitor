import type { OpenAppTarget } from "@/types";

export const SETTINGS_SECTION_IDS = [
  "projects",
  "environments",
  "display",
  "about",
  "composer",
  "dictation",
  "shortcuts",
  "open-apps",
  "git",
  "server",
  "agents",
] as const;

export const SETTINGS_EXTRA_SECTION_IDS = ["codex", "features"] as const;

export const SETTINGS_ROUTE_SECTION_IDS = [
  ...SETTINGS_SECTION_IDS,
  ...SETTINGS_EXTRA_SECTION_IDS,
  "profile",
] as const;

type SettingsSection = (typeof SETTINGS_SECTION_IDS)[number];

export type CodexSection =
  | SettingsSection
  | (typeof SETTINGS_EXTRA_SECTION_IDS)[number];

export type ShortcutSettingKey =
  | "composerModelShortcut"
  | "composerAccessShortcut"
  | "composerReasoningShortcut"
  | "composerCollaborationShortcut"
  | "interruptShortcut"
  | "newAgentShortcut"
  | "newWorktreeAgentShortcut"
  | "newCloneAgentShortcut"
  | "archiveThreadShortcut"
  | "toggleProjectsSidebarShortcut"
  | "toggleGitSidebarShortcut"
  | "branchSwitcherShortcut"
  | "toggleDebugPanelShortcut"
  | "toggleTerminalShortcut"
  | "cycleAgentNextShortcut"
  | "cycleAgentPrevShortcut"
  | "cycleWorkspaceNextShortcut"
  | "cycleWorkspacePrevShortcut";

export type ShortcutDraftKey =
  | "model"
  | "access"
  | "reasoning"
  | "collaboration"
  | "interrupt"
  | "newAgent"
  | "newWorktreeAgent"
  | "newCloneAgent"
  | "archiveThread"
  | "projectsSidebar"
  | "gitSidebar"
  | "branchSwitcher"
  | "debugPanel"
  | "terminal"
  | "cycleAgentNext"
  | "cycleAgentPrev"
  | "cycleWorkspaceNext"
  | "cycleWorkspacePrev";

export type ShortcutDrafts = Record<ShortcutDraftKey, string>;

export type OpenAppDraft = OpenAppTarget & { argsText: string };
