import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "../../../types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "../../../services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "../../../utils/uiScale";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
  OPEN_APP_STORAGE_KEY,
} from "../../app/constants";
import { normalizeOpenAppTargets } from "../../app/utils/openApp";
import { getDefaultInterruptShortcut, isMacPlatform } from "../../../utils/shortcuts";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "../../../utils/commitMessagePrompt";

const allowedThemes = new Set(["system", "light", "dark", "dim"]);
const allowedPersonality = new Set(["friendly", "pragmatic"]);

function buildDefaultSettings(): AppSettings {
  const isMac = isMacPlatform();
  const isMobile = isMobilePlatform();
  return {
    codexBin: null,
    codexArgs: null,
    backendMode: isMobile ? "remote" : "local",
    remoteBackendProvider: "tcp",
    remoteBackendHost: "127.0.0.1:4732",
    remoteBackendToken: null,
    orbitWsUrl: null,
    orbitAuthUrl: null,
    orbitRunnerName: null,
    orbitAutoStartRunner: false,
    keepDaemonRunningAfterAppClose: false,
    orbitUseAccess: false,
    orbitAccessClientId: null,
    orbitAccessClientSecretRef: null,
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
    threadTitleAutogenerationEnabled: false,
    uiFontFamily: DEFAULT_UI_FONT_FAMILY,
    codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
    codeFontSize: CODE_FONT_SIZE_DEFAULT,
    notificationSoundsEnabled: true,
    systemNotificationsEnabled: true,
    preloadGitDiffs: true,
    gitDiffIgnoreWhitespaceChanges: false,
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
    experimentalCollabEnabled: false,
    collaborationModesEnabled: true,
    steerEnabled: true,
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
  return {
    ...settings,
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
