import type { TFunction } from "i18next";
import type { AppSettings } from "@/types";
import type { CodexSection, ShortcutDraftKey, ShortcutSettingKey } from "./settingsTypes";

export function buildDictationModels(t: TFunction) {
  return [
    {
      id: "tiny",
      label: t("settings.dictation.models.tiny.label"),
      size: "75 MB",
      note: t("settings.dictation.models.tiny.note"),
    },
    {
      id: "base",
      label: t("settings.dictation.models.base.label"),
      size: "142 MB",
      note: t("settings.dictation.models.base.note"),
    },
    {
      id: "small",
      label: t("settings.dictation.models.small.label"),
      size: "466 MB",
      note: t("settings.dictation.models.small.note"),
    },
    {
      id: "medium",
      label: t("settings.dictation.models.medium.label"),
      size: "1.5 GB",
      note: t("settings.dictation.models.medium.note"),
    },
    {
      id: "large-v3",
      label: t("settings.dictation.models.largeV3.label"),
      size: "3.0 GB",
      note: t("settings.dictation.models.largeV3.note"),
    },
  ];
}

type ComposerPreset = AppSettings["composerEditorPreset"];

type ComposerPresetSettings = Pick<
  AppSettings,
  | "composerFenceExpandOnSpace"
  | "composerFenceExpandOnEnter"
  | "composerFenceLanguageTags"
  | "composerFenceWrapSelection"
  | "composerFenceAutoWrapPasteMultiline"
  | "composerFenceAutoWrapPasteCodeLike"
  | "composerListContinuation"
  | "composerCodeBlockCopyUseModifier"
>;

export function buildComposerPresetLabels(
  t: TFunction,
): Record<ComposerPreset, string> {
  return {
    default: t("settings.composer.presets.default"),
    helpful: t("settings.composer.presets.helpful"),
    smart: t("settings.composer.presets.smart"),
  };
}

export const COMPOSER_PRESET_CONFIGS: Record<
  ComposerPreset,
  ComposerPresetSettings
> = {
  default: {
    composerFenceExpandOnSpace: false,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: false,
    composerFenceWrapSelection: false,
    composerFenceAutoWrapPasteMultiline: false,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: false,
    composerCodeBlockCopyUseModifier: false,
  },
  helpful: {
    composerFenceExpandOnSpace: true,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: true,
    composerFenceWrapSelection: true,
    composerFenceAutoWrapPasteMultiline: true,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: true,
    composerCodeBlockCopyUseModifier: false,
  },
  smart: {
    composerFenceExpandOnSpace: true,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: true,
    composerFenceWrapSelection: true,
    composerFenceAutoWrapPasteMultiline: true,
    composerFenceAutoWrapPasteCodeLike: true,
    composerListContinuation: true,
    composerCodeBlockCopyUseModifier: false,
  },
};

export const SETTINGS_MOBILE_BREAKPOINT_PX = 720;
export const DEFAULT_REMOTE_HOST = "127.0.0.1:4732";

export const SETTINGS_SECTION_LABELS: Record<CodexSection, string> = {
  projects: "Projects",
  environments: "Environments",
  display: "Display & Sound",
  about: "About",
  composer: "Composer",
  dictation: "Dictation",
  shortcuts: "Shortcuts",
  "open-apps": "Open in",
  git: "Git",
  server: "Server",
  agents: "Agents",
  codex: "Codex",
  features: "Features",
};

export const SECTION_I18N_KEYS: Record<CodexSection, string> = {
  projects: "settings.nav.projects",
  environments: "settings.nav.environments",
  display: "settings.nav.display",
  about: "settings.nav.about",
  composer: "settings.nav.composer",
  dictation: "settings.nav.dictation",
  shortcuts: "settings.nav.shortcuts",
  "open-apps": "settings.nav.openApps",
  git: "settings.nav.git",
  server: "settings.nav.server",
  agents: "settings.nav.agents",
  codex: "settings.nav.codex",
  features: "settings.nav.features",
};

export const SHORTCUT_DRAFT_KEY_BY_SETTING: Record<
  ShortcutSettingKey,
  ShortcutDraftKey
> = {
  composerModelShortcut: "model",
  composerAccessShortcut: "access",
  composerReasoningShortcut: "reasoning",
  composerCollaborationShortcut: "collaboration",
  interruptShortcut: "interrupt",
  newAgentShortcut: "newAgent",
  newWorktreeAgentShortcut: "newWorktreeAgent",
  newCloneAgentShortcut: "newCloneAgent",
  archiveThreadShortcut: "archiveThread",
  toggleProjectsSidebarShortcut: "projectsSidebar",
  toggleGitSidebarShortcut: "gitSidebar",
  branchSwitcherShortcut: "branchSwitcher",
  toggleDebugPanelShortcut: "debugPanel",
  toggleTerminalShortcut: "terminal",
  cycleAgentNextShortcut: "cycleAgentNext",
  cycleAgentPrevShortcut: "cycleAgentPrev",
  cycleWorkspaceNextShortcut: "cycleWorkspaceNext",
  cycleWorkspacePrevShortcut: "cycleWorkspacePrev",
};
