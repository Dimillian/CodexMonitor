import type { AppSettings } from "@/types";
import type { CodexSection, ShortcutDraftKey, ShortcutSettingKey } from "./settingsTypes";

export const DICTATION_MODELS = [
  { id: "tiny", labelKey: "settings:dictation_model_tiny", size: "75 MB", noteKey: "settings:dictation_model_tiny_note" },
  { id: "base", labelKey: "settings:dictation_model_base", size: "142 MB", noteKey: "settings:dictation_model_base_note" },
  { id: "small", labelKey: "settings:dictation_model_small", size: "466 MB", noteKey: "settings:dictation_model_small_note" },
  { id: "medium", labelKey: "settings:dictation_model_medium", size: "1.5 GB", noteKey: "settings:dictation_model_medium_note" },
  {
    id: "large-v3",
    labelKey: "settings:dictation_model_large_v3",
    size: "3.0 GB",
    noteKey: "settings:dictation_model_large_v3_note",
  },
];

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

export const COMPOSER_PRESET_LABEL_KEYS: Record<ComposerPreset, string> = {
  default: "settings:composer_preset_default",
  helpful: "settings:composer_preset_helpful",
  smart: "settings:composer_preset_smart",
};

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

export const SETTINGS_SECTION_LABEL_KEYS: Record<CodexSection, string> = {
  projects: "settings:section_projects",
  environments: "settings:section_environments",
  display: "settings:section_display",
  about: "settings:section_about",
  composer: "settings:section_composer",
  dictation: "settings:section_dictation",
  shortcuts: "settings:section_shortcuts",
  "open-apps": "settings:section_open_apps",
  git: "settings:section_git",
  server: "settings:section_server",
  agents: "settings:section_agents",
  codex: "settings:section_codex",
  features: "settings:section_features",
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
