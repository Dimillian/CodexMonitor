import i18n from "@/i18n/i18n";
import type { AppSettings } from "@/types";
import type { CodexSection, ShortcutDraftKey, ShortcutSettingKey } from "./settingsTypes";

export const DICTATION_MODELS = [
  { id: "tiny", label: i18n.t("settings:dictation_model_tiny"), size: "75 MB", note: i18n.t("settings:dictation_model_tiny_note") },
  { id: "base", label: i18n.t("settings:dictation_model_base"), size: "142 MB", note: i18n.t("settings:dictation_model_base_note") },
  { id: "small", label: i18n.t("settings:dictation_model_small"), size: "466 MB", note: i18n.t("settings:dictation_model_small_note") },
  { id: "medium", label: i18n.t("settings:dictation_model_medium"), size: "1.5 GB", note: i18n.t("settings:dictation_model_medium_note") },
  {
    id: "large-v3",
    label: i18n.t("settings:dictation_model_large_v3"),
    size: "3.0 GB",
    note: i18n.t("settings:dictation_model_large_v3_note"),
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

export const COMPOSER_PRESET_LABELS: Record<ComposerPreset, string> = {
  default: i18n.t("settings:composer_preset_default"),
  helpful: i18n.t("settings:composer_preset_helpful"),
  smart: i18n.t("settings:composer_preset_smart"),
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

export const SETTINGS_SECTION_LABELS: Record<CodexSection, string> = {
  projects: i18n.t("settings:section_projects"),
  environments: i18n.t("settings:section_environments"),
  display: i18n.t("settings:section_display"),
  about: i18n.t("settings:section_about"),
  composer: i18n.t("settings:section_composer"),
  dictation: i18n.t("settings:section_dictation"),
  shortcuts: i18n.t("settings:section_shortcuts"),
  "open-apps": i18n.t("settings:section_open_apps"),
  git: i18n.t("settings:section_git"),
  server: i18n.t("settings:section_server"),
  agents: i18n.t("settings:section_agents"),
  codex: i18n.t("settings:section_codex"),
  features: i18n.t("settings:section_features"),
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
