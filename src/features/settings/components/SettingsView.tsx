import { useCallback, useEffect, useMemo, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import type {
  AppSettings,
  CodexDoctorResult,
  DictationModelStatus,
  WorkspaceSettings,
  OpenAppTarget,
  WorkspaceGroup,
  WorkspaceInfo,
} from "../../../types";
import { formatDownloadSize } from "../../../utils/formatting";
import {
  fileManagerName,
  isMacPlatform,
  isWindowsPlatform,
  openInFileManagerLabel,
} from "../../../utils/platformPaths";
import {
  buildShortcutValue,
  formatShortcut,
  getDefaultInterruptShortcut,
} from "../../../utils/shortcuts";
import { clampUiScale } from "../../../utils/uiScale";
import { getCodexConfigPath } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import { DEFAULT_OPEN_APP_ID, OPEN_APP_STORAGE_KEY } from "../../app/constants";
import { GENERIC_APP_ICON, getKnownOpenAppIcon } from "../../app/utils/openAppIcons";
import { useGlobalAgentsMd } from "../hooks/useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "../hooks/useGlobalCodexConfigToml";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { FileEditorCard } from "../../shared/components/FileEditorCard";

const DICTATION_MODELS = [
  { id: "tiny", label: "微型", size: "75 MB", note: "速度最快，准确率最低。" },
  { id: "base", label: "基础", size: "142 MB", note: "默认的平衡选择。" },
  { id: "small", label: "小型", size: "466 MB", note: "更高准确率。" },
  { id: "medium", label: "中型", size: "1.5 GB", note: "高准确率。" },
  { id: "large-v3", label: "大型 V3", size: "3.0 GB", note: "准确率最高，下载体积较大。" },
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

const COMPOSER_PRESET_LABELS: Record<ComposerPreset, string> = {
  default: "默认（无辅助）",
  helpful: "辅助",
  smart: "智能",
};

const COMPOSER_PRESET_CONFIGS: Record<ComposerPreset, ComposerPresetSettings> = {
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

const normalizeOverrideValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeWorktreeSetupScript = (
  value: string | null | undefined,
): string | null => {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
};

const buildWorkspaceOverrideDrafts = (
  projects: WorkspaceInfo[],
  prev: Record<string, string>,
  getValue: (workspace: WorkspaceInfo) => string | null | undefined,
): Record<string, string> => {
  const next: Record<string, string> = {};
  projects.forEach((workspace) => {
    const existing = prev[workspace.id];
    next[workspace.id] = existing ?? getValue(workspace) ?? "";
  });
  return next;
};

export type SettingsViewProps = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: Array<{
    id: string | null;
    name: string;
    workspaces: WorkspaceInfo[];
  }>;
  ungroupedLabel: string;
  onClose: () => void;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  onCreateWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
  onRenameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
  onAssignWorkspaceGroup: (
    workspaceId: string,
    groupId: string | null,
  ) => Promise<boolean | null>;
  reduceTransparency: boolean;
  onToggleTransparency: (value: boolean) => void;
  appSettings: AppSettings;
  openAppIconById: Record<string, string>;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onRunDoctor: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexDoctorResult>;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
  initialSection?: CodexSection;
};

type SettingsSection =
  | "projects"
  | "environments"
  | "display"
  | "composer"
  | "dictation"
  | "shortcuts"
  | "open-apps"
  | "git";
type CodexSection = SettingsSection | "codex" | "features";
type ShortcutSettingKey =
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
type ShortcutDraftKey =
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

type OpenAppDraft = OpenAppTarget & { argsText: string };

const shortcutDraftKeyBySetting: Record<ShortcutSettingKey, ShortcutDraftKey> = {
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

const buildOpenAppDrafts = (targets: OpenAppTarget[]): OpenAppDraft[] =>
  targets.map((target) => ({
    ...target,
    argsText: target.args.join(" "),
  }));

const isOpenAppLabelValid = (label: string) => label.trim().length > 0;

const isOpenAppDraftComplete = (draft: OpenAppDraft) => {
  if (!isOpenAppLabelValid(draft.label)) {
    return false;
  }
  if (draft.kind === "app") {
    return Boolean(draft.appName?.trim());
  }
  if (draft.kind === "command") {
    return Boolean(draft.command?.trim());
  }
  return true;
};

const isOpenAppTargetComplete = (target: OpenAppTarget) => {
  if (!isOpenAppLabelValid(target.label)) {
    return false;
  }
  if (target.kind === "app") {
    return Boolean(target.appName?.trim());
  }
  if (target.kind === "command") {
    return Boolean(target.command?.trim());
  }
  return true;
};

const createOpenAppId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `open-app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function SettingsView({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  onClose,
  onMoveWorkspace,
  onDeleteWorkspace,
  onCreateWorkspaceGroup,
  onRenameWorkspaceGroup,
  onMoveWorkspaceGroup,
  onDeleteWorkspaceGroup,
  onAssignWorkspaceGroup,
  reduceTransparency,
  onToggleTransparency,
  appSettings,
  openAppIconById,
  onUpdateAppSettings,
  onRunDoctor,
  onUpdateWorkspaceCodexBin,
  onUpdateWorkspaceSettings,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
  onTestSystemNotification,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
  initialSection,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<CodexSection>("projects");
  const [environmentWorkspaceId, setEnvironmentWorkspaceId] = useState<string | null>(
    null,
  );
  const [environmentDraftScript, setEnvironmentDraftScript] = useState("");
  const [environmentSavedScript, setEnvironmentSavedScript] = useState<string | null>(
    null,
  );
  const [environmentLoadedWorkspaceId, setEnvironmentLoadedWorkspaceId] = useState<
    string | null
  >(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentSaving, setEnvironmentSaving] = useState(false);
  const [codexPathDraft, setCodexPathDraft] = useState(appSettings.codexBin ?? "");
  const [codexArgsDraft, setCodexArgsDraft] = useState(appSettings.codexArgs ?? "");
  const [remoteHostDraft, setRemoteHostDraft] = useState(appSettings.remoteBackendHost);
  const [remoteTokenDraft, setRemoteTokenDraft] = useState(appSettings.remoteBackendToken ?? "");
  const [scaleDraft, setScaleDraft] = useState(
    `${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`,
  );
  const [uiFontDraft, setUiFontDraft] = useState(appSettings.uiFontFamily);
  const [codeFontDraft, setCodeFontDraft] = useState(appSettings.codeFontFamily);
  const [codeFontSizeDraft, setCodeFontSizeDraft] = useState(appSettings.codeFontSize);
  const [codexBinOverrideDrafts, setCodexBinOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [codexHomeOverrideDrafts, setCodexHomeOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [codexArgsOverrideDrafts, setCodexArgsOverrideDrafts] = useState<
    Record<string, string>
  >({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [openAppDrafts, setOpenAppDrafts] = useState<OpenAppDraft[]>(() =>
    buildOpenAppDrafts(appSettings.openAppTargets),
  );
  const [openAppSelectedId, setOpenAppSelectedId] = useState(
    appSettings.selectedOpenAppId,
  );
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });
  const {
    content: globalAgentsContent,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    error: globalAgentsError,
    isDirty: globalAgentsDirty,
    setContent: setGlobalAgentsContent,
    refresh: refreshGlobalAgents,
    save: saveGlobalAgents,
  } = useGlobalAgentsMd();
  const {
    content: globalConfigContent,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    error: globalConfigError,
    isDirty: globalConfigDirty,
    setContent: setGlobalConfigContent,
    refresh: refreshGlobalConfig,
    save: saveGlobalConfig,
  } = useGlobalCodexConfigToml();
  const [openConfigError, setOpenConfigError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [shortcutDrafts, setShortcutDrafts] = useState({
    model: appSettings.composerModelShortcut ?? "",
    access: appSettings.composerAccessShortcut ?? "",
    reasoning: appSettings.composerReasoningShortcut ?? "",
    collaboration: appSettings.composerCollaborationShortcut ?? "",
    interrupt: appSettings.interruptShortcut ?? "",
    newAgent: appSettings.newAgentShortcut ?? "",
    newWorktreeAgent: appSettings.newWorktreeAgentShortcut ?? "",
    newCloneAgent: appSettings.newCloneAgentShortcut ?? "",
    archiveThread: appSettings.archiveThreadShortcut ?? "",
    projectsSidebar: appSettings.toggleProjectsSidebarShortcut ?? "",
    gitSidebar: appSettings.toggleGitSidebarShortcut ?? "",
    branchSwitcher: appSettings.branchSwitcherShortcut ?? "",
    debugPanel: appSettings.toggleDebugPanelShortcut ?? "",
    terminal: appSettings.toggleTerminalShortcut ?? "",
    cycleAgentNext: appSettings.cycleAgentNextShortcut ?? "",
    cycleAgentPrev: appSettings.cycleAgentPrevShortcut ?? "",
    cycleWorkspaceNext: appSettings.cycleWorkspaceNextShortcut ?? "",
    cycleWorkspacePrev: appSettings.cycleWorkspacePrevShortcut ?? "",
  });
  const dictationReady = dictationModelStatus?.state === "ready";
  const dictationProgress = dictationModelStatus?.progress ?? null;
  const globalAgentsStatus = globalAgentsLoading
    ? "加载中…"
    : globalAgentsSaving
      ? "保存中…"
      : globalAgentsExists
        ? ""
        : "未找到";
  const globalAgentsMetaParts: string[] = [];
  if (globalAgentsStatus) {
    globalAgentsMetaParts.push(globalAgentsStatus);
  }
  if (globalAgentsTruncated) {
    globalAgentsMetaParts.push("已截断");
  }
  const globalAgentsMeta = globalAgentsMetaParts.join(" · ");
  const globalAgentsSaveLabel = globalAgentsExists ? "保存" : "创建";
  const globalAgentsSaveDisabled = globalAgentsLoading || globalAgentsSaving || !globalAgentsDirty;
  const globalAgentsRefreshDisabled = globalAgentsLoading || globalAgentsSaving;
  const globalConfigStatus = globalConfigLoading
    ? "加载中…"
    : globalConfigSaving
      ? "保存中…"
      : globalConfigExists
        ? ""
        : "未找到";
  const globalConfigMetaParts: string[] = [];
  if (globalConfigStatus) {
    globalConfigMetaParts.push(globalConfigStatus);
  }
  if (globalConfigTruncated) {
    globalConfigMetaParts.push("已截断");
  }
  const globalConfigMeta = globalConfigMetaParts.join(" · ");
  const globalConfigSaveLabel = globalConfigExists ? "保存" : "创建";
  const globalConfigSaveDisabled = globalConfigLoading || globalConfigSaving || !globalConfigDirty;
  const globalConfigRefreshDisabled = globalConfigLoading || globalConfigSaving;
  const optionKeyLabel = isMacPlatform() ? "Option 键" : "Alt 键";
  const metaKeyLabel = isMacPlatform()
    ? "Command 键"
    : isWindowsPlatform()
      ? "Windows 键"
      : "Meta 键";
  const selectedDictationModel = useMemo(() => {
    return (
      DICTATION_MODELS.find(
        (model) => model.id === appSettings.dictationModelId,
      ) ?? DICTATION_MODELS[1]
    );
  }, [appSettings.dictationModelId]);

  const projects = useMemo(
    () => groupedWorkspaces.flatMap((group) => group.workspaces),
    [groupedWorkspaces],
  );
  const mainWorkspaces = useMemo(
    () => projects.filter((workspace) => (workspace.kind ?? "main") !== "worktree"),
    [projects],
  );
  const environmentWorkspace = useMemo(() => {
    if (mainWorkspaces.length === 0) {
      return null;
    }
    if (environmentWorkspaceId) {
      const found = mainWorkspaces.find((workspace) => workspace.id === environmentWorkspaceId);
      if (found) {
        return found;
      }
    }
    return mainWorkspaces[0] ?? null;
  }, [environmentWorkspaceId, mainWorkspaces]);
  const environmentSavedScriptFromWorkspace = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentWorkspace?.settings.worktreeSetupScript);
  }, [environmentWorkspace?.settings.worktreeSetupScript]);
  const environmentDraftNormalized = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentDraftScript);
  }, [environmentDraftScript]);
  const environmentDirty = environmentDraftNormalized !== environmentSavedScript;
  const hasCodexHomeOverrides = useMemo(
    () => projects.some((workspace) => workspace.settings.codexHome != null),
    [projects],
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    const handleCloseShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keydown", handleCloseShortcut);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keydown", handleCloseShortcut);
    };
  }, [onClose]);

  useEffect(() => {
    setCodexPathDraft(appSettings.codexBin ?? "");
  }, [appSettings.codexBin]);

  useEffect(() => {
    setCodexArgsDraft(appSettings.codexArgs ?? "");
  }, [appSettings.codexArgs]);

  useEffect(() => {
    setRemoteHostDraft(appSettings.remoteBackendHost);
  }, [appSettings.remoteBackendHost]);

  useEffect(() => {
    setRemoteTokenDraft(appSettings.remoteBackendToken ?? "");
  }, [appSettings.remoteBackendToken]);

  useEffect(() => {
    setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
  }, [appSettings.uiScale]);

  useEffect(() => {
    setUiFontDraft(appSettings.uiFontFamily);
  }, [appSettings.uiFontFamily]);

  useEffect(() => {
    setCodeFontDraft(appSettings.codeFontFamily);
  }, [appSettings.codeFontFamily]);

  useEffect(() => {
    setCodeFontSizeDraft(appSettings.codeFontSize);
  }, [appSettings.codeFontSize]);

  useEffect(() => {
    setOpenAppDrafts(buildOpenAppDrafts(appSettings.openAppTargets));
    setOpenAppSelectedId(appSettings.selectedOpenAppId);
  }, [appSettings.openAppTargets, appSettings.selectedOpenAppId]);

  useEffect(() => {
    setShortcutDrafts({
      model: appSettings.composerModelShortcut ?? "",
      access: appSettings.composerAccessShortcut ?? "",
      reasoning: appSettings.composerReasoningShortcut ?? "",
      collaboration: appSettings.composerCollaborationShortcut ?? "",
      interrupt: appSettings.interruptShortcut ?? "",
      newAgent: appSettings.newAgentShortcut ?? "",
      newWorktreeAgent: appSettings.newWorktreeAgentShortcut ?? "",
      newCloneAgent: appSettings.newCloneAgentShortcut ?? "",
      archiveThread: appSettings.archiveThreadShortcut ?? "",
      projectsSidebar: appSettings.toggleProjectsSidebarShortcut ?? "",
      gitSidebar: appSettings.toggleGitSidebarShortcut ?? "",
      branchSwitcher: appSettings.branchSwitcherShortcut ?? "",
      debugPanel: appSettings.toggleDebugPanelShortcut ?? "",
      terminal: appSettings.toggleTerminalShortcut ?? "",
      cycleAgentNext: appSettings.cycleAgentNextShortcut ?? "",
      cycleAgentPrev: appSettings.cycleAgentPrevShortcut ?? "",
      cycleWorkspaceNext: appSettings.cycleWorkspaceNextShortcut ?? "",
      cycleWorkspacePrev: appSettings.cycleWorkspacePrevShortcut ?? "",
    });
  }, [
    appSettings.composerAccessShortcut,
    appSettings.composerModelShortcut,
    appSettings.composerReasoningShortcut,
    appSettings.composerCollaborationShortcut,
    appSettings.interruptShortcut,
    appSettings.newAgentShortcut,
    appSettings.newWorktreeAgentShortcut,
    appSettings.newCloneAgentShortcut,
    appSettings.archiveThreadShortcut,
    appSettings.toggleProjectsSidebarShortcut,
    appSettings.toggleGitSidebarShortcut,
    appSettings.branchSwitcherShortcut,
    appSettings.toggleDebugPanelShortcut,
    appSettings.toggleTerminalShortcut,
    appSettings.cycleAgentNextShortcut,
    appSettings.cycleAgentPrevShortcut,
    appSettings.cycleWorkspaceNextShortcut,
    appSettings.cycleWorkspacePrevShortcut,
  ]);

  const handleOpenConfig = useCallback(async () => {
    setOpenConfigError(null);
    try {
      const configPath = await getCodexConfigPath();
      await revealItemInDir(configPath);
    } catch (error) {
      setOpenConfigError(
        error instanceof Error ? error.message : "无法打开配置文件。",
      );
    }
  }, []);

  useEffect(() => {
    setCodexBinOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.codex_bin ?? null,
      ),
    );
    setCodexHomeOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.settings.codexHome ?? null,
      ),
    );
    setCodexArgsOverrideDrafts((prev) =>
      buildWorkspaceOverrideDrafts(
        projects,
        prev,
        (workspace) => workspace.settings.codexArgs ?? null,
      ),
    );
  }, [projects]);

  useEffect(() => {
    setGroupDrafts((prev) => {
      const next: Record<string, string> = {};
      workspaceGroups.forEach((group) => {
        next[group.id] = prev[group.id] ?? group.name;
      });
      return next;
    });
  }, [workspaceGroups]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    if (!environmentWorkspace) {
      setEnvironmentWorkspaceId(null);
      setEnvironmentLoadedWorkspaceId(null);
      setEnvironmentSavedScript(null);
      setEnvironmentDraftScript("");
      setEnvironmentError(null);
      setEnvironmentSaving(false);
      return;
    }

    if (environmentWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentWorkspaceId(environmentWorkspace.id);
    }
  }, [environmentWorkspace, environmentWorkspaceId]);

  useEffect(() => {
    if (!environmentWorkspace) {
      return;
    }

    if (environmentLoadedWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentLoadedWorkspaceId(environmentWorkspace.id);
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setEnvironmentError(null);
      return;
    }

    if (!environmentDirty && environmentSavedScript !== environmentSavedScriptFromWorkspace) {
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setEnvironmentError(null);
    }
  }, [
    environmentDirty,
    environmentLoadedWorkspaceId,
    environmentSavedScript,
    environmentSavedScriptFromWorkspace,
    environmentWorkspace,
  ]);

  const nextCodexBin = codexPathDraft.trim() ? codexPathDraft.trim() : null;
  const nextCodexArgs = codexArgsDraft.trim() ? codexArgsDraft.trim() : null;
  const codexDirty =
    nextCodexBin !== (appSettings.codexBin ?? null) ||
    nextCodexArgs !== (appSettings.codexArgs ?? null);

  const trimmedScale = scaleDraft.trim();
  const parsedPercent = trimmedScale
    ? Number(trimmedScale.replace("%", ""))
    : Number.NaN;
  const parsedScale = Number.isFinite(parsedPercent) ? parsedPercent / 100 : null;

  const handleSaveCodexSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        codexBin: nextCodexBin,
        codexArgs: nextCodexArgs,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCommitRemoteHost = async () => {
    const nextHost = remoteHostDraft.trim() || "127.0.0.1:4732";
    setRemoteHostDraft(nextHost);
    if (nextHost === appSettings.remoteBackendHost) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      remoteBackendHost: nextHost,
    });
  };

  const handleCommitRemoteToken = async () => {
    const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
    setRemoteTokenDraft(nextToken ?? "");
    if (nextToken === appSettings.remoteBackendToken) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      remoteBackendToken: nextToken,
    });
  };

  const handleCommitScale = async () => {
    if (parsedScale === null) {
      setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
      return;
    }
    const nextScale = clampUiScale(parsedScale);
    setScaleDraft(`${Math.round(nextScale * 100)}%`);
    if (nextScale === appSettings.uiScale) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: nextScale,
    });
  };

  const handleResetScale = async () => {
    if (appSettings.uiScale === 1) {
      setScaleDraft("100%");
      return;
    }
    setScaleDraft("100%");
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: 1,
    });
  };

  const handleCommitUiFont = async () => {
    const nextFont = normalizeFontFamily(
      uiFontDraft,
      DEFAULT_UI_FONT_FAMILY,
    );
    setUiFontDraft(nextFont);
    if (nextFont === appSettings.uiFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiFontFamily: nextFont,
    });
  };

  const handleCommitCodeFont = async () => {
    const nextFont = normalizeFontFamily(
      codeFontDraft,
      DEFAULT_CODE_FONT_FAMILY,
    );
    setCodeFontDraft(nextFont);
    if (nextFont === appSettings.codeFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontFamily: nextFont,
    });
  };

  const handleCommitCodeFontSize = async (nextSize: number) => {
    const clampedSize = clampCodeFontSize(nextSize);
    setCodeFontSizeDraft(clampedSize);
    if (clampedSize === appSettings.codeFontSize) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontSize: clampedSize,
    });
  };

  const normalizeOpenAppTargets = useCallback(
    (drafts: OpenAppDraft[]): OpenAppTarget[] =>
      drafts.map(({ argsText, ...target }) => ({
        ...target,
        label: target.label.trim(),
        appName: (target.appName?.trim() ?? "") || null,
        command: (target.command?.trim() ?? "") || null,
        args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
      })),
    [],
  );

  const handleCommitOpenApps = useCallback(
    async (drafts: OpenAppDraft[], selectedId = openAppSelectedId) => {
      const nextTargets = normalizeOpenAppTargets(drafts);
      const resolvedSelectedId = nextTargets.find(
        (target) => target.id === selectedId && isOpenAppTargetComplete(target),
      )?.id;
      const firstCompleteId = nextTargets.find(isOpenAppTargetComplete)?.id;
      const nextSelectedId =
        resolvedSelectedId ??
        firstCompleteId ??
        nextTargets[0]?.id ??
        DEFAULT_OPEN_APP_ID;
      setOpenAppDrafts(buildOpenAppDrafts(nextTargets));
      setOpenAppSelectedId(nextSelectedId);
      await onUpdateAppSettings({
        ...appSettings,
        openAppTargets: nextTargets,
        selectedOpenAppId: nextSelectedId,
      });
    },
    [
      appSettings,
      normalizeOpenAppTargets,
      onUpdateAppSettings,
      openAppSelectedId,
    ],
  );

  const handleOpenAppDraftChange = (
    index: number,
    updates: Partial<OpenAppDraft>,
  ) => {
    setOpenAppDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }
      next[index] = { ...current, ...updates };
      return next;
    });
  };

  const handleOpenAppKindChange = (index: number, kind: OpenAppTarget["kind"]) => {
    setOpenAppDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) {
        return prev;
      }
      next[index] = {
        ...current,
        kind,
        appName: kind === "app" ? current.appName ?? "" : null,
        command: kind === "command" ? current.command ?? "" : null,
        argsText: kind === "finder" ? "" : current.argsText,
      };
      void handleCommitOpenApps(next);
      return next;
    });
  };

  const handleMoveOpenApp = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= openAppDrafts.length) {
      return;
    }
    const next = [...openAppDrafts];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next);
  };

  const handleDeleteOpenApp = (index: number) => {
    if (openAppDrafts.length <= 1) {
      return;
    }
    const removed = openAppDrafts[index];
    const next = openAppDrafts.filter((_, draftIndex) => draftIndex !== index);
    const nextSelected =
      removed?.id === openAppSelectedId ? next[0]?.id ?? DEFAULT_OPEN_APP_ID : openAppSelectedId;
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next, nextSelected);
  };

  const handleAddOpenApp = () => {
    const newTarget: OpenAppDraft = {
      id: createOpenAppId(),
      label: "新应用",
      kind: "app",
      appName: "",
      command: null,
      args: [],
      argsText: "",
    };
    const next = [...openAppDrafts, newTarget];
    setOpenAppDrafts(next);
    void handleCommitOpenApps(next, newTarget.id);
  };

  const handleSelectOpenAppDefault = (id: string) => {
    const selectedTarget = openAppDrafts.find((target) => target.id === id);
    if (selectedTarget && !isOpenAppDraftComplete(selectedTarget)) {
      return;
    }
    setOpenAppSelectedId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OPEN_APP_STORAGE_KEY, id);
    }
    void handleCommitOpenApps(openAppDrafts, id);
  };

  const handleComposerPresetChange = (preset: ComposerPreset) => {
    const config = COMPOSER_PRESET_CONFIGS[preset];
    void onUpdateAppSettings({
      ...appSettings,
      composerEditorPreset: preset,
      ...config,
    });
  };

  const handleBrowseCodex = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setCodexPathDraft(selection);
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(nextCodexBin, nextCodexArgs);
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          codexBin: nextCodexBin,
          version: null,
          appServerOk: false,
          details: error instanceof Error ? error.message : String(error),
          path: null,
          nodeOk: false,
          nodeVersion: null,
          nodeDetails: null,
        },
      });
    }
  };

  const updateShortcut = async (key: ShortcutSettingKey, value: string | null) => {
    const draftKey = shortcutDraftKeyBySetting[key];
    setShortcutDrafts((prev) => ({
      ...prev,
      [draftKey]: value ?? "",
    }));
    await onUpdateAppSettings({
      ...appSettings,
      [key]: value,
    });
  };

  const handleShortcutKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => {
    if (event.key === "Tab" && key !== "composerCollaborationShortcut") {
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      void updateShortcut(key, null);
      return;
    }
    const value = buildShortcutValue(event.nativeEvent);
    if (!value) {
      return;
    }
    void updateShortcut(key, value);
  };

  const handleSaveEnvironmentSetup = async () => {
    if (!environmentWorkspace || environmentSaving) {
      return;
    }
    const nextScript = environmentDraftNormalized;
    setEnvironmentSaving(true);
    setEnvironmentError(null);
    try {
      await onUpdateWorkspaceSettings(environmentWorkspace.id, {
        worktreeSetupScript: nextScript,
      });
      setEnvironmentSavedScript(nextScript);
      setEnvironmentDraftScript(nextScript ?? "");
    } catch (error) {
      setEnvironmentError(error instanceof Error ? error.message : String(error));
    } finally {
      setEnvironmentSaving(false);
    }
  };

  const trimmedGroupName = newGroupName.trim();
  const canCreateGroup = Boolean(trimmedGroupName);

  const handleCreateGroup = async () => {
    setGroupError(null);
    try {
      const created = await onCreateWorkspaceGroup(newGroupName);
      if (created) {
        setNewGroupName("");
      }
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRenameGroup = async (group: WorkspaceGroup) => {
    const draft = groupDrafts[group.id] ?? "";
    const trimmed = draft.trim();
    if (!trimmed || trimmed === group.name) {
      setGroupDrafts((prev) => ({
        ...prev,
        [group.id]: group.name,
      }));
      return;
    }
    setGroupError(null);
    try {
      await onRenameWorkspaceGroup(group.id, trimmed);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
      setGroupDrafts((prev) => ({
        ...prev,
        [group.id]: group.name,
      }));
    }
  };

  const updateGroupCopiesFolder = async (
    groupId: string,
    copiesFolder: string | null,
  ) => {
    setGroupError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        workspaceGroups: appSettings.workspaceGroups.map((entry) =>
          entry.id === groupId ? { ...entry, copiesFolder } : entry,
        ),
      });
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleChooseGroupCopiesFolder = async (group: WorkspaceGroup) => {
    const selection = await open({ multiple: false, directory: true });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    await updateGroupCopiesFolder(group.id, selection);
  };

  const handleClearGroupCopiesFolder = async (group: WorkspaceGroup) => {
    if (!group.copiesFolder) {
      return;
    }
    await updateGroupCopiesFolder(group.id, null);
  };

  const handleDeleteGroup = async (group: WorkspaceGroup) => {
    const groupProjects =
      groupedWorkspaces.find((entry) => entry.id === group.id)?.workspaces ?? [];
    const detail =
      groupProjects.length > 0
        ? `\n\n该组内的工作区将移动到“${ungroupedLabel}”。`
        : "";
    const confirmed = await ask(
      `删除“${group.name}”？${detail}`,
      {
        title: "删除分组",
        kind: "warning",
        okLabel: "删除",
        cancelLabel: "取消",
      },
    );
    if (!confirmed) {
      return;
    }
    setGroupError(null);
    try {
      await onDeleteWorkspaceGroup(group.id);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <ModalShell
      className="settings-overlay"
      cardClassName="settings-window"
      onBackdropClick={onClose}
      ariaLabelledBy="settings-modal-title"
    >
      <div className="settings-titlebar">
        <div className="settings-title" id="settings-modal-title">
          设置
        </div>
        <button
          type="button"
          className="ghost icon-button settings-close"
          onClick={onClose}
          aria-label="关闭设置"
        >
          <X aria-hidden />
        </button>
      </div>
      <div className="settings-body">
        <aside className="settings-sidebar">
            <button
              type="button"
              className={`settings-nav ${activeSection === "projects" ? "active" : ""}`}
              onClick={() => setActiveSection("projects")}
            >
              <LayoutGrid aria-hidden />
              工作区
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "environments" ? "active" : ""}`}
              onClick={() => setActiveSection("environments")}
            >
              <Layers aria-hidden />
              环境
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "display" ? "active" : ""}`}
              onClick={() => setActiveSection("display")}
            >
              <SlidersHorizontal aria-hidden />
              显示与声音
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "composer" ? "active" : ""}`}
              onClick={() => setActiveSection("composer")}
            >
              <FileText aria-hidden />
              编写器
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "dictation" ? "active" : ""}`}
              onClick={() => setActiveSection("dictation")}
            >
              <Mic aria-hidden />
              听写
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "shortcuts" ? "active" : ""}`}
              onClick={() => setActiveSection("shortcuts")}
            >
              <Keyboard aria-hidden />
              快捷键
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "open-apps" ? "active" : ""}`}
              onClick={() => setActiveSection("open-apps")}
            >
              <ExternalLink aria-hidden />
              打开方式
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "git" ? "active" : ""}`}
              onClick={() => setActiveSection("git")}
            >
              <GitBranch aria-hidden />
              Git
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "codex" ? "active" : ""}`}
              onClick={() => setActiveSection("codex")}
            >
              <TerminalSquare aria-hidden />
              Codex
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "features" ? "active" : ""}`}
              onClick={() => setActiveSection("features")}
            >
              <FlaskConical aria-hidden />
              功能
            </button>
          </aside>
          <div className="settings-content">
            {activeSection === "projects" && (
              <section className="settings-section">
                <div className="settings-section-title">工作区</div>
                <div className="settings-section-subtitle">
                  将相关工作区分组并在组内调整顺序。
                </div>
                <div className="settings-subsection-title">分组</div>
                <div className="settings-subsection-subtitle">
                  为相关仓库创建分组标签。
                </div>
                <div className="settings-groups">
                  <div className="settings-group-create">
                    <input
                      className="settings-input settings-input--compact"
                      value={newGroupName}
                      placeholder="新分组名称"
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canCreateGroup) {
                          event.preventDefault();
                          void handleCreateGroup();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        void handleCreateGroup();
                      }}
                      disabled={!canCreateGroup}
                    >
                      添加分组
                    </button>
                  </div>
                  {groupError && <div className="settings-group-error">{groupError}</div>}
                  {workspaceGroups.length > 0 ? (
                    <div className="settings-group-list">
                      {workspaceGroups.map((group, index) => (
                        <div key={group.id} className="settings-group-row">
                          <div className="settings-group-fields">
                            <input
                              className="settings-input settings-input--compact"
                              value={groupDrafts[group.id] ?? group.name}
                              onChange={(event) =>
                                setGroupDrafts((prev) => ({
                                  ...prev,
                                  [group.id]: event.target.value,
                                }))
                              }
                              onBlur={() => {
                                void handleRenameGroup(group);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleRenameGroup(group);
                                }
                              }}
                            />
                            <div className="settings-group-copies">
                              <div className="settings-group-copies-label">
                                副本文件夹
                              </div>
                              <div className="settings-group-copies-row">
                                <div
                                  className={`settings-group-copies-path${
                                    group.copiesFolder ? "" : " empty"
                                  }`}
                                  title={group.copiesFolder ?? ""}
                                >
                                  {group.copiesFolder ?? "未设置"}
                                </div>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleChooseGroupCopiesFolder(group);
                                  }}
                                >
                                  选择…
                                </button>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleClearGroupCopiesFolder(group);
                                  }}
                                  disabled={!group.copiesFolder}
                                >
                                  清除
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="settings-group-actions">
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void onMoveWorkspaceGroup(group.id, "up");
                              }}
                              disabled={index === 0}
                              aria-label="上移分组"
                            >
                              <ChevronUp aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void onMoveWorkspaceGroup(group.id, "down");
                              }}
                              disabled={index === workspaceGroups.length - 1}
                              aria-label="下移分组"
                            >
                              <ChevronDown aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void handleDeleteGroup(group);
                              }}
                              aria-label="删除分组"
                            >
                              <Trash2 aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="settings-empty">暂无分组。</div>
                  )}
                </div>
                <div className="settings-subsection-title">工作区</div>
                <div className="settings-subsection-subtitle">
                  将工作区分配到分组并调整顺序。
                </div>
                <div className="settings-projects">
                  {groupedWorkspaces.map((group) => (
                    <div key={group.id ?? "ungrouped"} className="settings-project-group">
                      <div className="settings-project-group-label">{group.name}</div>
                      {group.workspaces.map((workspace, index) => {
                        const groupValue =
                          workspaceGroups.some(
                            (entry) => entry.id === workspace.settings.groupId,
                          )
                            ? workspace.settings.groupId ?? ""
                            : "";
                        return (
                          <div key={workspace.id} className="settings-project-row">
                            <div className="settings-project-info">
                              <div className="settings-project-name">{workspace.name}</div>
                              <div className="settings-project-path">{workspace.path}</div>
                            </div>
                            <div className="settings-project-actions">
                              <select
                                className="settings-select settings-select--compact"
                                value={groupValue}
                                onChange={(event) => {
                                  const nextGroupId = event.target.value || null;
                                  void onAssignWorkspaceGroup(
                                    workspace.id,
                                    nextGroupId,
                                  );
                                }}
                              >
                                <option value="">{ungroupedLabel}</option>
                                {workspaceGroups.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="ghost icon-button"
                              onClick={() => onMoveWorkspace(workspace.id, "up")}
                              disabled={index === 0}
                              aria-label="上移工作区"
                            >
                                <ChevronUp aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="ghost icon-button"
                              onClick={() => onMoveWorkspace(workspace.id, "down")}
                              disabled={index === group.workspaces.length - 1}
                              aria-label="下移工作区"
                            >
                                <ChevronDown aria-hidden />
                              </button>
                              <button
                                type="button"
                              className="ghost icon-button"
                              onClick={() => onDeleteWorkspace(workspace.id)}
                              aria-label="删除工作区"
                            >
                                <Trash2 aria-hidden />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="settings-empty">暂无工作区。</div>
                  )}
                </div>
              </section>
            )}
            {activeSection === "environments" && (
              <section className="settings-section">
                <div className="settings-section-title">环境</div>
                <div className="settings-section-subtitle">
                  配置每个工作区的环境脚本，在创建工作树后运行。
                </div>
                {mainWorkspaces.length === 0 ? (
                  <div className="settings-empty">暂无工作区。</div>
                ) : (
                  <>
                    <div className="settings-field">
                      <label
                        className="settings-field-label"
                        htmlFor="settings-environment-project"
                      >
                        工作区
                      </label>
                      <select
                        id="settings-environment-project"
                        className="settings-select"
                        value={environmentWorkspace?.id ?? ""}
                        onChange={(event) => setEnvironmentWorkspaceId(event.target.value)}
                        disabled={environmentSaving}
                      >
                        {mainWorkspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                      {environmentWorkspace ? (
                        <div className="settings-help">{environmentWorkspace.path}</div>
                      ) : null}
                    </div>

                    <div className="settings-field">
                      <div className="settings-field-label">环境设置脚本</div>
                      <div className="settings-help">
                        每次创建新工作树后，会在专用终端中运行一次。
                      </div>
                      {environmentError ? (
                        <div className="settings-agents-error">{environmentError}</div>
                      ) : null}
                      <textarea
                        className="settings-agents-textarea"
                        value={environmentDraftScript}
                        onChange={(event) => setEnvironmentDraftScript(event.target.value)}
                        placeholder="pnpm install"
                        spellCheck={false}
                        disabled={environmentSaving}
                      />
                      <div className="settings-field-actions">
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={() => {
                            const clipboard =
                              typeof navigator === "undefined" ? null : navigator.clipboard;
                            if (!clipboard?.writeText) {
                              pushErrorToast({
                                title: "复制失败",
                                message:
                                  "当前环境无法访问剪贴板，请手动复制脚本。",
                              });
                              return;
                            }

                            void clipboard.writeText(environmentDraftScript).catch(() => {
                              pushErrorToast({
                                title: "复制失败",
                                message:
                                  "无法写入剪贴板，请手动复制脚本。",
                              });
                            });
                          }}
                          disabled={environmentSaving || environmentDraftScript.length === 0}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={() => setEnvironmentDraftScript(environmentSavedScript ?? "")}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          重置
                        </button>
                        <button
                          type="button"
                          className="primary settings-button-compact"
                          onClick={() => {
                            void handleSaveEnvironmentSetup();
                          }}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          {environmentSaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
            {activeSection === "display" && (
              <section className="settings-section">
                <div className="settings-section-title">显示与声音</div>
                <div className="settings-section-subtitle">
                  调整视觉效果与提示音。
                </div>
                <div className="settings-subsection-title">显示</div>
                <div className="settings-subsection-subtitle">
                  调整窗口背景和效果的渲染方式。
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="theme-select">
                    主题
                  </label>
                  <select
                    id="theme-select"
                    className="settings-select"
                    value={appSettings.theme}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        theme: event.target.value as AppSettings["theme"],
                      })
                    }
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                    <option value="dim">微暗</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">
                      显示剩余 Codex 限额
                    </div>
                    <div className="settings-toggle-subtitle">
                      显示剩余而不是已使用。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      appSettings.usageShowRemaining ? "on" : ""
                    }`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        usageShowRemaining: !appSettings.usageShowRemaining,
                      })
                    }
                    aria-pressed={appSettings.usageShowRemaining}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">降低透明度</div>
                    <div className="settings-toggle-subtitle">
                      使用不透明界面替代玻璃效果。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${reduceTransparency ? "on" : ""}`}
                    onClick={() => onToggleTransparency(!reduceTransparency)}
                    aria-pressed={reduceTransparency}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row settings-scale-row">
                  <div>
                    <div className="settings-toggle-title">界面缩放</div>
                    <div
                      className="settings-toggle-subtitle"
                      title={scaleShortcutTitle}
                    >
                      {scaleShortcutText}
                    </div>
                  </div>
                  <div className="settings-scale-controls">
                    <input
                      id="ui-scale"
                      type="text"
                      inputMode="decimal"
                      className="settings-input settings-input--scale"
                      value={scaleDraft}
                      aria-label="界面缩放"
                      onChange={(event) => setScaleDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitScale();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitScale();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-scale-reset"
                      onClick={() => {
                        void handleResetScale();
                      }}
                    >
                      重置
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="ui-font-family">
                    界面字体
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="ui-font-family"
                      type="text"
                      className="settings-input"
                      value={uiFontDraft}
                      onChange={(event) => setUiFontDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitUiFont();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitUiFont();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setUiFontDraft(DEFAULT_UI_FONT_FAMILY);
                        void onUpdateAppSettings({
                          ...appSettings,
                          uiFontFamily: DEFAULT_UI_FONT_FAMILY,
                        });
                      }}
                    >
                      重置
                    </button>
                  </div>
                  <div className="settings-help">
                    应用于所有界面文字。留空将使用系统默认字体。
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-family">
                    代码字体
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="code-font-family"
                      type="text"
                      className="settings-input"
                      value={codeFontDraft}
                      onChange={(event) => setCodeFontDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitCodeFont();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitCodeFont();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setCodeFontDraft(DEFAULT_CODE_FONT_FAMILY);
                        void onUpdateAppSettings({
                          ...appSettings,
                          codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
                        });
                      }}
                    >
                      重置
                    </button>
                  </div>
                  <div className="settings-help">
                    应用于 Git 差异和其他等宽显示内容。
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-size">
                    代码字号
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="code-font-size"
                      type="range"
                      min={CODE_FONT_SIZE_MIN}
                      max={CODE_FONT_SIZE_MAX}
                      step={1}
                      className="settings-input settings-input--range"
                      value={codeFontSizeDraft}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setCodeFontSizeDraft(nextValue);
                        void handleCommitCodeFontSize(nextValue);
                      }}
                    />
                    <div className="settings-scale-value">{codeFontSizeDraft}px</div>
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => {
                        setCodeFontSizeDraft(CODE_FONT_SIZE_DEFAULT);
                        void handleCommitCodeFontSize(CODE_FONT_SIZE_DEFAULT);
                      }}
                    >
                      重置
                    </button>
                  </div>
                  <div className="settings-help">
                    调整代码与差异文字大小。
                  </div>
                </div>
                <div className="settings-subsection-title">声音</div>
                <div className="settings-subsection-subtitle">
                  控制通知音效。
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">通知提示音</div>
                    <div className="settings-toggle-subtitle">
                      当窗口不在前台且长时间运行的智能体结束时播放提示音。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.notificationSoundsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        notificationSoundsEnabled: !appSettings.notificationSoundsEnabled,
                      })
                    }
                    aria-pressed={appSettings.notificationSoundsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">系统通知</div>
                    <div className="settings-toggle-subtitle">
                      当窗口不在前台且长时间运行的智能体结束时显示系统通知。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.systemNotificationsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        systemNotificationsEnabled: !appSettings.systemNotificationsEnabled,
                      })
                    }
                    aria-pressed={appSettings.systemNotificationsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-sound-actions">
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestNotificationSound}
                  >
                    测试提示音
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestSystemNotification}
                  >
                    测试通知
                  </button>
                </div>
              </section>
            )}
            {activeSection === "composer" && (
              <section className="settings-section">
                <div className="settings-section-title">编写器</div>
                <div className="settings-section-subtitle">
                  控制消息编辑器中的辅助与格式行为。
                </div>
                <div className="settings-subsection-title">预设</div>
                <div className="settings-subsection-subtitle">
                  选择起点并微调下方开关。
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="composer-preset">
                    预设
                  </label>
                  <select
                    id="composer-preset"
                    className="settings-select"
                    value={appSettings.composerEditorPreset}
                    onChange={(event) =>
                      handleComposerPresetChange(
                        event.target.value as ComposerPreset,
                      )
                    }
                  >
                    {Object.entries(COMPOSER_PRESET_LABELS).map(([preset, label]) => (
                      <option key={preset} value={preset}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="settings-help">
                    预设会同步更新下方开关，选择后可继续自定义。
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">代码围栏</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">按空格展开围栏</div>
                    <div className="settings-toggle-subtitle">
                      输入 ``` 后按空格会插入代码块围栏。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceExpandOnSpace ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
                      })
                    }
                    aria-pressed={appSettings.composerFenceExpandOnSpace}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">按回车展开围栏</div>
                    <div className="settings-toggle-subtitle">
                      启用后，可用回车展开 ``` 行。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceExpandOnEnter ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
                      })
                    }
                    aria-pressed={appSettings.composerFenceExpandOnEnter}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">支持语言标签</div>
                    <div className="settings-toggle-subtitle">
                      允许使用 ```lang + 空格 指定语言。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceLanguageTags ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
                      })
                    }
                    aria-pressed={appSettings.composerFenceLanguageTags}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">用围栏包裹选中内容</div>
                    <div className="settings-toggle-subtitle">
                      创建围栏时包裹选中文本。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceWrapSelection ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
                      })
                    }
                    aria-pressed={appSettings.composerFenceWrapSelection}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">复制时不含围栏</div>
                    <div className="settings-toggle-subtitle">
                      启用后，复制为纯文本。按住 {optionKeyLabel} 可包含 ``` 围栏。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerCodeBlockCopyUseModifier ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerCodeBlockCopyUseModifier:
                          !appSettings.composerCodeBlockCopyUseModifier,
                      })
                    }
                    aria-pressed={appSettings.composerCodeBlockCopyUseModifier}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">粘贴</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">多行粘贴自动包裹</div>
                    <div className="settings-toggle-subtitle">
                      将多行粘贴内容包裹在代码块围栏中。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteMultiline ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceAutoWrapPasteMultiline:
                          !appSettings.composerFenceAutoWrapPasteMultiline,
                      })
                    }
                    aria-pressed={appSettings.composerFenceAutoWrapPasteMultiline}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">类代码单行自动包裹</div>
                    <div className="settings-toggle-subtitle">
                      粘贴长单行代码时自动包裹。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerFenceAutoWrapPasteCodeLike ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerFenceAutoWrapPasteCodeLike:
                          !appSettings.composerFenceAutoWrapPasteCodeLike,
                      })
                    }
                    aria-pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">列表</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Shift+Enter 继续列表</div>
                    <div className="settings-toggle-subtitle">
                      当行有内容时继续编号/项目符号列表。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.composerListContinuation ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        composerListContinuation: !appSettings.composerListContinuation,
                      })
                    }
                    aria-pressed={appSettings.composerListContinuation}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
            {activeSection === "dictation" && (
              <section className="settings-section">
                <div className="settings-section-title">听写</div>
                <div className="settings-section-subtitle">
                  启用麦克风听写与本地转写。
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">启用听写</div>
                    <div className="settings-toggle-subtitle">
                      首次使用时下载所选 Whisper 模型。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.dictationEnabled ? "on" : ""}`}
                    onClick={() => {
                      const nextEnabled = !appSettings.dictationEnabled;
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationEnabled: nextEnabled,
                      });
                      if (
                        !nextEnabled &&
                        dictationModelStatus?.state === "downloading" &&
                        onCancelDictationDownload
                      ) {
                        onCancelDictationDownload();
                      }
                      if (
                        nextEnabled &&
                        dictationModelStatus?.state === "missing" &&
                        onDownloadDictationModel
                      ) {
                        onDownloadDictationModel();
                      }
                    }}
                    aria-pressed={appSettings.dictationEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-model">
                    听写模型
                  </label>
                  <select
                    id="dictation-model"
                    className="settings-select"
                    value={appSettings.dictationModelId}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationModelId: event.target.value,
                      })
                    }
                  >
                    {DICTATION_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} ({model.size})
                      </option>
                    ))}
                  </select>
                  <div className="settings-help">
                    {selectedDictationModel.note} 下载大小：{selectedDictationModel.size}。
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-language">
                    偏好的听写语言
                  </label>
                  <select
                    id="dictation-language"
                    className="settings-select"
                    value={appSettings.dictationPreferredLanguage ?? ""}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationPreferredLanguage: event.target.value || null,
                      })
                    }
                  >
                    <option value="">仅自动检测</option>
                    <option value="en">英语</option>
                    <option value="es">西班牙语</option>
                    <option value="fr">法语</option>
                    <option value="de">德语</option>
                    <option value="it">意大利语</option>
                    <option value="pt">葡萄牙语</option>
                    <option value="nl">荷兰语</option>
                    <option value="sv">瑞典语</option>
                    <option value="no">挪威语</option>
                    <option value="da">丹麦语</option>
                    <option value="fi">芬兰语</option>
                    <option value="pl">波兰语</option>
                    <option value="tr">土耳其语</option>
                    <option value="ru">俄语</option>
                    <option value="uk">乌克兰语</option>
                    <option value="ja">日语</option>
                    <option value="ko">韩语</option>
                    <option value="zh">中文</option>
                  </select>
                  <div className="settings-help">
                    自动检测保持开启；此设置会引导解码器偏向你的偏好。
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-hold-key">
                    按住听写键
                  </label>
                  <select
                    id="dictation-hold-key"
                    className="settings-select"
                    value={appSettings.dictationHoldKey ?? ""}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        dictationHoldKey: event.target.value,
                      })
                    }
                  >
                    <option value="">关闭</option>
                    <option value="alt">{optionKeyLabel}</option>
                    <option value="shift">Shift 键</option>
                    <option value="control">Control 键</option>
                    <option value="meta">{metaKeyLabel}</option>
                  </select>
                  <div className="settings-help">
                    按住该键开始听写，松开后停止并处理。
                  </div>
                </div>
                {dictationModelStatus && (
                  <div className="settings-field">
                    <div className="settings-field-label">
                      模型状态（{selectedDictationModel.label}）
                    </div>
                    <div className="settings-help">
                      {dictationModelStatus.state === "ready" && "可开始听写。"}
                      {dictationModelStatus.state === "missing" && "模型尚未下载。"}
                      {dictationModelStatus.state === "downloading" &&
                        "正在下载模型..."}
                      {dictationModelStatus.state === "error" &&
                        (dictationModelStatus.error ?? "下载出错。")}
                    </div>
                    {dictationProgress && (
                      <div className="settings-download-progress">
                        <div className="settings-download-bar">
                          <div
                            className="settings-download-fill"
                            style={{
                              width: dictationProgress.totalBytes
                                ? `${Math.min(
                                    100,
                                    (dictationProgress.downloadedBytes /
                                      dictationProgress.totalBytes) *
                                      100,
                                  )}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <div className="settings-download-meta">
                          {formatDownloadSize(dictationProgress.downloadedBytes)}
                        </div>
                      </div>
                    )}
                    <div className="settings-field-actions">
                      {dictationModelStatus.state === "missing" && (
                        <button
                          type="button"
                          className="primary"
                          onClick={onDownloadDictationModel}
                          disabled={!onDownloadDictationModel}
                        >
                          下载模型
                        </button>
                      )}
                      {dictationModelStatus.state === "downloading" && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onCancelDictationDownload}
                          disabled={!onCancelDictationDownload}
                        >
                          取消下载
                        </button>
                      )}
                      {dictationReady && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onRemoveDictationModel}
                          disabled={!onRemoveDictationModel}
                        >
                          移除模型
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
            {activeSection === "shortcuts" && (
              <section className="settings-section">
                <div className="settings-section-title">快捷键</div>
                <div className="settings-section-subtitle">
                  自定义文件操作、编写器、面板与导航的快捷键。
                </div>
                <div className="settings-subsection-title">文件</div>
                <div className="settings-subsection-subtitle">
                  通过键盘创建智能体和工作树。
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">新建智能体</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newAgentShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newAgentShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">新建工作树智能体</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newWorktreeAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newWorktreeAgentShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newWorktreeAgentShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">新建克隆智能体</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newCloneAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newCloneAgentShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newCloneAgentShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+alt+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">归档当前对话</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.archiveThread)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "archiveThreadShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("archiveThreadShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{" "}
                    {formatShortcut(isMacPlatform() ? "cmd+ctrl+a" : "ctrl+alt+a")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">编写器</div>
                <div className="settings-subsection-subtitle">
                  在模型、访问、推理和协作模式之间切换。
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换模型</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.model)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerModelShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerModelShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    聚焦后按新快捷键。默认：{formatShortcut("cmd+shift+m")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换访问模式</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.access)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerAccessShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerAccessShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+a")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换推理模式</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.reasoning)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerReasoningShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerReasoningShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+r")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换协作模式</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.collaboration)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerCollaborationShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerCollaborationShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("shift+tab")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">停止当前运行</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.interrupt)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "interruptShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("interruptShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut(getDefaultInterruptShortcut())}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">面板</div>
                <div className="settings-subsection-subtitle">
                  切换侧边栏和面板。
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换工作区侧边栏</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.projectsSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleProjectsSidebarShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleProjectsSidebarShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+p")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换 Git 侧边栏</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.gitSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleGitSidebarShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleGitSidebarShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+g")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">分支切换器</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.branchSwitcher)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "branchSwitcherShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("branchSwitcherShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+b")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换调试面板</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.debugPanel)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleDebugPanelShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleDebugPanelShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+d")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换终端面板</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.terminal)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleTerminalShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleTerminalShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{formatShortcut("cmd+shift+t")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">导航</div>
                <div className="settings-subsection-subtitle">
                  在智能体与工作区之间切换。
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">下一个智能体</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentNextShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentNextShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+ctrl+down" : "ctrl+alt+down",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">上一个智能体</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentPrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentPrevShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentPrevShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+ctrl+up" : "ctrl+alt+up",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">下一个工作区</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspaceNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspaceNextShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspaceNextShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{" "}
                    {formatShortcut(
                      isMacPlatform()
                        ? "cmd+shift+down"
                        : "ctrl+alt+shift+down",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">上一个工作区</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspacePrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspacePrevShortcut")
                      }
                      placeholder="输入快捷键"
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspacePrevShortcut", null)}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    默认：{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+shift+up" : "ctrl+alt+shift+up",
                    )}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "open-apps" && (
              <section className="settings-section">
                <div className="settings-section-title">打开方式</div>
                <div className="settings-section-subtitle">
                  自定义标题栏和文件预览中的“打开方式”菜单。
                </div>
                <div className="settings-open-apps">
                  {openAppDrafts.map((target, index) => {
                    const iconSrc =
                      getKnownOpenAppIcon(target.id) ??
                      openAppIconById[target.id] ??
                      GENERIC_APP_ICON;
                    const labelValid = isOpenAppLabelValid(target.label);
                    const appNameValid =
                      target.kind !== "app" || Boolean(target.appName?.trim());
                    const commandValid =
                      target.kind !== "command" || Boolean(target.command?.trim());
                    const isComplete = labelValid && appNameValid && commandValid;
                    const incompleteHint = !labelValid
                      ? "需要标签"
                      : target.kind === "app"
                        ? "需要应用名称"
                        : target.kind === "command"
                          ? "需要命令"
                          : "请填写必填项";
                    return (
                      <div
                        key={target.id}
                        className={`settings-open-app-row${
                          isComplete ? "" : " is-incomplete"
                        }`}
                      >
                        <div className="settings-open-app-icon-wrap" aria-hidden>
                          <img
                            className="settings-open-app-icon"
                            src={iconSrc}
                            alt=""
                            width={18}
                            height={18}
                          />
                        </div>
                        <div className="settings-open-app-fields">
                          <label className="settings-open-app-field settings-open-app-field--label">
                            <span className="settings-visually-hidden">标签</span>
                            <input
                              className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--label"
                              value={target.label}
                              placeholder="标签"
                              onChange={(event) =>
                                handleOpenAppDraftChange(index, {
                                  label: event.target.value,
                                })
                              }
                              onBlur={() => {
                                void handleCommitOpenApps(openAppDrafts);
                              }}
                              aria-label={`打开方式标签 ${index + 1}`}
                              data-invalid={!labelValid || undefined}
                            />
                          </label>
                          <label className="settings-open-app-field settings-open-app-field--type">
                            <span className="settings-visually-hidden">类型</span>
                            <select
                              className="settings-select settings-select--compact settings-open-app-kind"
                              value={target.kind}
                              onChange={(event) =>
                                handleOpenAppKindChange(
                                  index,
                                  event.target.value as OpenAppTarget["kind"],
                                )
                              }
                              aria-label={`打开方式类型 ${index + 1}`}
                            >
                              <option value="app">应用</option>
                              <option value="command">命令</option>
                              <option value="finder">{fileManagerName()}</option>
                            </select>
                          </label>
                          {target.kind === "app" && (
                            <label className="settings-open-app-field settings-open-app-field--appname">
                              <span className="settings-visually-hidden">应用名称</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--appname"
                                value={target.appName ?? ""}
                                placeholder="应用名称"
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    appName: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`打开方式应用名称 ${index + 1}`}
                                data-invalid={!appNameValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind === "command" && (
                            <label className="settings-open-app-field settings-open-app-field--command">
                              <span className="settings-visually-hidden">命令</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--command"
                                value={target.command ?? ""}
                                placeholder="命令"
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    command: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`打开方式命令 ${index + 1}`}
                                data-invalid={!commandValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind !== "finder" && (
                            <label className="settings-open-app-field settings-open-app-field--args">
                              <span className="settings-visually-hidden">参数</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--args"
                                value={target.argsText}
                                placeholder="参数"
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    argsText: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`打开方式参数 ${index + 1}`}
                              />
                            </label>
                          )}
                        </div>
                        <div className="settings-open-app-actions">
                          {!isComplete && (
                            <span
                              className="settings-open-app-status"
                              title={incompleteHint}
                              aria-label={incompleteHint}
                            >
                              未完成
                            </span>
                          )}
                          <label className="settings-open-app-default">
                            <input
                              type="radio"
                              name="open-app-default"
                              checked={target.id === openAppSelectedId}
                              onChange={() => handleSelectOpenAppDefault(target.id)}
                              disabled={!isComplete}
                            />
                            默认
                          </label>
                          <div className="settings-open-app-order">
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "up")}
                              disabled={index === 0}
                              aria-label="上移"
                            >
                              <ChevronUp aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "down")}
                              disabled={index === openAppDrafts.length - 1}
                              aria-label="下移"
                            >
                              <ChevronDown aria-hidden />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ghost icon-button"
                            onClick={() => handleDeleteOpenApp(index)}
                            disabled={openAppDrafts.length <= 1}
                            aria-label="移除应用"
                            title="移除应用"
                          >
                            <Trash2 aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="settings-open-app-footer">
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleAddOpenApp}
                  >
                    添加应用
                  </button>
                  <div className="settings-help">
                    命令会把所选路径作为最后一个参数。{" "}
                    {isMacPlatform()
                      ? "应用通过 `open -a` 打开，可附加参数。"
                      : "应用以可执行程序方式启动，可附加参数。"}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "git" && (
              <section className="settings-section">
                <div className="settings-section-title">Git</div>
                <div className="settings-section-subtitle">
                  管理 Git 侧边栏中差异的加载方式。
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">预加载 Git 差异</div>
                    <div className="settings-toggle-subtitle">
                      让查看差异更快。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.preloadGitDiffs ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        preloadGitDiffs: !appSettings.preloadGitDiffs,
                      })
                    }
                    aria-pressed={appSettings.preloadGitDiffs}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">忽略空白变更</div>
                    <div className="settings-toggle-subtitle">
                      在本地和提交差异中隐藏仅空白的变更。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.gitDiffIgnoreWhitespaceChanges ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
                      })
                    }
                    aria-pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
            {activeSection === "codex" && (
              <section className="settings-section">
                <div className="settings-section-title">Codex</div>
                <div className="settings-section-subtitle">
                  配置 CodexMonitor 使用的 Codex CLI 并校验安装。
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="codex-path">
                    默认 Codex 路径
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="codex-path"
                      className="settings-input"
                      value={codexPathDraft}
                      placeholder="codex"
                      onChange={(event) => setCodexPathDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={handleBrowseCodex}>
                      浏览
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCodexPathDraft("")}
                    >
                      使用 PATH
                    </button>
                  </div>
                  <div className="settings-help">
                    留空则使用系统 PATH。
                  </div>
                  <label className="settings-field-label" htmlFor="codex-args">
                    默认 Codex 参数
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="codex-args"
                      className="settings-input"
                      value={codexArgsDraft}
                      placeholder="--profile personal"
                      onChange={(event) => setCodexArgsDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCodexArgsDraft("")}
                    >
                      清除
                    </button>
                  </div>
                  <div className="settings-help">
                    会在 <code>app-server</code> 前附加额外参数。包含空格的值请使用引号。
                  </div>
                <div className="settings-field-actions">
                  {codexDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveCodexSettings}
                      disabled={isSavingSettings}
                    >
                      {isSavingSettings ? "保存中..." : "保存"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={handleRunDoctor}
                    disabled={doctorState.status === "running"}
                  >
                    <Stethoscope aria-hidden />
                    {doctorState.status === "running" ? "运行中..." : "运行诊断"}
                  </button>
                </div>

                {doctorState.result && (
                  <div
                    className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {doctorState.result.ok ? "Codex 状态正常" : "检测到 Codex 问题"}
                    </div>
                    <div className="settings-doctor-body">
                      <div>
                        版本：{doctorState.result.version ?? "未知"}
                      </div>
                      <div>
                        App-server：{doctorState.result.appServerOk ? "正常" : "失败"}
                      </div>
                      <div>
                        Node：{" "}
                        {doctorState.result.nodeOk
                          ? `正常 (${doctorState.result.nodeVersion ?? "未知"})`
                          : "缺失"}
                      </div>
                      {doctorState.result.details && (
                        <div>{doctorState.result.details}</div>
                      )}
                      {doctorState.result.nodeDetails && (
                        <div>{doctorState.result.nodeDetails}</div>
                      )}
                      {doctorState.result.path && (
                        <div className="settings-doctor-path">
                          PATH：{doctorState.result.path}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="default-access">
                    默认访问模式
                  </label>
                  <select
                    id="default-access"
                    className="settings-select"
                    value={appSettings.defaultAccessMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        defaultAccessMode: event.target.value as AppSettings["defaultAccessMode"],
                      })
                    }
                  >
                    <option value="read-only">只读</option>
                    <option value="current">按需</option>
                    <option value="full-access">完全访问</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="review-delivery">
                    审阅模式
                  </label>
                  <select
                    id="review-delivery"
                    className="settings-select"
                    value={appSettings.reviewDeliveryMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        reviewDeliveryMode:
                          event.target.value as AppSettings["reviewDeliveryMode"],
                      })
                    }
                  >
                    <option value="inline">内联（同一对话）</option>
                    <option value="detached">分离（新审阅对话）</option>
                  </select>
                  <div className="settings-help">
                    选择 <code>/review</code> 在当前对话或独立审阅对话中运行。
                  </div>
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="backend-mode">
                    后端模式
                  </label>
                  <select
                    id="backend-mode"
                    className="settings-select"
                    value={appSettings.backendMode}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        backendMode: event.target.value as AppSettings["backendMode"],
                      })
                    }
                  >
                    <option value="local">本地（默认）</option>
                    <option value="remote">远程（守护进程）</option>
                  </select>
                  <div className="settings-help">
                    远程模式会连接到另一台机器上的守护进程（例如 WSL2/Linux）运行后端。
                  </div>
                </div>

                {appSettings.backendMode === "remote" && (
                  <div className="settings-field">
                    <div className="settings-field-label">远程后端</div>
                    <div className="settings-field-row">
                      <input
                        className="settings-input settings-input--compact"
                        value={remoteHostDraft}
                        placeholder="127.0.0.1:4732"
                        onChange={(event) => setRemoteHostDraft(event.target.value)}
                        onBlur={() => {
                          void handleCommitRemoteHost();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCommitRemoteHost();
                          }
                        }}
                        aria-label="远程后端主机"
                      />
                      <input
                        type="password"
                        className="settings-input settings-input--compact"
                        value={remoteTokenDraft}
                        placeholder="令牌（可选）"
                        onChange={(event) => setRemoteTokenDraft(event.target.value)}
                        onBlur={() => {
                          void handleCommitRemoteToken();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCommitRemoteToken();
                          }
                        }}
                        aria-label="远程后端令牌"
                      />
                    </div>
                    <div className="settings-help">
                      请单独启动守护进程，并在此指定 host:port 与令牌。
                    </div>
                  </div>
                )}

                <FileEditorCard
                  title="全局 AGENTS.md"
                  meta={globalAgentsMeta}
                  error={globalAgentsError}
                  value={globalAgentsContent}
                  placeholder="为 Codex 智能体添加全局指令…"
                  disabled={globalAgentsLoading}
                  refreshDisabled={globalAgentsRefreshDisabled}
                  saveDisabled={globalAgentsSaveDisabled}
                  saveLabel={globalAgentsSaveLabel}
                  onChange={setGlobalAgentsContent}
                  onRefresh={() => {
                    void refreshGlobalAgents();
                  }}
                  onSave={() => {
                    void saveGlobalAgents();
                  }}
                  helpText={
                    <>
                      存储于 <code>~/.codex/AGENTS.md</code>。
                    </>
                  }
                  classNames={{
                    container: "settings-field settings-agents",
                    header: "settings-agents-header",
                    title: "settings-field-label",
                    actions: "settings-agents-actions",
                    meta: "settings-help settings-help-inline",
                    iconButton: "ghost settings-icon-button",
                    error: "settings-agents-error",
                    textarea: "settings-agents-textarea",
                    help: "settings-help",
                  }}
                />

                <FileEditorCard
                  title="全局 config.toml"
                  meta={globalConfigMeta}
                  error={globalConfigError}
                  value={globalConfigContent}
                  placeholder="编辑全局 Codex config.toml…"
                  disabled={globalConfigLoading}
                  refreshDisabled={globalConfigRefreshDisabled}
                  saveDisabled={globalConfigSaveDisabled}
                  saveLabel={globalConfigSaveLabel}
                  onChange={setGlobalConfigContent}
                  onRefresh={() => {
                    void refreshGlobalConfig();
                  }}
                  onSave={() => {
                    void saveGlobalConfig();
                  }}
                  helpText={
                    <>
                      存储于 <code>~/.codex/config.toml</code>。
                    </>
                  }
                  classNames={{
                    container: "settings-field settings-agents",
                    header: "settings-agents-header",
                    title: "settings-field-label",
                    actions: "settings-agents-actions",
                    meta: "settings-help settings-help-inline",
                    iconButton: "ghost settings-icon-button",
                    error: "settings-agents-error",
                    textarea: "settings-agents-textarea",
                    help: "settings-help",
                  }}
                />

                <div className="settings-field">
                  <div className="settings-field-label">工作区覆盖项</div>
                  <div className="settings-overrides">
                    {projects.map((workspace) => (
                      <div key={workspace.id} className="settings-override-row">
                        <div className="settings-override-info">
                          <div className="settings-project-name">{workspace.name}</div>
                          <div className="settings-project-path">{workspace.path}</div>
                        </div>
                        <div className="settings-override-actions">
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={codexBinOverrideDrafts[workspace.id] ?? ""}
                              placeholder="Codex 可执行文件覆盖"
                              onChange={(event) =>
                                setCodexBinOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = codexBinOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (nextValue === (workspace.codex_bin ?? null)) {
                                  return;
                                }
                                await onUpdateWorkspaceCodexBin(workspace.id, nextValue);
                              }}
                              aria-label={`为 ${workspace.name} 设置 Codex 可执行文件覆盖`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setCodexBinOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceCodexBin(workspace.id, null);
                              }}
                            >
                              清除
                            </button>
                          </div>
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={codexHomeOverrideDrafts[workspace.id] ?? ""}
                              placeholder="CODEX_HOME 覆盖"
                              onChange={(event) =>
                                setCodexHomeOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = codexHomeOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (nextValue === (workspace.settings.codexHome ?? null)) {
                                  return;
                                }
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  codexHome: nextValue,
                                });
                              }}
                              aria-label={`为 ${workspace.name} 设置 CODEX_HOME 覆盖`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setCodexHomeOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  codexHome: null,
                                });
                              }}
                            >
                              清除
                            </button>
                          </div>
                          <div className="settings-override-field">
                            <input
                              className="settings-input settings-input--compact"
                              value={codexArgsOverrideDrafts[workspace.id] ?? ""}
                              placeholder="Codex 参数覆盖"
                              onChange={(event) =>
                                setCodexArgsOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: event.target.value,
                                }))
                              }
                              onBlur={async () => {
                                const draft = codexArgsOverrideDrafts[workspace.id] ?? "";
                                const nextValue = normalizeOverrideValue(draft);
                                if (nextValue === (workspace.settings.codexArgs ?? null)) {
                                  return;
                                }
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  codexArgs: nextValue,
                                });
                              }}
                              aria-label={`为 ${workspace.name} 设置 Codex 参数覆盖`}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={async () => {
                                setCodexArgsOverrideDrafts((prev) => ({
                                  ...prev,
                                  [workspace.id]: "",
                                }));
                                await onUpdateWorkspaceSettings(workspace.id, {
                                  codexArgs: null,
                                });
                              }}
                            >
                              清除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="settings-empty">暂无工作区。</div>
                    )}
                  </div>
                </div>

              </section>
            )}
            {activeSection === "features" && (
              <section className="settings-section">
                <div className="settings-section-title">功能</div>
                <div className="settings-section-subtitle">
                  管理稳定与实验性 Codex 功能。
                </div>
                {hasCodexHomeOverrides && (
                  <div className="settings-help">
                    功能设置存储在默认 CODEX_HOME 的 config.toml 中。
                    <br />
                    工作区覆盖项不会同步更新。
                  </div>
                )}
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">配置文件</div>
                    <div className="settings-toggle-subtitle">
                      在 {fileManagerName()} 中打开 Codex 配置。
                    </div>
                  </div>
                  <button type="button" className="ghost" onClick={handleOpenConfig}>
                    {openInFileManagerLabel()}
                  </button>
                </div>
                {openConfigError && (
                  <div className="settings-help">{openConfigError}</div>
                )}
                <div className="settings-subsection-title">稳定功能</div>
                <div className="settings-subsection-subtitle">
                  默认启用的生产级功能。
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">协作模式</div>
                    <div className="settings-toggle-subtitle">
                      启用协作模式预设（代码、计划）。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${
                      appSettings.collaborationModesEnabled ? "on" : ""
                    }`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        collaborationModesEnabled:
                          !appSettings.collaborationModesEnabled,
                      })
                    }
                    aria-pressed={appSettings.collaborationModesEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">沟通风格</div>
                    <div className="settings-toggle-subtitle">
                      选择 Codex 的沟通风格（会写入 config.toml 的顶层{" "}
                      <code>personality</code>）。
                    </div>
                  </div>
                  <select
                    id="features-personality-select"
                    className="settings-select"
                    value={appSettings.personality}
                    onChange={(event) =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        personality: event.target.value as AppSettings["personality"],
                      })
                    }
                    aria-label="沟通风格"
                  >
                    <option value="friendly">友好</option>
                    <option value="pragmatic">务实</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">引导模式</div>
                    <div className="settings-toggle-subtitle">
                      消息立即发送。运行中可用 Tab 排队。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.steerEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        steerEnabled: !appSettings.steerEnabled,
                      })
                    }
                    aria-pressed={appSettings.steerEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">后台终端</div>
                    <div className="settings-toggle-subtitle">
                      在后台运行耗时的终端命令。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.unifiedExecEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        unifiedExecEnabled: !appSettings.unifiedExecEnabled,
                      })
                    }
                    aria-pressed={appSettings.unifiedExecEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-subsection-title">实验性功能</div>
                <div className="settings-subsection-subtitle">
                  预览可能变更或移除的功能。
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">多智能体</div>
                    <div className="settings-toggle-subtitle">
                      启用 Codex 的多智能体协作工具。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.experimentalCollabEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        experimentalCollabEnabled: !appSettings.experimentalCollabEnabled,
                      })
                    }
                    aria-pressed={appSettings.experimentalCollabEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">应用</div>
                    <div className="settings-toggle-subtitle">
                      启用 ChatGPT 应用/连接器及 <code>/apps</code> 命令。
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.experimentalAppsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        experimentalAppsEnabled: !appSettings.experimentalAppsEnabled,
                      })
                    }
                    aria-pressed={appSettings.experimentalAppsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </section>
            )}
          </div>
      </div>
    </ModalShell>
  );
}
