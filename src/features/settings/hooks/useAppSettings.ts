import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "@/types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "@services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "@utils/uiScale";
import { CHAT_SCROLLBACK_DEFAULT, normalizeChatHistoryScrollbackItems } from "@utils/chatScrollback";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  clampCodeFontSize,
  normalizeFontFamily,
} from "@utils/fonts";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
  OPEN_APP_STORAGE_KEY,
} from "@app/constants";
import { normalizeOpenAppTargets } from "@app/utils/openApp";
import { getDefaultInterruptShortcut, isMacPlatform } from "@utils/shortcuts";
import { isMobilePlatform } from "@utils/platformPaths";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "@utils/commitMessagePrompt";

const allowedThemes = new Set(["system", "light", "dark", "dim"]);
const allowedPersonality = new Set(["friendly", "pragmatic"]);
const DEFAULT_REMOTE_BACKEND_HOST = "127.0.0.1:4732";
const DEFAULT_REMOTE_BACKEND_ID = "remote-default";
const DEFAULT_REMOTE_BACKEND_NAME = "Primary remote";
const DEFAULT_REMOTE_PROVIDER: AppSettings["remoteBackendProvider"] = "tcp";

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

function normalizeRemoteProvider(value: unknown): AppSettings["remoteBackendProvider"] {
  void value;
  return "tcp";
}

