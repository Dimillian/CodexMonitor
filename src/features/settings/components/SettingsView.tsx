import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import X from "lucide-react/dist/esm/icons/x";
import type {
  AppSettings,
  CodexDoctorResult,
  DictationModelStatus,
  OrbitConnectTestResult,
  OrbitRunnerStatus,
  OrbitSignInPollResult,
  OrbitSignOutResult,
  TcpDaemonStatus,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  WorkspaceSettings,
  OpenAppTarget,
  WorkspaceGroup,
  WorkspaceInfo,
} from "../../../types";
import {
  getCodexConfigPath,
  listWorkspaces,
  orbitConnectTest,
  orbitRunnerStart,
  orbitRunnerStatus,
  orbitRunnerStop,
  orbitSignInPoll,
  orbitSignInStart,
  orbitSignOut,
  tailscaleDaemonStart,
  tailscaleDaemonStatus,
  tailscaleDaemonStop,
  tailscaleDaemonCommandPreview as fetchTailscaleDaemonCommandPreview,
  tailscaleStatus as fetchTailscaleStatus,
} from "../../../services/tauri";
import {
  isMacPlatform,
  isMobilePlatform,
  isWindowsPlatform,
} from "../../../utils/platformPaths";
import { buildShortcutValue } from "../../../utils/shortcuts";
import { clampUiScale } from "../../../utils/uiScale";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import { DEFAULT_OPEN_APP_ID, OPEN_APP_STORAGE_KEY } from "../../app/constants";
import { useGlobalAgentsMd } from "../hooks/useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "../hooks/useGlobalCodexConfigToml";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { SettingsNav } from "./SettingsNav";
import {
  type CodexSection,
  type OpenAppDraft,
  type OrbitServiceClient,
  type ShortcutDraftKey,
  type ShortcutSettingKey,
} from "./settingsTypes";
import { SettingsProjectsSection } from "./sections/SettingsProjectsSection";
import { SettingsEnvironmentsSection } from "./sections/SettingsEnvironmentsSection";
import { SettingsDisplaySection } from "./sections/SettingsDisplaySection";
import { SettingsComposerSection } from "./sections/SettingsComposerSection";
import { SettingsDictationSection } from "./sections/SettingsDictationSection";
import { SettingsShortcutsSection } from "./sections/SettingsShortcutsSection";
import { SettingsOpenAppsSection } from "./sections/SettingsOpenAppsSection";
import { SettingsGitSection } from "./sections/SettingsGitSection";
import { SettingsCodexSection } from "./sections/SettingsCodexSection";
import { SettingsServerSection } from "./sections/SettingsServerSection";
import { SettingsFeaturesSection } from "./sections/SettingsFeaturesSection";

const DICTATION_MODELS = [
  { id: "tiny", label: "Tiny", size: "75 MB", note: "Fastest, least accurate." },
  { id: "base", label: "Base", size: "142 MB", note: "Balanced default." },
  { id: "small", label: "Small", size: "466 MB", note: "Better accuracy." },
  { id: "medium", label: "Medium", size: "1.5 GB", note: "High accuracy." },
  { id: "large-v3", label: "Large V3", size: "3.0 GB", note: "Best accuracy, heavy download." },
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
  default: "Default (no helpers)",
  helpful: "Helpful",
  smart: "Smart",
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

const orbitServices: OrbitServiceClient = {
  orbitConnectTest,
  orbitSignInStart,
  orbitSignInPoll,
  orbitSignOut,
  orbitRunnerStart,
  orbitRunnerStop,
  orbitRunnerStatus,
};

const ORBIT_DEFAULT_POLL_INTERVAL_SECONDS = 5;
const ORBIT_MAX_INLINE_POLL_SECONDS = 180;
const SETTINGS_MOBILE_BREAKPOINT_PX = 720;

const SETTINGS_SECTION_LABELS: Record<CodexSection, string> = {
  projects: "Projects",
  environments: "Environments",
  display: "Display & Sound",
  composer: "Composer",
  dictation: "Dictation",
  shortcuts: "Shortcuts",
  "open-apps": "Open in",
  git: "Git",
  server: "Server",
  codex: "Codex",
  features: "Features",
};

const isNarrowSettingsViewport = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(`(max-width: ${SETTINGS_MOBILE_BREAKPOINT_PX}px)`).matches;
};

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

type OrbitActionResult =
  | OrbitConnectTestResult
  | OrbitSignInPollResult
  | OrbitSignOutResult
  | OrbitRunnerStatus;

