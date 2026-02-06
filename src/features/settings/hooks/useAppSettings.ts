import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../../types";
import { getAppSettings, runGeminiDoctor, updateAppSettings } from "../../../services/tauri";
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
import { getDefaultInterruptShortcut } from "../../../utils/shortcuts";

const allowedThemes = new Set(["system", "light", "dark", "dim"]);

const defaultSettings: AppSettings = {
  cliType: "gemini",
  geminiBin: null,
  geminiArgs: null,
  cursorBin: null,
  cursorArgs: null,
  claudeBin: null,
  claudeArgs: null,
  // Cursor CLI defaults
  cursorVimMode: false,
  cursorDefaultMode: "agent",
  cursorOutputFormat: "text",
  cursorAttributeCommits: true,
  cursorAttributePRs: true,
  cursorUseHttp1: false,
  backendMode: "local",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  defaultAccessMode: "current",
  composerModelShortcut: "cmd+shift+m",
  composerAccessShortcut: "cmd+shift+a",
  composerReasoningShortcut: "cmd+shift+r",
  composerCollaborationShortcut: "shift+tab",
  interruptShortcut: getDefaultInterruptShortcut(),
  newAgentShortcut: "cmd+n",
  newWorktreeAgentShortcut: "cmd+shift+n",
  newCloneAgentShortcut: "cmd+alt+n",
  archiveThreadShortcut: "cmd+ctrl+a",
  toggleProjectsSidebarShortcut: "cmd+shift+p",
  toggleGitSidebarShortcut: "cmd+shift+g",
  toggleDebugPanelShortcut: "cmd+shift+d",
  toggleTerminalShortcut: "cmd+shift+t",
  cycleAgentNextShortcut: "cmd+ctrl+down",
  cycleAgentPrevShortcut: "cmd+ctrl+up",
  cycleWorkspaceNextShortcut: "cmd+shift+down",
  cycleWorkspacePrevShortcut: "cmd+shift+up",
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: UI_SCALE_DEFAULT,
  theme: "system",
  usageShowRemaining: false,
  uiFontFamily: DEFAULT_UI_FONT_FAMILY,
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: CODE_FONT_SIZE_DEFAULT,
  notificationSoundsEnabled: true,
  preloadGitDiffs: true,
  experimentalCollabEnabled: false,
  experimentalCollaborationModesEnabled: false,
  experimentalSteerEnabled: false,
  experimentalUnifiedExecEnabled: false,
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
  const allowedCursorModes = new Set(["agent", "plan", "ask", "debug"]);
  const allowedCursorFormats = new Set(["text", "json", "stream-json"]);
  return {
    ...settings,
    cliType: (["gemini", "cursor", "claude"] as const).includes(settings.cliType as "gemini" | "cursor" | "claude") ? settings.cliType : "gemini",
    geminiBin: settings.geminiBin?.trim() ? settings.geminiBin.trim() : null,
    geminiArgs: settings.geminiArgs?.trim() ? settings.geminiArgs.trim() : null,
    cursorBin: settings.cursorBin?.trim() ? settings.cursorBin.trim() : null,
    cursorArgs: settings.cursorArgs?.trim() ? settings.cursorArgs.trim() : null,
    claudeBin: settings.claudeBin?.trim() ? settings.claudeBin.trim() : null,
    claudeArgs: settings.claudeArgs?.trim() ? settings.claudeArgs.trim() : null,
    cursorVimMode: Boolean(settings.cursorVimMode),
    cursorDefaultMode: allowedCursorModes.has(settings.cursorDefaultMode)
      ? settings.cursorDefaultMode
      : "agent",
    cursorOutputFormat: allowedCursorFormats.has(settings.cursorOutputFormat)
      ? settings.cursorOutputFormat
      : "text",
    cursorAttributeCommits: settings.cursorAttributeCommits !== false,
    cursorAttributePRs: settings.cursorAttributePRs !== false,
    cursorUseHttp1: Boolean(settings.cursorUseHttp1),
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
    openAppTargets: normalizedTargets,
    selectedOpenAppId,
  };
}

export function useAppSettings() {
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
  }, []);

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
  }, []);

  const doctor = useCallback(
    async (geminiBin: string | null, geminiArgs: string | null) => {
      return runGeminiDoctor(geminiBin, geminiArgs);
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