function normalizeRemoteToken(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function normalizeRemoteHost(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : DEFAULT_REMOTE_BACKEND_HOST;
}

function normalizeRemoteName(value: string | null | undefined, fallback: string): string {
  return value?.trim() ? value.trim() : fallback;
}

function normalizeRemoteBackends(settings: AppSettings): {
  remoteBackends: RemoteBackendTarget[];
  activeRemoteBackendId: string | null;
  remoteBackendProvider: AppSettings["remoteBackendProvider"];
  remoteBackendHost: string;
  remoteBackendToken: string | null;
} {
  const legacyProvider = normalizeRemoteProvider(settings.remoteBackendProvider);
  const legacyHost = normalizeRemoteHost(settings.remoteBackendHost);
  const legacyToken = normalizeRemoteToken(settings.remoteBackendToken);
  const usedIds = new Set<string>();

  const normalized = (settings.remoteBackends ?? []).map((entry, index) => {
    const baseId = entry.id?.trim() || `remote-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      name: normalizeRemoteName(entry.name, `Remote ${index + 1}`),
      provider: normalizeRemoteProvider(entry.provider),
      host: normalizeRemoteHost(entry.host),
      token: normalizeRemoteToken(entry.token),
      lastConnectedAtMs:
        typeof entry.lastConnectedAtMs === "number" && Number.isFinite(entry.lastConnectedAtMs)
          ? entry.lastConnectedAtMs
          : null,
    };
  });

  if (normalized.length === 0) {
    const fallback: RemoteBackendTarget = {
      id: DEFAULT_REMOTE_BACKEND_ID,
      name: DEFAULT_REMOTE_BACKEND_NAME,
      provider: legacyProvider,
      host: legacyHost,
      token: legacyToken,
      lastConnectedAtMs: null,
    };
    return {
      remoteBackends: [fallback],
      activeRemoteBackendId: fallback.id,
      remoteBackendProvider: fallback.provider,
      remoteBackendHost: fallback.host,
      remoteBackendToken: fallback.token,
    };
  }

  const activeIndexById =
    settings.activeRemoteBackendId == null
      ? -1
      : normalized.findIndex((entry) => entry.id === settings.activeRemoteBackendId);
  const activeIndex = activeIndexById >= 0 ? activeIndexById : 0;
  const active = normalized[activeIndex];
  const syncedActive = {
    ...active,
    provider: legacyProvider,
    host: legacyHost,
    token: legacyToken,
  };
  const remoteBackends = [...normalized];
  remoteBackends[activeIndex] = syncedActive;
  return {
    remoteBackends,
    activeRemoteBackendId: syncedActive.id,
    remoteBackendProvider: syncedActive.provider,
    remoteBackendHost: syncedActive.host,
    remoteBackendToken: syncedActive.token,
  };
}

function buildDefaultSettings(): AppSettings {
  const isMac = isMacPlatform();
  const isMobile = isMobilePlatform();
  const defaultRemote: RemoteBackendTarget = {
    id: DEFAULT_REMOTE_BACKEND_ID,
    name: DEFAULT_REMOTE_BACKEND_NAME,
    provider: DEFAULT_REMOTE_PROVIDER,
    host: DEFAULT_REMOTE_BACKEND_HOST,
    token: null,
    lastConnectedAtMs: null,
  };
  return {
    codexBin: null,
    codexArgs: null,
    backendMode: isMobile ? "remote" : "local",
    remoteBackendProvider: defaultRemote.provider,
    remoteBackendHost: defaultRemote.host,
    remoteBackendToken: null,
    remoteBackends: [defaultRemote],
    activeRemoteBackendId: defaultRemote.id,
    keepDaemonRunningAfterAppClose: false,
    defaultAccessMode: "current",
    reviewDeliveryMode: "inline",
    composerModelShortcut: isMac ? "cmd+shift+m" : "ctrl+shift+m",
    composerAccessShortcut: isMac ? "cmd+shift+a" : "ctrl+shift+a",
    composerReasoningShortcut: isMac ? "cmd+shift+r" : "ctrl+shift+r",
    composerCollaborationShortcut: "shift+tab",
    interruptShortcut: getDefaultInterruptShortcut(),
    newAgentShortcut: isMac ? "cmd+n" : "ctrl+n",
    newWorktreeAgentShortcut: isMac ? "cmd+shift+n" : "ctrl+shift+n",
    newCloneAgentShortcut: isMac ? "cmd+alt+n" : "ctrl+alt+n",
    archiveThreadShortcut: isMac ? "cmd+ctrl+a" : "ctrl+alt+a",
    toggleProjectsSidebarShortcut: isMac ? "cmd+shift+p" : "ctrl+shift+p",
    toggleGitSidebarShortcut: isMac ? "cmd+shift+g" : "ctrl+shift+g",
    branchSwitcherShortcut: isMac ? "cmd+b" : "ctrl+b",
    toggleDebugPanelShortcut: isMac ? "cmd+shift+d" : "ctrl+shift+d",
    toggleTerminalShortcut: isMac ? "cmd+shift+t" : "ctrl+shift+t",
    cycleAgentNextShortcut: isMac ? "cmd+ctrl+down" : "ctrl+alt+down",
    cycleAgentPrevShortcut: isMac ? "cmd+ctrl+up" : "ctrl+alt+up",
    cycleWorkspaceNextShortcut: isMac ? "cmd+shift+down" : "ctrl+alt+shift+down",
    cycleWorkspacePrevShortcut: isMac ? "cmd+shift+up" : "ctrl+alt+shift+up",
    lastComposerModelId: null,
    lastComposerReasoningEffort: null,
    uiScale: UI_SCALE_DEFAULT,
    theme: "system",
    usageShowRemaining: false,
    showMessageFilePath: true,
    chatHistoryScrollbackItems: CHAT_SCROLLBACK_DEFAULT,
    threadTitleAutogenerationEnabled: false,
    uiFontFamily: DEFAULT_UI_FONT_FAMILY,
    codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
    codeFontSize: CODE_FONT_SIZE_DEFAULT,
    notificationSoundsEnabled: true,
    systemNotificationsEnabled: true,
    subagentSystemNotificationsEnabled: true,
    splitChatDiffView: false,
    preloadGitDiffs: true,
    gitDiffIgnoreWhitespaceChanges: false,
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
    experimentalCollabEnabled: false,
    collaborationModesEnabled: true,
    steerEnabled: true,
    pauseQueuedMessagesWhenResponseRequired: true,
    unifiedExecEnabled: true,
    experimentalAppsEnabled: false,
    personality: "friendly",
    dictationEnabled: false,
    dictationModelId: "base",
    dictationPreferredLanguage: null,
    dictationHoldKey: "alt",
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
    openAppTargets: DEFAULT_OPEN_APP_TARGETS,
    selectedOpenAppId: DEFAULT_OPEN_APP_ID,
  };
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const remoteBackendSettings = normalizeRemoteBackends(settings);
  const normalizedTargets =
    settings.openAppTargets && settings.openAppTargets.length
      ? normalizeOpenAppTargets(settings.openAppTargets)
      : DEFAULT_OPEN_APP_TARGETS;
  const storedOpenAppId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(OPEN_APP_STORAGE_KEY);
  const hasPersistedSelection = normalizedTargets.some(
    (target) => target.id === settings.selectedOpenAppId,
  );
  const hasStoredSelection =
    !hasPersistedSelection &&
    storedOpenAppId !== null &&
    normalizedTargets.some((target) => target.id === storedOpenAppId);
  const selectedOpenAppId = hasPersistedSelection
    ? settings.selectedOpenAppId
    : hasStoredSelection
      ? storedOpenAppId
      : normalizedTargets[0]?.id ?? DEFAULT_OPEN_APP_ID;
  const commitMessagePrompt =
    settings.commitMessagePrompt && settings.commitMessagePrompt.trim().length > 0
      ? settings.commitMessagePrompt
      : DEFAULT_COMMIT_MESSAGE_PROMPT;
  const chatHistoryScrollbackItems = normalizeChatHistoryScrollbackItems(
    settings.chatHistoryScrollbackItems,
  );
  return {
    ...settings,
    ...remoteBackendSettings,
    codexBin: settings.codexBin?.trim() ? settings.codexBin.trim() : null,
    codexArgs: settings.codexArgs?.trim() ? settings.codexArgs.trim() : null,
    uiScale: clampUiScale(settings.uiScale),
    theme: allowedThemes.has(settings.theme) ? settings.theme : "system",
    uiFontFamily: normalizeFontFamily(
      settings.uiFontFamily,
      DEFAULT_UI_FONT_FAMILY,
    ),
    codeFontFamily: normalizeFontFamily(
      settings.codeFontFamily,
      DEFAULT_CODE_FONT_FAMILY,
    ),
    codeFontSize: clampCodeFontSize(settings.codeFontSize),
    personality: allowedPersonality.has(settings.personality)
      ? settings.personality
      : "friendly",
    reviewDeliveryMode:
      settings.reviewDeliveryMode === "detached" ? "detached" : "inline",
    chatHistoryScrollbackItems,
    commitMessagePrompt,
    openAppTargets: normalizedTargets,
    selectedOpenAppId,
  };
}

export function useAppSettings() {
  const defaultSettings = useMemo(() => buildDefaultSettings(), []);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await getAppSettings();
        if (active) {
          setSettings(
            normalizeAppSettings({
              ...defaultSettings,
              ...response,
            }),
          );
        }
      } catch {
        // Defaults stay in place if loading settings fails.
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [defaultSettings]);

  const saveSettings = useCallback(async (next: AppSettings) => {
    const normalized = normalizeAppSettings(next);
    const saved = await updateAppSettings(normalized);
    setSettings(
      normalizeAppSettings({
        ...defaultSettings,
        ...saved,
      }),
    );
    return saved;
  }, [defaultSettings]);

  const doctor = useCallback(
    async (codexBin: string | null, codexArgs: string | null) => {
      return runCodexDoctor(codexBin, codexArgs);
    },
    [],
  );

  return {
    settings,
    setSettings,
    saveSettings,
    doctor,
    isLoading,
  };
}
