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
import { useTranslation } from "../../../i18n/hooks/useTranslation";

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
  const { t } = useTranslation();

  const DICTATION_MODELS = [
    { id: "tiny", label: t("settings.dictation.models.tiny.label"), size: "75 MB", note: t("settings.dictation.models.tiny.note") },
    { id: "base", label: t("settings.dictation.models.base.label"), size: "142 MB", note: t("settings.dictation.models.base.note") },
    { id: "small", label: t("settings.dictation.models.small.label"), size: "466 MB", note: t("settings.dictation.models.small.note") },
    { id: "medium", label: t("settings.dictation.models.medium.label"), size: "1.5 GB", note: t("settings.dictation.models.medium.note") },
    { id: "large-v3", label: t("settings.dictation.models.large-v3.label"), size: "3.0 GB", note: t("settings.dictation.models.large-v3.note") },
  ];

  const COMPOSER_PRESET_LABELS: Record<ComposerPreset, string> = {
    default: t("settings.writer.presets.default"),
    helpful: t("settings.writer.presets.helpful"),
    smart: t("settings.writer.presets.smart"),
  };
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
    ? t("common.loading")
    : globalAgentsSaving
      ? t("common.saving")
      : globalAgentsExists
        ? ""
        : t("errors.not_found");
  const globalAgentsMetaParts: string[] = [];
  if (globalAgentsStatus) {
    globalAgentsMetaParts.push(globalAgentsStatus);
  }
  if (globalAgentsTruncated) {
    globalAgentsMetaParts.push(t("settings.truncated"));
  }
  const globalAgentsMeta = globalAgentsMetaParts.join(" · ");
  const globalAgentsSaveLabel = globalAgentsExists ? t("common.save") : t("settings.create");
  const globalAgentsSaveDisabled = globalAgentsLoading || globalAgentsSaving || !globalAgentsDirty;
  const globalAgentsRefreshDisabled = globalAgentsLoading || globalAgentsSaving;
  const globalConfigStatus = globalConfigLoading
    ? t("common.loading")
    : globalConfigSaving
      ? t("common.saving")
      : globalConfigExists
        ? ""
        : t("errors.not_found");
  const globalConfigMetaParts: string[] = [];
  if (globalConfigStatus) {
    globalConfigMetaParts.push(globalConfigStatus);
  }
  if (globalConfigTruncated) {
    globalConfigMetaParts.push(t("settings.truncated"));
  }
  const globalConfigMeta = globalConfigMetaParts.join(" · ");
  const globalConfigSaveLabel = globalConfigExists ? t("common.save") : t("settings.create");
  const globalConfigSaveDisabled = globalConfigLoading || globalConfigSaving || !globalConfigDirty;
  const globalConfigRefreshDisabled = globalConfigLoading || globalConfigSaving;
  const optionKeyLabel = isMacPlatform() ? t("settings.key_option") : t("settings.key_alt");
  const metaKeyLabel = isMacPlatform()
    ? t("settings.key_command")
    : isWindowsPlatform()
      ? t("settings.key_windows")
      : t("settings.key_meta");
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
        error instanceof Error ? error.message : t("errors.cannot_open_config_file"),
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
      label: t("settings.new_app"),
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
        ? `\n\n${t("settings.delete_group_detail", { ungrouped: ungroupedLabel })}`
        : "";
    const confirmed = await ask(
      t("settings.delete_group_confirm", { name: group.name, detail }),
      {
        title: t("settings.delete_group"),
        kind: "warning",
        okLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
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
          {t("settings.title")}
        </div>
        <button
          type="button"
          className="ghost icon-button settings-close"
          onClick={onClose}
          aria-label={t("settings.close")}
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
              {t("settings.workspaces")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "environments" ? "active" : ""}`}
              onClick={() => setActiveSection("environments")}
            >
              <Layers aria-hidden />
              {t("settings.environments")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "display" ? "active" : ""}`}
              onClick={() => setActiveSection("display")}
            >
              <SlidersHorizontal aria-hidden />
              {t("settings.display_and_sound")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "composer" ? "active" : ""}`}
              onClick={() => setActiveSection("composer")}
            >
              <FileText aria-hidden />
              {t("settings.writer")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "dictation" ? "active" : ""}`}
              onClick={() => setActiveSection("dictation")}
            >
              <Mic aria-hidden />
              {t("settings.dictation")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "shortcuts" ? "active" : ""}`}
              onClick={() => setActiveSection("shortcuts")}
            >
              <Keyboard aria-hidden />
              {t("settings.shortcuts")}
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "open-apps" ? "active" : ""}`}
              onClick={() => setActiveSection("open-apps")}
            >
              <ExternalLink aria-hidden />
              {t("settings.open_with")}
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
              {t("settings.features")}
            </button>
          </aside>
          <div className="settings-content">
            {activeSection === "projects" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.workspaces")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.group_management")}
                </div>
                <div className="settings-subsection-title">{t("settings.group_management")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.create_group_label")}
                </div>
                <div className="settings-groups">
                  <div className="settings-group-create">
                    <input
                      className="settings-input settings-input--compact"
                      value={newGroupName}
                      placeholder={t("settings.new_group_name")}
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
                      {t("settings.add_group")}
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
                                {t("settings.duplicate_folder")}
                              </div>
                              <div className="settings-group-copies-row">
                                <div
                                  className={`settings-group-copies-path${
                                    group.copiesFolder ? "" : " empty"
                                  }`}
                                  title={group.copiesFolder ?? ""}
                                >
                                  {group.copiesFolder ?? t("settings.not_set")}
                                </div>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleChooseGroupCopiesFolder(group);
                                  }}
                                >
                                  {t("settings.select")}
                                </button>
                                <button
                                  type="button"
                                  className="ghost settings-button-compact"
                                  onClick={() => {
                                    void handleClearGroupCopiesFolder(group);
                                  }}
                                  disabled={!group.copiesFolder}
                                >
                                  {t("settings.clear")}
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
                              aria-label={t("settings.move_group_up")}
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
                              aria-label={t("settings.move_group_down")}
                            >
                              <ChevronDown aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => {
                                void handleDeleteGroup(group);
                              }}
                              aria-label={t("settings.delete_group_aria")}
                            >
                              <Trash2 aria-hidden />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="settings-empty">{t("settings.no_groups")}</div>
                  )}
                </div>
                <div className="settings-subsection-title">{t("settings.workspaces")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.workspace_management")}
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
                              aria-label={t("settings.move_workspace_up")}
                            >
                                <ChevronUp aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="ghost icon-button"
                              onClick={() => onMoveWorkspace(workspace.id, "down")}
                              disabled={index === group.workspaces.length - 1}
                              aria-label={t("settings.move_workspace_down")}
                            >
                                <ChevronDown aria-hidden />
                              </button>
                              <button
                                type="button"
                              className="ghost icon-button"
                              onClick={() => onDeleteWorkspace(workspace.id)}
                              aria-label={t("settings.delete_workspace")}
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
                    <div className="settings-empty">{t("settings.no_workspaces")}</div>
                  )}
                </div>
              </section>
            )}
            {activeSection === "environments" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.environments")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.environment_settings")}
                </div>
                {mainWorkspaces.length === 0 ? (
                  <div className="settings-empty">{t("settings.workspaces.no_workspaces")}</div>
                ) : (
                  <>
                    <div className="settings-field">
                      <label
                        className="settings-field-label"
                        htmlFor="settings-environment-project"
                      >
                        {t("settings.workspaces")}
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
                      <div className="settings-field-label">{t("settings.environment_script")}</div>
                      <div className="settings-help">
                        {t("settings.environment_script_subtitle")}
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
                                title: t("settings.copy_failed"),
                                message:
                                  t("settings.clipboard_unavailable"),
                              });
                              return;
                            }

                            void clipboard.writeText(environmentDraftScript).catch(() => {
                              pushErrorToast({
                                title: t("settings.copy_failed"),
                                message:
                                  t("settings.cannot_write_clipboard"),
                              });
                            });
                          }}
                          disabled={environmentSaving || environmentDraftScript.length === 0}
                        >
                          {t("settings.copy")}
                        </button>
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={() => setEnvironmentDraftScript(environmentSavedScript ?? "")}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          {t("settings.reset")}
                        </button>
                        <button
                          type="button"
                          className="primary settings-button-compact"
                          onClick={() => {
                            void handleSaveEnvironmentSetup();
                          }}
                          disabled={environmentSaving || !environmentDirty}
                        >
                          {environmentSaving ? t("common.saving") : t("common.save")}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
            {activeSection === "display" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.display_and_sound")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.adjust_rendering")}
                </div>
                <div className="settings-subsection-title">{t("settings.display")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.adjust_rendering")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="theme-select">
                    {t("settings.theme")}
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
                    <option value="system">{t("settings.follow_system")}</option>
                    <option value="light">{t("settings.light")}</option>
                    <option value="dark">{t("settings.dark")}</option>
                    <option value="dim">{t("settings.dim")}</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">
                      {t("settings.show_remaining_limits")}
                    </div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.show_remaining_subtitle")}
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
                    <div className="settings-toggle-title">{t("settings.reduce_transparency")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.reduce_transparency_subtitle")}
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
                    <div className="settings-toggle-title">{t("settings.interface_scaling")}</div>
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
                      aria-label={t("settings.interface_scaling")}
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
                      {t("settings.reset")}
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="ui-font-family">
                    {t("settings.ui_font_family")}
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
                      {t("settings.reset")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.font_configuration")}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-family">
                    {t("settings.code_font_family")}
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
                      {t("settings.reset")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.code_font_help")}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="code-font-size">
                    {t("settings.code_font_size")}
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
                      {t("settings.reset")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.code_font_configuration")}
                  </div>
                </div>
                <div className="settings-subsection-title">{t("settings.sound")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.control_notification_sounds")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.notification_sounds")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.background_agent_notification")}
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
                    <div className="settings-toggle-title">{t("settings.system_notifications")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.system_notifications_subtitle")}
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
                    {t("settings.test_notification_sound")}
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestSystemNotification}
                  >
                    {t("settings.test_system_notification")}
                  </button>
                </div>
              </section>
            )}
            {activeSection === "composer" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.writer")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.writer_settings")}
                </div>
                <div className="settings-subsection-title">{t("settings.presets")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.preset_description")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="composer-preset">
                    {t("settings.presets")}
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
                    {t("settings.preset_sync_description")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("settings.code_fences")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.expand_with_space")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.expand_with_space_description")}
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
                    <div className="settings-toggle-title">{t("settings.expand_with_enter")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.expand_with_enter_description")}
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
                    <div className="settings-toggle-title">{t("settings.support_language_labels")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.support_language_labels_description")}
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
                    <div className="settings-toggle-title">{t("settings.wrap_selected_with_fence")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.wrap_selected_with_fence_description")}
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
                    <div className="settings-toggle-title">{t("settings.copy_without_fence")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.copy_without_fence_description")}
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
                <div className="settings-subsection-title">{t("settings.paste")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.auto_wrap_multiline")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.auto_wrap_multiline_description")}
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
                    <div className="settings-toggle-title">{t("settings.auto_wrap_code_lines")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.auto_wrap_code_lines_description")}
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
                <div className="settings-subsection-title">{t("settings.lists")}</div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.continue_list_with_shift_enter")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.continue_list_with_shift_enter_description")}
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
                <div className="settings-section-title">{t("settings.dictation")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.dictation_settings")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.enable_dictation")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.first_use")}
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
                    {t("settings.dictation_model")}
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
                    {selectedDictationModel.note} Download size: {selectedDictationModel.size}.
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-language">
                    {t("settings.dictation_language_preference")}
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
                    <option value="">{t("settings.auto_detect_only")}</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                    <option value="pt">Português</option>
                    <option value="nl">Nederlands</option>
                    <option value="sv">Svenska</option>
                    <option value="no">Norsk</option>
                    <option value="da">Dansk</option>
                    <option value="fi">Suomi</option>
                    <option value="pl">Polski</option>
                    <option value="tr">Türkçe</option>
                    <option value="ru">Русский</option>
                    <option value="uk">Українська</option>
                    <option value="ja">日本語</option>
                    <option value="ko">한국어</option>
                    <option value="zh">中文</option>
                  </select>
                  <div className="settings-help">
                    {t("settings.auto_detect_description")}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="dictation-hold-key">
                    {t("settings.hold_to_dictate")}
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
                    {t("settings.dictation.hold_to_dictate_description")}
                  </div>
                </div>
                {dictationModelStatus && (
                  <div className="settings-field">
                    <div className="settings-field-label">
                      {t("settings.dictation.model_status", { modelLabel: selectedDictationModel.label })}
                    </div>
                    <div className="settings-help">
                      {dictationModelStatus.state === "ready" && t("settings.ready_to_dictate")}
                      {dictationModelStatus.state === "missing" && t("settings.dictation.not_downloaded")}
                      {dictationModelStatus.state === "downloading" &&
                        t("settings.dictation.downloading")}
                      {dictationModelStatus.state === "error" &&
                        (dictationModelStatus.error ?? t("settings.dictation.download_error"))}
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
                          {t("settings.dictation.download_model")}
                        </button>
                      )}
                      {dictationModelStatus.state === "downloading" && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onCancelDictationDownload}
                          disabled={!onCancelDictationDownload}
                        >
                          {t("settings.dictation.cancel_download")}
                        </button>
                      )}
                      {dictationReady && (
                        <button
                          type="button"
                          className="ghost settings-button-compact"
                          onClick={onRemoveDictationModel}
                          disabled={!onRemoveDictationModel}
                        >
                          {t("settings.dictation.remove_model")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
            {activeSection === "shortcuts" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.shortcuts")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.shortcuts.customize")}
                </div>
                <div className="settings-subsection-title">{t("settings.shortcuts.files")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.shortcuts.files_description")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.shortcuts.new_agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newAgentShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newAgentShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}: {formatShortcut("cmd+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.shortcuts.new_worktree_agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newWorktreeAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newWorktreeAgentShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newWorktreeAgentShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}: {formatShortcut("cmd+shift+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.shortcuts.new_clone_agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.newCloneAgent)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "newCloneAgentShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("newCloneAgentShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}: {formatShortcut("cmd+alt+n")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.shortcuts.archive_thread")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.archiveThread)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "archiveThreadShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("archiveThreadShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{" "}
                    {formatShortcut(isMacPlatform() ? "cmd+ctrl+a" : "ctrl+alt+a")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("settings.writer")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.switch_mode")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.switch_model")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.model)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerModelShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerModelShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    聚焦后按新{t("settings.shortcuts")}。默认：{formatShortcut("cmd+shift+m")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.switch_access_mode")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.access)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerAccessShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerAccessShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+a")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.switch_reasoning_mode")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.reasoning)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerReasoningShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerReasoningShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+r")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.switch_collaboration_mode")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.collaboration)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "composerCollaborationShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("composerCollaborationShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("shift+tab")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.stop_current_run")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.interrupt)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "interruptShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("interruptShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut(getDefaultInterruptShortcut())}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("settings.panels")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.toggle_sidebar_and_panels")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">切换{t("settings.workspaces")}侧边栏</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.projectsSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleProjectsSidebarShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleProjectsSidebarShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+p")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.toggle_git_sidebar")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.gitSidebar)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleGitSidebarShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleGitSidebarShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+g")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.branch_switcher")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.branchSwitcher)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "branchSwitcherShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("branchSwitcherShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+b")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.toggle_debug_panel")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.debugPanel)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleDebugPanelShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleDebugPanelShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+d")}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.toggle_terminal_panel")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.terminal)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "toggleTerminalShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("toggleTerminalShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{formatShortcut("cmd+shift+t")}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-subsection-title">{t("settings.navigation")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.switch_between_agents_and_workspaces")}
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.next_agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentNextShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentNextShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+ctrl+down" : "ctrl+alt+down",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">{t("settings.previous_agent")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleAgentPrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleAgentPrevShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleAgentPrevShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+ctrl+up" : "ctrl+alt+up",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">下一个{t("settings.workspaces")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspaceNext)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspaceNextShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspaceNextShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{" "}
                    {formatShortcut(
                      isMacPlatform()
                        ? "cmd+shift+down"
                        : "ctrl+alt+shift+down",
                    )}
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">上一个{t("settings.workspaces")}</div>
                  <div className="settings-field-row">
                    <input
                      className="settings-input settings-input--shortcut"
                      value={formatShortcut(shortcutDrafts.cycleWorkspacePrev)}
                      onKeyDown={(event) =>
                        handleShortcutKeyDown(event, "cycleWorkspacePrevShortcut")
                      }
                      placeholder={`${t("settings.shortcuts.placeholder")}`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void updateShortcut("cycleWorkspacePrevShortcut", null)}
                    >
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default")}:{" "}
                    {formatShortcut(
                      isMacPlatform() ? "cmd+shift+up" : "ctrl+alt+shift+up",
                    )}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "open-apps" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.open_with")}</div>
                <div className="settings-section-subtitle">
                  {t("settings.open_with_settings")}
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
                      ? t("settings.requires_label")
                      : target.kind === "app"
                        ? t("settings.requires_app_name")
                        : target.kind === "command"
                          ? t("settings.requires_command")
                          : t("settings.fill_required");
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
                            <span className="settings-visually-hidden">{t("settings.label")}</span>
                            <input
                              className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--label"
                              value={target.label}
                              placeholder={t("settings.label")}
                              onChange={(event) =>
                                handleOpenAppDraftChange(index, {
                                  label: event.target.value,
                                })
                              }
                              onBlur={() => {
                                void handleCommitOpenApps(openAppDrafts);
                              }}
                              aria-label={`${t("settings.open_with")} ${t("settings.label")} ${index + 1}`}
                              data-invalid={!labelValid || undefined}
                            />
                          </label>
                          <label className="settings-open-app-field settings-open-app-field--type">
                            <span className="settings-visually-hidden">{t("settings.type")}</span>
                            <select
                              className="settings-select settings-select--compact settings-open-app-kind"
                              value={target.kind}
                              onChange={(event) =>
                                handleOpenAppKindChange(
                                  index,
                                  event.target.value as OpenAppTarget["kind"],
                                )
                              }
                              aria-label={`${t("settings.open_with")} ${t("settings.type")} ${index + 1}`}
                            >
                              <option value="app">{t("settings.app")}</option>
                              <option value="command">{t("settings.command")}</option>
                              <option value="finder">{fileManagerName()}</option>
                            </select>
                          </label>
                          {target.kind === "app" && (
                            <label className="settings-open-app-field settings-open-app-field--appname">
                              <span className="settings-visually-hidden">{t("settings.app_name")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--appname"
                                value={target.appName ?? ""}
                                placeholder={t("settings.app_name")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    appName: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`${t("settings.open_with")} ${t("settings.app_name")} ${index + 1}`}
                                data-invalid={!appNameValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind === "command" && (
                            <label className="settings-open-app-field settings-open-app-field--command">
                              <span className="settings-visually-hidden">{t("settings.command")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--command"
                                value={target.command ?? ""}
                                placeholder={t("settings.command")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    command: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`${t("settings.open_with")} ${t("settings.command")} ${index + 1}`}
                                data-invalid={!commandValid || undefined}
                              />
                            </label>
                          )}
                          {target.kind !== "finder" && (
                            <label className="settings-open-app-field settings-open-app-field--args">
                              <span className="settings-visually-hidden">{t("settings.arguments")}</span>
                              <input
                                className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--args"
                                value={target.argsText}
                                placeholder={t("settings.arguments")}
                                onChange={(event) =>
                                  handleOpenAppDraftChange(index, {
                                    argsText: event.target.value,
                                  })
                                }
                                onBlur={() => {
                                  void handleCommitOpenApps(openAppDrafts);
                                }}
                                aria-label={`${t("settings.open_with")} ${t("settings.arguments")} ${index + 1}`}
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
                              {t("settings.incomplete")}
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
                            {t("settings.default")}
                          </label>
                          <div className="settings-open-app-order">
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "up")}
                              disabled={index === 0}
                              aria-label={t("settings.move_up")}
                            >
                              <ChevronUp aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="ghost icon-button"
                              onClick={() => handleMoveOpenApp(index, "down")}
                              disabled={index === openAppDrafts.length - 1}
                              aria-label={t("settings.move_down")}
                            >
                              <ChevronDown aria-hidden />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ghost icon-button"
                            onClick={() => handleDeleteOpenApp(index)}
                            disabled={openAppDrafts.length <= 1}
                            aria-label={t("settings.remove")}
                            title={t("settings.remove")}
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
                    {t("settings.add")}
                  </button>
                  <div className="settings-help">
                    {t("settings.command_description")}{" "}
                    {isMacPlatform()
                      ? t("settings.app_mode_description")
                      : t("settings.command_mode_description")}
                  </div>
                </div>
              </section>
            )}
            {activeSection === "git" && (
              <section className="settings-section">
                <div className="settings-section-title">Git</div>
                <div className="settings-section-subtitle">
                  {t("settings.git_diff")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.preload_git_diff")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.preload_git_diff_description")}
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
                    <div className="settings-toggle-title">{t("settings.ignore_whitespace")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.ignore_whitespace_description")}
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
                  {t("settings.codex_config")}
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="codex-path">
                    {t("settings.default_codex_path")}
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
                      {t("settings.browse")}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCodexPathDraft("")}
                    >
                      {t("settings.use_path")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default_codex_path_description")}
                  </div>
                  <label className="settings-field-label" htmlFor="codex-args">
                    {t("settings.default_codex_args")}
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
                      {t("settings.shortcuts.clear")}
                    </button>
                  </div>
                  <div className="settings-help">
                    {t("settings.default_codex_args_description")}
                  </div>
                <div className="settings-field-actions">
                  {codexDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveCodexSettings}
                      disabled={isSavingSettings}
                    >
                      {isSavingSettings ? t("common.saving") : t("common.save")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={handleRunDoctor}
                    disabled={doctorState.status === "running"}
                  >
                    <Stethoscope aria-hidden />
                    {doctorState.status === "running" ? t("common.loading") : t("settings.run_diagnosis")}
                  </button>
                </div>

                {doctorState.result && (
                  <div
                    className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {doctorState.result.ok ? t("settings.codex_ok") : t("settings.codex_issue")}
                    </div>
                    <div className="settings-doctor-body">
                      <div>
                        {t("settings.version")}{doctorState.result.version ?? t("settings.unknown")}
                      </div>
                      <div>
                        {t("settings.app_server")}{doctorState.result.appServerOk ? t("settings.ok") : t("settings.failed")}
                      </div>
                      <div>
                        {t("settings.node_js")}{" "}
                        {doctorState.result.nodeOk
                          ? `${t("settings.ok")} (${doctorState.result.nodeVersion ?? t("settings.unknown")})`
                          : t("settings.missing")}
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
                    {t("settings.default_access_mode")}
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
                    <option value="read-only">{t("settings.read_only")}</option>
                    <option value="current">{t("settings.on_demand")}</option>
                    <option value="full-access">{t("settings.full_access")}</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="review-delivery">
                    {t("settings.review_mode")}
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
                    <option value="inline">{t("settings.inline")}</option>
                    <option value="detached">{t("settings.detached")}</option>
                  </select>
                  <div className="settings-help">
                    {t("settings.review_mode_description")}
                  </div>
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="backend-mode">
                    {t("settings.backend_mode")}
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
                    <option value="local">{t("settings.local")}</option>
                    <option value="remote">{t("settings.remote")}</option>
                  </select>
                  <div className="settings-help">
                    {t("settings.remote_description")}
                  </div>
                </div>

                {appSettings.backendMode === "remote" && (
                  <div className="settings-field">
                    <div className="settings-field-label">{t("settings.remote_backend")}</div>
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
                        aria-label={t("settings.host")}
                      />
                      <input
                        type="password"
                        className="settings-input settings-input--compact"
                        value={remoteTokenDraft}
                        placeholder={t("settings.token_optional")}
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
                        aria-label={t("settings.token_optional")}
                      />
                    </div>
                    <div className="settings-help">
                      {t("settings.remote_backend_description")}
                    </div>
                  </div>
                )}

                <FileEditorCard
                  title={t("settings.global_agents_md")}
                  meta={globalAgentsMeta}
                  error={globalAgentsError}
                  value={globalAgentsContent}
                  placeholder={t("settings.global_agents_md_placeholder")}
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
                      {t("settings.global_agents_md_description")}
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
                  title={t("settings.global_config_toml")}
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
                  <div className="settings-field-label">{t("settings.workspaces")}覆盖项</div>
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
                              {t("settings.shortcuts.clear")}
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
                              {t("settings.shortcuts.clear")}
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
                              {t("settings.shortcuts.clear")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="settings-empty">{t("settings.no_workspaces")}</div>
                    )}
                  </div>
                </div>

              </section>
            )}
            {activeSection === "features" && (
              <section className="settings-section">
                <div className="settings-section-title">{t("settings.features")}</div>
                <div className="settings-section-subtitle">
                  管理稳定与实验性 Codex {t("settings.features")}。
                </div>
                {hasCodexHomeOverrides && (
                  <div className="settings-help">
                    {t("settings.features")}设置存储在默认 CODEX_HOME 的 config.toml 中。
                    <br />
                    {t("settings.workspaces")}覆盖项不会同步更新。
                  </div>
                )}
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.features.config_file")}</div>
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
                <div className="settings-subsection-title">{t("settings.features.stable_features")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.features.stable_features_description")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.features.collaboration_mode")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.collaboration_mode_description")}
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
                    <div className="settings-toggle-title">{t("settings.features.communication_style")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.communication_style_description")}
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
                    <option value="friendly">{t("settings.friendly")}</option>
                    <option value="pragmatic">{t("settings.pragmatic")}</option>
                  </select>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.features.guided_mode")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.guided_mode_description")}
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
                    <div className="settings-toggle-title">{t("settings.features.background_terminal")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.background_terminal_description")}
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
                <div className="settings-subsection-title">{t("settings.features.experimental_features")}</div>
                <div className="settings-subsection-subtitle">
                  {t("settings.features.experimental_features_description")}
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">{t("settings.features.multi_agent")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.multi_agent_description")}
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
                    <div className="settings-toggle-title">{t("settings.features.apps")}</div>
                    <div className="settings-toggle-subtitle">
                      {t("settings.features.apps_description")}
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
