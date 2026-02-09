import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import X from "lucide-react/dist/esm/icons/x";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  DictationModelStatus,
  TcpDaemonStatus,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  WorkspaceSettings,
  WorkspaceGroup,
  WorkspaceInfo,
} from "../../../types";
import {
  getCodexConfigPath,
  listWorkspaces,
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
import { clampUiScale } from "../../../utils/uiScale";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import { useGlobalAgentsMd } from "../hooks/useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "../hooks/useGlobalCodexConfigToml";
import { useSettingsOpenAppDrafts } from "../hooks/useSettingsOpenAppDrafts";
import { useSettingsShortcutDrafts } from "../hooks/useSettingsShortcutDrafts";
import { useSettingsViewCloseShortcuts } from "../hooks/useSettingsViewCloseShortcuts";
import { useSettingsViewNavigation } from "../hooks/useSettingsViewNavigation";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { SettingsNav } from "./SettingsNav";
import type { CodexSection, OrbitServiceClient } from "./settingsTypes";
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
import {
  COMPOSER_PRESET_CONFIGS,
  COMPOSER_PRESET_LABELS,
  DEFAULT_REMOTE_HOST,
  DICTATION_MODELS,
  ORBIT_DEFAULT_POLL_INTERVAL_SECONDS,
  ORBIT_MAX_INLINE_POLL_SECONDS,
  ORBIT_SERVICES,
  SETTINGS_SECTION_LABELS,
} from "./settingsViewConstants";
import {
  buildEditorContentMeta,
  buildWorkspaceOverrideDrafts,
  delay,
  getOrbitStatusText,
  normalizeOverrideValue,
  normalizeWorktreeSetupScript,
  type OrbitActionResult,
} from "./settingsViewHelpers";

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
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
  onRunCodexUpdate?: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexUpdateResult>;
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
  onRunCodexUpdate,
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
  orbitServiceClient = ORBIT_SERVICES,
}: SettingsViewProps) {
  const {
    activeSection,
    showMobileDetail,
    setShowMobileDetail,
    useMobileMasterDetail,
    handleSelectSection,
  } = useSettingsViewNavigation({ initialSection });
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
  const {
    openAppDrafts,
    openAppSelectedId,
    handleOpenAppDraftChange,
    handleOpenAppKindChange,
    handleCommitOpenAppsDrafts,
    handleMoveOpenApp,
    handleDeleteOpenApp,
    handleAddOpenApp,
    handleSelectOpenAppDefault,
  } = useSettingsOpenAppDrafts({
    appSettings,
    onUpdateAppSettings,
  });
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });

  const [codexUpdateState, setCodexUpdateState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
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
  const { shortcutDrafts, handleShortcutKeyDown, clearShortcut } =
    useSettingsShortcutDrafts({
      appSettings,
      onUpdateAppSettings,
    });
  const latestSettingsRef = useRef(appSettings);
  const dictationReady = dictationModelStatus?.state === "ready";
  const globalAgentsEditorMeta = buildEditorContentMeta({
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isDirty: globalAgentsDirty,
  });
  const globalConfigEditorMeta = buildEditorContentMeta({
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isDirty: globalConfigDirty,
  });
  const globalAgentsMeta = globalAgentsEditorMeta.meta;
  const globalAgentsSaveLabel = globalAgentsEditorMeta.saveLabel;
  const globalAgentsSaveDisabled = globalAgentsEditorMeta.saveDisabled;
  const globalAgentsRefreshDisabled = globalAgentsEditorMeta.refreshDisabled;
  const globalConfigMeta = globalConfigEditorMeta.meta;
  const globalConfigSaveLabel = globalConfigEditorMeta.saveLabel;
  const globalConfigSaveDisabled = globalConfigEditorMeta.saveDisabled;
  const globalConfigRefreshDisabled = globalConfigEditorMeta.refreshDisabled;
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

  useSettingsViewCloseShortcuts(onClose);

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
    const nextHost = rawValue.trim() || DEFAULT_REMOTE_HOST;
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
          const nextHost = remoteHostDraft.trim() || DEFAULT_REMOTE_HOST;
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
          formatErrorMessage(error, "Unable to load Tailscale status."),
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
          formatErrorMessage(error, "Unable to build Tailscale daemon command."),
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

  const handleComposerPresetChange = (
    preset: AppSettings["composerEditorPreset"],
  ) => {
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

  const handleRunCodexUpdate = async () => {
    setCodexUpdateState({ status: "running", result: null });
    try {
      if (!onRunCodexUpdate) {
        setCodexUpdateState({
          status: "done",
          result: {
            ok: false,
            method: "unknown",
            package: null,
            beforeVersion: null,
            afterVersion: null,
            upgraded: false,
            output: null,
            details: "Codex updates are not available in this build.",
          },
        });
        return;
      }

      const result = await onRunCodexUpdate(nextCodexBin, nextCodexArgs);
      setCodexUpdateState({ status: "done", result });
    } catch (error) {
      setCodexUpdateState({
        status: "done",
        result: {
          ok: false,
          method: "unknown",
          package: null,
          beforeVersion: null,
          afterVersion: null,
          upgraded: false,
          output: null,
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
              onClearShortcut={clearShortcut}
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
              codexUpdateState={codexUpdateState}
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
              onRunCodexUpdate={handleRunCodexUpdate}
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