const getOrbitStatusText = (value: OrbitActionResult, fallback: string): string => {
  if ("ok" in value) {
    if (!value.ok) {
      return value.message || fallback;
    }
    if (value.message.trim()) {
      return value.message;
    }
    if (typeof value.latencyMs === "number") {
      return `Connected to Orbit relay in ${value.latencyMs}ms.`;
    }
    return fallback;
  }

  if ("status" in value) {
    if (value.message && value.message.trim()) {
      return value.message;
    }
    switch (value.status) {
      case "pending":
        return "Waiting for Orbit sign-in authorization.";
      case "authorized":
        return "Orbit sign in complete.";
      case "denied":
        return "Orbit sign in denied.";
      case "expired":
        return "Orbit sign in code expired.";
      case "error":
        return "Orbit sign in failed.";
      default:
        return fallback;
    }
  }

  if ("success" in value) {
    if (!value.success && value.message && value.message.trim()) {
      return value.message;
    }
    return value.success ? "Signed out from Orbit." : fallback;
  }

  if (value.state === "running") {
    return value.pid ? `Orbit runner is running (pid ${value.pid}).` : "Orbit runner is running.";
  }
  if (value.state === "error") {
    return value.lastError?.trim() || "Orbit runner is in error state.";
  }
  return "Orbit runner is stopped.";
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
  onMobileConnectSuccess?: () => Promise<void> | void;
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
  initialSection?: CodexSection;
  orbitServiceClient?: OrbitServiceClient;
};

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
  onMobileConnectSuccess,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
  initialSection,
  orbitServiceClient = orbitServices,
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
  const [orbitWsUrlDraft, setOrbitWsUrlDraft] = useState(appSettings.orbitWsUrl ?? "");
  const [orbitAuthUrlDraft, setOrbitAuthUrlDraft] = useState(appSettings.orbitAuthUrl ?? "");
  const [orbitRunnerNameDraft, setOrbitRunnerNameDraft] = useState(
    appSettings.orbitRunnerName ?? "",
  );
  const [orbitAccessClientIdDraft, setOrbitAccessClientIdDraft] = useState(
    appSettings.orbitAccessClientId ?? "",
  );
  const [orbitAccessClientSecretRefDraft, setOrbitAccessClientSecretRefDraft] =
    useState(appSettings.orbitAccessClientSecretRef ?? "");
  const [orbitStatusText, setOrbitStatusText] = useState<string | null>(null);
  const [orbitAuthCode, setOrbitAuthCode] = useState<string | null>(null);
  const [orbitVerificationUrl, setOrbitVerificationUrl] = useState<string | null>(
    null,
  );
  const [orbitBusyAction, setOrbitBusyAction] = useState<string | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(
    null,
  );
  const [tailscaleStatusBusy, setTailscaleStatusBusy] = useState(false);
  const [tailscaleStatusError, setTailscaleStatusError] = useState<string | null>(null);
  const [tailscaleCommandPreview, setTailscaleCommandPreview] =
    useState<TailscaleDaemonCommandPreview | null>(null);
  const [tailscaleCommandBusy, setTailscaleCommandBusy] = useState(false);
  const [tailscaleCommandError, setTailscaleCommandError] = useState<string | null>(
    null,
  );
  const [tcpDaemonStatus, setTcpDaemonStatus] = useState<TcpDaemonStatus | null>(null);
  const [tcpDaemonBusyAction, setTcpDaemonBusyAction] = useState<
    "start" | "stop" | "status" | null
  >(null);
  const [mobileConnectBusy, setMobileConnectBusy] = useState(false);
  const [mobileConnectStatusText, setMobileConnectStatusText] = useState<string | null>(
    null,
  );
  const [mobileConnectStatusError, setMobileConnectStatusError] = useState(false);
  const mobilePlatform = useMemo(() => isMobilePlatform(), []);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    isNarrowSettingsViewport(),
  );
  const [showMobileDetail, setShowMobileDetail] = useState(Boolean(initialSection));
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
  const latestSettingsRef = useRef(appSettings);
  const dictationReady = dictationModelStatus?.state === "ready";
  const globalAgentsStatus = globalAgentsLoading
    ? "Loading…"
    : globalAgentsSaving
      ? "Saving…"
      : globalAgentsExists
        ? ""
        : "Not found";
  const globalAgentsMetaParts: string[] = [];
  if (globalAgentsStatus) {
    globalAgentsMetaParts.push(globalAgentsStatus);
  }
  if (globalAgentsTruncated) {
    globalAgentsMetaParts.push("Truncated");
  }
  const globalAgentsMeta = globalAgentsMetaParts.join(" · ");
  const globalAgentsSaveLabel = globalAgentsExists ? "Save" : "Create";
  const globalAgentsSaveDisabled = globalAgentsLoading || globalAgentsSaving || !globalAgentsDirty;
  const globalAgentsRefreshDisabled = globalAgentsLoading || globalAgentsSaving;
  const globalConfigStatus = globalConfigLoading
    ? "Loading…"
    : globalConfigSaving
      ? "Saving…"
      : globalConfigExists
        ? ""
        : "Not found";
  const globalConfigMetaParts: string[] = [];
  if (globalConfigStatus) {
    globalConfigMetaParts.push(globalConfigStatus);
  }
  if (globalConfigTruncated) {
    globalConfigMetaParts.push("Truncated");
  }
  const globalConfigMeta = globalConfigMetaParts.join(" · ");
  const globalConfigSaveLabel = globalConfigExists ? "Save" : "Create";
  const globalConfigSaveDisabled = globalConfigLoading || globalConfigSaving || !globalConfigDirty;
  const globalConfigRefreshDisabled = globalConfigLoading || globalConfigSaving;
  const optionKeyLabel = isMacPlatform() ? "Option" : "Alt";
  const metaKeyLabel = isMacPlatform()
    ? "Command"
    : isWindowsPlatform()
      ? "Windows"
      : "Meta";
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
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

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
    setOrbitWsUrlDraft(appSettings.orbitWsUrl ?? "");
  }, [appSettings.orbitWsUrl]);

  useEffect(() => {
    setOrbitAuthUrlDraft(appSettings.orbitAuthUrl ?? "");
  }, [appSettings.orbitAuthUrl]);

  useEffect(() => {
    setOrbitRunnerNameDraft(appSettings.orbitRunnerName ?? "");
  }, [appSettings.orbitRunnerName]);

  useEffect(() => {
    setOrbitAccessClientIdDraft(appSettings.orbitAccessClientId ?? "");
  }, [appSettings.orbitAccessClientId]);

  useEffect(() => {
    setOrbitAccessClientSecretRefDraft(appSettings.orbitAccessClientSecretRef ?? "");
  }, [appSettings.orbitAccessClientSecretRef]);

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
        error instanceof Error ? error.message : "Unable to open config.",
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(`(max-width: ${SETTINGS_MOBILE_BREAKPOINT_PX}px)`);
    const applyViewportState = () => {
      setIsNarrowViewport(query.matches);
    };
    applyViewportState();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", applyViewportState);
      return () => {
        query.removeEventListener("change", applyViewportState);
      };
    }
    query.addListener(applyViewportState);
    return () => {
      query.removeListener(applyViewportState);
    };
  }, []);

  const useMobileMasterDetail = isNarrowViewport;

  useEffect(() => {
    if (useMobileMasterDetail) {
      return;
    }
    setShowMobileDetail(false);
  }, [useMobileMasterDetail]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    }
  }, [initialSection, useMobileMasterDetail]);

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

  const updateRemoteBackendSettings = useCallback(
    async ({
      host,
      token,
      provider,
      orbitWsUrl,
    }: {
      host?: string;
      token?: string | null;
      provider?: AppSettings["remoteBackendProvider"];
      orbitWsUrl?: string | null;
    }) => {
      const latestSettings = latestSettingsRef.current;
      const nextHost = host ?? latestSettings.remoteBackendHost;
      const nextToken =
        token === undefined ? latestSettings.remoteBackendToken : token;
      const nextProvider = provider ?? latestSettings.remoteBackendProvider;
      const nextOrbitWsUrl =
        orbitWsUrl === undefined ? latestSettings.orbitWsUrl : orbitWsUrl;
      const nextSettings: AppSettings = {
        ...latestSettings,
        remoteBackendHost: nextHost,
        remoteBackendToken: nextToken,
        remoteBackendProvider: nextProvider,
        orbitWsUrl: nextOrbitWsUrl,
        ...(mobilePlatform
          ? {
              backendMode: "remote",
            }
          : {}),
      };
      const unchanged =
        nextSettings.remoteBackendHost === latestSettings.remoteBackendHost &&
        nextSettings.remoteBackendToken === latestSettings.remoteBackendToken &&
        nextSettings.orbitWsUrl === latestSettings.orbitWsUrl &&
        nextSettings.backendMode === latestSettings.backendMode &&
        nextSettings.remoteBackendProvider === latestSettings.remoteBackendProvider;
      if (unchanged) {
        return;
      }
      await onUpdateAppSettings(nextSettings);
      latestSettingsRef.current = nextSettings;
    },
    [mobilePlatform, onUpdateAppSettings],
  );

  const applyRemoteHost = async (rawValue: string) => {
    const nextHost = rawValue.trim() || "127.0.0.1:4732";
    setRemoteHostDraft(nextHost);
    await updateRemoteBackendSettings({ host: nextHost });
  };

  const handleCommitRemoteHost = async () => {
    await applyRemoteHost(remoteHostDraft);
  };

  const handleCommitRemoteToken = async () => {
    const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
    setRemoteTokenDraft(nextToken ?? "");
    await updateRemoteBackendSettings({ token: nextToken });
  };

  const handleMobileConnectTest = () => {
    void (async () => {
      const provider = latestSettingsRef.current.remoteBackendProvider;
      const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
      setRemoteTokenDraft(nextToken ?? "");
      setMobileConnectBusy(true);
      setMobileConnectStatusText(null);
      setMobileConnectStatusError(false);
      try {
        if (provider === "tcp") {
          const nextHost = remoteHostDraft.trim() || "127.0.0.1:4732";
          setRemoteHostDraft(nextHost);
          await updateRemoteBackendSettings({
            host: nextHost,
            token: nextToken,
          });
        } else {
          const nextOrbitWsUrl = normalizeOverrideValue(orbitWsUrlDraft);
          setOrbitWsUrlDraft(nextOrbitWsUrl ?? "");
          if (!nextOrbitWsUrl) {
            throw new Error("Orbit websocket URL is required.");
          }
          await updateRemoteBackendSettings({
            token: nextToken,
            orbitWsUrl: nextOrbitWsUrl,
          });
        }
        const workspaces = await listWorkspaces();
        const workspaceCount = workspaces.length;
        const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
        setMobileConnectStatusText(
          `Connected. ${workspaceCount} ${workspaceWord} reachable on the remote backend.`,
        );
        await onMobileConnectSuccess?.();
      } catch (error) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(
          error instanceof Error ? error.message : "Unable to connect to remote backend.",
        );
      } finally {
        setMobileConnectBusy(false);
      }
    })();
  };

  useEffect(() => {
    if (!mobilePlatform) {
      return;
    }
    setMobileConnectStatusText(null);
    setMobileConnectStatusError(false);
  }, [
    appSettings.remoteBackendProvider,
    mobilePlatform,
    orbitWsUrlDraft,
    remoteHostDraft,
    remoteTokenDraft,
  ]);

  const handleChangeRemoteProvider = async (
    provider: AppSettings["remoteBackendProvider"],
  ) => {
    if (provider === latestSettingsRef.current.remoteBackendProvider) {
      return;
    }
    await updateRemoteBackendSettings({
      provider,
    });
  };

  const handleRefreshTailscaleStatus = useCallback(() => {
    void (async () => {
      setTailscaleStatusBusy(true);
      setTailscaleStatusError(null);
      try {
        const status = await fetchTailscaleStatus();
        setTailscaleStatus(status);
      } catch (error) {
        setTailscaleStatusError(
          error instanceof Error ? error.message : "Unable to load Tailscale status.",
        );
      } finally {
        setTailscaleStatusBusy(false);
      }
    })();
  }, []);

  const handleRefreshTailscaleCommandPreview = useCallback(() => {
    void (async () => {
      setTailscaleCommandBusy(true);
      setTailscaleCommandError(null);
      try {
        const preview = await fetchTailscaleDaemonCommandPreview();
        setTailscaleCommandPreview(preview);
      } catch (error) {
        setTailscaleCommandError(
          error instanceof Error
            ? error.message
            : "Unable to build Tailscale daemon command.",
        );
      } finally {
        setTailscaleCommandBusy(false);
      }
    })();
  }, []);

  const handleUseSuggestedTailscaleHost = async () => {
    const suggestedHost = tailscaleStatus?.suggestedRemoteHost ?? null;
    if (!suggestedHost) {
      return;
    }
    await applyRemoteHost(suggestedHost);
  };

  const runTcpDaemonAction = useCallback(
    async (
      action: "start" | "stop" | "status",
      run: () => Promise<TcpDaemonStatus>,
    ) => {
      setTcpDaemonBusyAction(action);
      try {
        const status = await run();
        setTcpDaemonStatus(status);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unable to update mobile access daemon status.";
        setTcpDaemonStatus((prev) => ({
          state: "error",
          pid: null,
          startedAtMs: null,
          lastError: errorMessage,
          listenAddr: prev?.listenAddr ?? null,
        }));
      } finally {
        setTcpDaemonBusyAction(null);
      }
    },
    [],
  );

  const handleTcpDaemonStart = useCallback(async () => {
    await runTcpDaemonAction("start", tailscaleDaemonStart);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStop = useCallback(async () => {
    await runTcpDaemonAction("stop", tailscaleDaemonStop);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStatus = useCallback(async () => {
    await runTcpDaemonAction("status", tailscaleDaemonStatus);
  }, [runTcpDaemonAction]);

  const handleCommitOrbitWsUrl = async () => {
    const nextValue = normalizeOverrideValue(orbitWsUrlDraft);
    setOrbitWsUrlDraft(nextValue ?? "");
    await updateRemoteBackendSettings({
      orbitWsUrl: nextValue,
    });
  };

  const handleCommitOrbitAuthUrl = async () => {
    const nextValue = normalizeOverrideValue(orbitAuthUrlDraft);
    setOrbitAuthUrlDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAuthUrl) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAuthUrl: nextValue,
    });
  };

  const handleCommitOrbitRunnerName = async () => {
    const nextValue = normalizeOverrideValue(orbitRunnerNameDraft);
    setOrbitRunnerNameDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitRunnerName) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitRunnerName: nextValue,
    });
  };

  const handleCommitOrbitAccessClientId = async () => {
    const nextValue = normalizeOverrideValue(orbitAccessClientIdDraft);
    setOrbitAccessClientIdDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAccessClientId) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAccessClientId: nextValue,
    });
  };

  const handleCommitOrbitAccessClientSecretRef = async () => {
    const nextValue = normalizeOverrideValue(orbitAccessClientSecretRefDraft);
    setOrbitAccessClientSecretRefDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAccessClientSecretRef) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAccessClientSecretRef: nextValue,
    });
  };

  const runOrbitAction = async <T extends OrbitActionResult>(
    actionKey: string,
    actionLabel: string,
    action: () => Promise<T>,
    successFallback: string,
  ): Promise<T | null> => {
    setOrbitBusyAction(actionKey);
    setOrbitStatusText(`${actionLabel}...`);
    try {
      const result = await action();
      setOrbitStatusText(getOrbitStatusText(result, successFallback));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Orbit error";
      setOrbitStatusText(`${actionLabel} failed: ${message}`);
      return null;
    } finally {
      setOrbitBusyAction(null);
    }
  };

  const syncRemoteBackendToken = async (nextToken: string | null) => {
    const normalizedToken = nextToken?.trim() ? nextToken.trim() : null;
    setRemoteTokenDraft(normalizedToken ?? "");
    const latestSettings = latestSettingsRef.current;
    if (normalizedToken === latestSettings.remoteBackendToken) {
      return;
    }
    const nextSettings = {
      ...latestSettings,
      remoteBackendToken: normalizedToken,
    };
    await onUpdateAppSettings({
      ...nextSettings,
    });
    latestSettingsRef.current = nextSettings;
  };

  const handleOrbitConnectTest = () => {
    void runOrbitAction(
      "connect-test",
      "Connect test",
      orbitServiceClient.orbitConnectTest,
      "Orbit connection test succeeded.",
    );
  };

  const handleOrbitSignIn = () => {
    void (async () => {
      setOrbitBusyAction("sign-in");
      setOrbitStatusText("Starting Orbit sign in...");
      setOrbitAuthCode(null);
      setOrbitVerificationUrl(null);
      try {
        const startResult = await orbitServiceClient.orbitSignInStart();
        setOrbitAuthCode(startResult.userCode ?? startResult.deviceCode);
        setOrbitVerificationUrl(
          startResult.verificationUriComplete ?? startResult.verificationUri,
        );
        setOrbitStatusText(
          "Orbit sign in started. Finish authorization in the browser window, then keep this dialog open while we poll for completion.",
        );

        const maxPollWindowSeconds = Math.max(
          1,
          Math.min(startResult.expiresInSeconds, ORBIT_MAX_INLINE_POLL_SECONDS),
        );
        const deadlineMs = Date.now() + maxPollWindowSeconds * 1000;
        let pollIntervalSeconds = Math.max(
          1,
          startResult.intervalSeconds || ORBIT_DEFAULT_POLL_INTERVAL_SECONDS,
        );

        while (Date.now() < deadlineMs) {
          await delay(pollIntervalSeconds * 1000);
          const pollResult = await orbitServiceClient.orbitSignInPoll(
            startResult.deviceCode,
          );
          setOrbitStatusText(
            getOrbitStatusText(pollResult, "Orbit sign in status refreshed."),
          );

          if (pollResult.status === "pending") {
            if (typeof pollResult.intervalSeconds === "number") {
              pollIntervalSeconds = Math.max(1, pollResult.intervalSeconds);
            }
            continue;
          }

          if (pollResult.status === "authorized") {
            if (pollResult.token) {
              await syncRemoteBackendToken(pollResult.token);
            }
          }
          return;
        }

        setOrbitStatusText(
          "Orbit sign in is still pending. Leave this window open and try Sign In again if authorization just completed.",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Orbit error";
        setOrbitStatusText(`Sign In failed: ${message}`);
      } finally {
        setOrbitBusyAction(null);
      }
    })();
  };

  const handleOrbitSignOut = () => {
    void (async () => {
      const result = await runOrbitAction(
        "sign-out",
        "Sign Out",
        orbitServiceClient.orbitSignOut,
        "Signed out from Orbit.",
      );
      if (result !== null) {
        try {
          await syncRemoteBackendToken(null);
          setOrbitAuthCode(null);
          setOrbitVerificationUrl(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Orbit error";
          setOrbitStatusText(`Sign Out failed: ${message}`);
        }
      }
    })();
  };

  const handleOrbitRunnerStart = () => {
    void runOrbitAction(
      "runner-start",
      "Start Runner",
      orbitServiceClient.orbitRunnerStart,
      "Orbit runner started.",
    );
  };

  const handleOrbitRunnerStop = () => {
    void runOrbitAction(
      "runner-stop",
      "Stop Runner",
      orbitServiceClient.orbitRunnerStop,
      "Orbit runner stopped.",
    );
  };

  const handleOrbitRunnerStatus = () => {
    void runOrbitAction(
      "runner-status",
      "Refresh Status",
      orbitServiceClient.orbitRunnerStatus,
      "Orbit runner status refreshed.",
    );
  };

  useEffect(() => {
    if (appSettings.remoteBackendProvider !== "tcp") {
      return;
    }
    if (!mobilePlatform) {
      handleRefreshTailscaleCommandPreview();
      void handleTcpDaemonStatus();
    }
    if (tailscaleStatus === null && !tailscaleStatusBusy && !tailscaleStatusError) {
      handleRefreshTailscaleStatus();
    }
  }, [
    appSettings.remoteBackendProvider,
    appSettings.remoteBackendToken,
    handleRefreshTailscaleCommandPreview,
    handleRefreshTailscaleStatus,
    handleTcpDaemonStatus,
    mobilePlatform,
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
  ]);

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
      label: "New App",
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
        ? `\n\nProjects in this group will move to "${ungroupedLabel}".`
        : "";
    const confirmed = await ask(
      `Delete "${group.name}"?${detail}`,
      {
        title: "Delete Group",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
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


  const handleCommitOpenAppsDrafts = () => {
    void handleCommitOpenApps(openAppDrafts);
  };

  const handleSelectSection = useCallback(
    (section: CodexSection) => {
      setActiveSection(section);
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    },
    [useMobileMasterDetail],
  );

  const activeSectionLabel = SETTINGS_SECTION_LABELS[activeSection];
  const settingsBodyClassName = `settings-body${
    useMobileMasterDetail ? " settings-body-mobile-master-detail" : ""
  }${useMobileMasterDetail && showMobileDetail ? " is-detail-visible" : ""}`;

  return (
    <ModalShell
      className="settings-overlay"
      cardClassName="settings-window"
      onBackdropClick={onClose}
      ariaLabelledBy="settings-modal-title"
    >
      <div className="settings-titlebar">
        <div className="settings-title" id="settings-modal-title">
          Settings
        </div>
        <button
          type="button"
          className="ghost icon-button settings-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X aria-hidden />
        </button>
      </div>
      <div className={settingsBodyClassName}>
        {(!useMobileMasterDetail || !showMobileDetail) && (
          <div className="settings-master">
            <SettingsNav
              activeSection={activeSection}
              onSelectSection={handleSelectSection}
              showDisclosure={useMobileMasterDetail}
            />
          </div>
        )}
        {(!useMobileMasterDetail || showMobileDetail) && (
          <div className="settings-detail">
            {useMobileMasterDetail && (
              <div className="settings-mobile-detail-header">
                <button
                  type="button"
                  className="settings-mobile-back"
                  onClick={() => setShowMobileDetail(false)}
                  aria-label="Back to settings sections"
                >
                  <ChevronLeft aria-hidden />
                  Sections
                </button>
                <div className="settings-mobile-detail-title">
                  {activeSectionLabel}
                </div>
              </div>
            )}
            <div className="settings-content">
          {activeSection === "projects" && (
            <SettingsProjectsSection
              workspaceGroups={workspaceGroups}
              groupedWorkspaces={groupedWorkspaces}
              ungroupedLabel={ungroupedLabel}
              groupDrafts={groupDrafts}
              newGroupName={newGroupName}
              groupError={groupError}
              projects={projects}
              canCreateGroup={canCreateGroup}
              onSetNewGroupName={setNewGroupName}
              onSetGroupDrafts={setGroupDrafts}
              onCreateGroup={handleCreateGroup}
              onRenameGroup={handleRenameGroup}
              onMoveWorkspaceGroup={onMoveWorkspaceGroup}
              onDeleteGroup={handleDeleteGroup}
              onChooseGroupCopiesFolder={handleChooseGroupCopiesFolder}
              onClearGroupCopiesFolder={handleClearGroupCopiesFolder}
              onAssignWorkspaceGroup={onAssignWorkspaceGroup}
              onMoveWorkspace={onMoveWorkspace}
              onDeleteWorkspace={onDeleteWorkspace}
            />
          )}
          {activeSection === "environments" && (
            <SettingsEnvironmentsSection
              mainWorkspaces={mainWorkspaces}
              environmentWorkspace={environmentWorkspace}
              environmentSaving={environmentSaving}
              environmentError={environmentError}
              environmentDraftScript={environmentDraftScript}
              environmentSavedScript={environmentSavedScript}
              environmentDirty={environmentDirty}
              onSetEnvironmentWorkspaceId={setEnvironmentWorkspaceId}
              onSetEnvironmentDraftScript={setEnvironmentDraftScript}
              onSaveEnvironmentSetup={handleSaveEnvironmentSetup}
            />
          )}
          {activeSection === "display" && (
            <SettingsDisplaySection
              appSettings={appSettings}
              reduceTransparency={reduceTransparency}
              scaleShortcutTitle={scaleShortcutTitle}
              scaleShortcutText={scaleShortcutText}
              scaleDraft={scaleDraft}
              uiFontDraft={uiFontDraft}
              codeFontDraft={codeFontDraft}
              codeFontSizeDraft={codeFontSizeDraft}
              onUpdateAppSettings={onUpdateAppSettings}
              onToggleTransparency={onToggleTransparency}
              onSetScaleDraft={setScaleDraft}
              onCommitScale={handleCommitScale}
              onResetScale={handleResetScale}
              onSetUiFontDraft={setUiFontDraft}
              onCommitUiFont={handleCommitUiFont}
              onSetCodeFontDraft={setCodeFontDraft}
              onCommitCodeFont={handleCommitCodeFont}
              onSetCodeFontSizeDraft={setCodeFontSizeDraft}
              onCommitCodeFontSize={handleCommitCodeFontSize}
              onTestNotificationSound={onTestNotificationSound}
              onTestSystemNotification={onTestSystemNotification}
            />
          )}
          {activeSection === "composer" && (
            <SettingsComposerSection
              appSettings={appSettings}
              optionKeyLabel={optionKeyLabel}
              composerPresetLabels={COMPOSER_PRESET_LABELS}
              onComposerPresetChange={handleComposerPresetChange}
              onUpdateAppSettings={onUpdateAppSettings}
            />
          )}
          {activeSection === "dictation" && (
            <SettingsDictationSection
              appSettings={appSettings}
              optionKeyLabel={optionKeyLabel}
              metaKeyLabel={metaKeyLabel}
              dictationModels={DICTATION_MODELS}
              selectedDictationModel={selectedDictationModel}
              dictationModelStatus={dictationModelStatus}
              dictationReady={dictationReady}
              onUpdateAppSettings={onUpdateAppSettings}
              onDownloadDictationModel={onDownloadDictationModel}
              onCancelDictationDownload={onCancelDictationDownload}
              onRemoveDictationModel={onRemoveDictationModel}
            />
          )}
          {activeSection === "shortcuts" && (
            <SettingsShortcutsSection
              shortcutDrafts={shortcutDrafts}
              onShortcutKeyDown={handleShortcutKeyDown}
              onClearShortcut={(key) => {
                void updateShortcut(key, null);
              }}
            />
          )}
          {activeSection === "open-apps" && (
            <SettingsOpenAppsSection
              openAppDrafts={openAppDrafts}
              openAppSelectedId={openAppSelectedId}
              openAppIconById={openAppIconById}
              onOpenAppDraftChange={handleOpenAppDraftChange}
              onOpenAppKindChange={handleOpenAppKindChange}
              onCommitOpenApps={handleCommitOpenAppsDrafts}
              onMoveOpenApp={handleMoveOpenApp}
              onDeleteOpenApp={handleDeleteOpenApp}
              onAddOpenApp={handleAddOpenApp}
              onSelectOpenAppDefault={handleSelectOpenAppDefault}
            />
          )}
          {activeSection === "git" && (
            <SettingsGitSection
              appSettings={appSettings}
              onUpdateAppSettings={onUpdateAppSettings}
            />
          )}
          {activeSection === "server" && (
            <SettingsServerSection
              appSettings={appSettings}
              onUpdateAppSettings={onUpdateAppSettings}
              remoteHostDraft={remoteHostDraft}
              remoteTokenDraft={remoteTokenDraft}
              orbitWsUrlDraft={orbitWsUrlDraft}
              orbitAuthUrlDraft={orbitAuthUrlDraft}
              orbitRunnerNameDraft={orbitRunnerNameDraft}
              orbitAccessClientIdDraft={orbitAccessClientIdDraft}
              orbitAccessClientSecretRefDraft={orbitAccessClientSecretRefDraft}
              orbitStatusText={orbitStatusText}
              orbitAuthCode={orbitAuthCode}
              orbitVerificationUrl={orbitVerificationUrl}
              orbitBusyAction={orbitBusyAction}
              tailscaleStatus={tailscaleStatus}
              tailscaleStatusBusy={tailscaleStatusBusy}
              tailscaleStatusError={tailscaleStatusError}
              tailscaleCommandPreview={tailscaleCommandPreview}
              tailscaleCommandBusy={tailscaleCommandBusy}
              tailscaleCommandError={tailscaleCommandError}
              tcpDaemonStatus={tcpDaemonStatus}
              tcpDaemonBusyAction={tcpDaemonBusyAction}
              onSetRemoteHostDraft={setRemoteHostDraft}
              onSetRemoteTokenDraft={setRemoteTokenDraft}
              onSetOrbitWsUrlDraft={setOrbitWsUrlDraft}
              onSetOrbitAuthUrlDraft={setOrbitAuthUrlDraft}
              onSetOrbitRunnerNameDraft={setOrbitRunnerNameDraft}
              onSetOrbitAccessClientIdDraft={setOrbitAccessClientIdDraft}
              onSetOrbitAccessClientSecretRefDraft={setOrbitAccessClientSecretRefDraft}
              onCommitRemoteHost={handleCommitRemoteHost}
              onCommitRemoteToken={handleCommitRemoteToken}
              onChangeRemoteProvider={handleChangeRemoteProvider}
              onRefreshTailscaleStatus={handleRefreshTailscaleStatus}
              onRefreshTailscaleCommandPreview={handleRefreshTailscaleCommandPreview}
              onUseSuggestedTailscaleHost={handleUseSuggestedTailscaleHost}
              onTcpDaemonStart={handleTcpDaemonStart}
              onTcpDaemonStop={handleTcpDaemonStop}
              onTcpDaemonStatus={handleTcpDaemonStatus}
              onCommitOrbitWsUrl={handleCommitOrbitWsUrl}
              onCommitOrbitAuthUrl={handleCommitOrbitAuthUrl}
              onCommitOrbitRunnerName={handleCommitOrbitRunnerName}
              onCommitOrbitAccessClientId={handleCommitOrbitAccessClientId}
              onCommitOrbitAccessClientSecretRef={handleCommitOrbitAccessClientSecretRef}
              onOrbitConnectTest={handleOrbitConnectTest}
              onOrbitSignIn={handleOrbitSignIn}
              onOrbitSignOut={handleOrbitSignOut}
              onOrbitRunnerStart={handleOrbitRunnerStart}
              onOrbitRunnerStop={handleOrbitRunnerStop}
              onOrbitRunnerStatus={handleOrbitRunnerStatus}
              isMobilePlatform={mobilePlatform}
              mobileConnectBusy={mobileConnectBusy}
              mobileConnectStatusText={mobileConnectStatusText}
              mobileConnectStatusError={mobileConnectStatusError}
              onMobileConnectTest={handleMobileConnectTest}
            />
          )}
          {activeSection === "codex" && (
            <SettingsCodexSection
              appSettings={appSettings}
              onUpdateAppSettings={onUpdateAppSettings}
              codexPathDraft={codexPathDraft}
              codexArgsDraft={codexArgsDraft}
              codexDirty={codexDirty}
              isSavingSettings={isSavingSettings}
              doctorState={doctorState}
              globalAgentsMeta={globalAgentsMeta}
              globalAgentsError={globalAgentsError}
              globalAgentsContent={globalAgentsContent}
              globalAgentsLoading={globalAgentsLoading}
              globalAgentsRefreshDisabled={globalAgentsRefreshDisabled}
              globalAgentsSaveDisabled={globalAgentsSaveDisabled}
              globalAgentsSaveLabel={globalAgentsSaveLabel}
              globalConfigMeta={globalConfigMeta}
              globalConfigError={globalConfigError}
              globalConfigContent={globalConfigContent}
              globalConfigLoading={globalConfigLoading}
              globalConfigRefreshDisabled={globalConfigRefreshDisabled}
              globalConfigSaveDisabled={globalConfigSaveDisabled}
              globalConfigSaveLabel={globalConfigSaveLabel}
              projects={projects}
              codexBinOverrideDrafts={codexBinOverrideDrafts}
              codexHomeOverrideDrafts={codexHomeOverrideDrafts}
              codexArgsOverrideDrafts={codexArgsOverrideDrafts}
              onSetCodexPathDraft={setCodexPathDraft}
              onSetCodexArgsDraft={setCodexArgsDraft}
              onSetGlobalAgentsContent={setGlobalAgentsContent}
              onSetGlobalConfigContent={setGlobalConfigContent}
              onSetCodexBinOverrideDrafts={setCodexBinOverrideDrafts}
              onSetCodexHomeOverrideDrafts={setCodexHomeOverrideDrafts}
              onSetCodexArgsOverrideDrafts={setCodexArgsOverrideDrafts}
              onBrowseCodex={handleBrowseCodex}
              onSaveCodexSettings={handleSaveCodexSettings}
              onRunDoctor={handleRunDoctor}
              onRefreshGlobalAgents={() => {
                void refreshGlobalAgents();
              }}
              onSaveGlobalAgents={() => {
                void saveGlobalAgents();
              }}
              onRefreshGlobalConfig={() => {
                void refreshGlobalConfig();
              }}
              onSaveGlobalConfig={() => {
                void saveGlobalConfig();
              }}
              onUpdateWorkspaceCodexBin={onUpdateWorkspaceCodexBin}
              onUpdateWorkspaceSettings={onUpdateWorkspaceSettings}
            />
          )}
          {activeSection === "features" && (
            <SettingsFeaturesSection
              appSettings={appSettings}
              hasCodexHomeOverrides={hasCodexHomeOverrides}
              openConfigError={openConfigError}
              onOpenConfig={() => {
                void handleOpenConfig();
              }}
              onUpdateAppSettings={onUpdateAppSettings}
            />
          )}
            </div>
          </div>
        )}
        </div>
    </ModalShell>
  );
}
