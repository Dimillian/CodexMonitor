import type { AppSettings } from "../../../types";
import {
  orbitConnectTest,
  orbitRunnerStart,
  orbitRunnerStatus,
  orbitRunnerStop,
  orbitSignInPoll,
  orbitSignInStart,
  orbitSignOut,
} from "../../../services/tauri";
import type {
  CodexSection,
  OrbitServiceClient,
  ShortcutDraftKey,
  ShortcutSettingKey,
} from "./settingsTypes";

export const DICTATION_MODELS = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "速度最快，准确率最低。" },
  { id: "base", label: "Base", size: "142 MB", note: "默认均衡。" },
  { id: "small", label: "Small", size: "466 MB", note: "准确率更高。" },
  { id: "medium", label: "Medium", size: "1.5 GB", note: "高准确率。" },
  {
    id: "large-v3",
    label: "Large V3",
    size: "3.0 GB",
    note: "准确率最高，下载体积大。",
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
  default: "关闭 — 不自动格式化",
  helpful: "实用 — 常用快捷格式化",
  smart: "智能 — 全部自动格式化",
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

export const ORBIT_SERVICES: OrbitServiceClient = {
  orbitConnectTest,
  orbitSignInStart,
  orbitSignInPoll,
  orbitSignOut,
  orbitRunnerStart,
  orbitRunnerStop,
  orbitRunnerStatus,
};

export const ORBIT_DEFAULT_POLL_INTERVAL_SECONDS = 5;
export const ORBIT_MAX_INLINE_POLL_SECONDS = 180;
export const SETTINGS_MOBILE_BREAKPOINT_PX = 720;
export const DEFAULT_REMOTE_HOST = "127.0.0.1:4732";

export const SETTINGS_SECTION_LABELS: Record<CodexSection, string> = {
  projects: "项目",
  environments: "环境",
  display: "显示与声音",
  composer: "编辑器",
  dictation: "听写",
  shortcuts: "快捷键",
  "open-apps": "打开方式",
  git: "Git",
  server: "服务",
  codex: "Codex",
  features: "功能",
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
