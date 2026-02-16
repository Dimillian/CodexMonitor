import { useMemo } from "react";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  DictationModelStatus,
  WorkspaceGroup,
  WorkspaceSettings,
} from "@/types";
import { isMacPlatform, isWindowsPlatform } from "@utils/platformPaths";
import { useSettingsOpenAppDrafts } from "./useSettingsOpenAppDrafts";
import { useSettingsShortcutDrafts } from "./useSettingsShortcutDrafts";
import { useSettingsCodexSection } from "./useSettingsCodexSection";
import { useSettingsDisplaySection } from "./useSettingsDisplaySection";
import { useSettingsEnvironmentsSection } from "./useSettingsEnvironmentsSection";
import { useSettingsFeaturesSection } from "./useSettingsFeaturesSection";
import { useSettingsGitSection } from "./useSettingsGitSection";
import { useSettingsProjectsSection } from "./useSettingsProjectsSection";
import { useSettingsServerSection } from "./useSettingsServerSection";
import type { GroupedWorkspaces } from "./settingsSectionTypes";
import {
  COMPOSER_PRESET_CONFIGS,
  COMPOSER_PRESET_LABELS,
  DICTATION_MODELS,
} from "@settings/components/settingsViewConstants";

type UseSettingsViewOrchestrationArgs = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaces;
  ungroupedLabel: string;
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
  dictationModelStatus?: DictationModelStatus | null;
  onDownloadDictationModel?: () => void;
  onCancelDictationDownload?: () => void;
  onRemoveDictationModel?: () => void;
};

export function useSettingsViewOrchestration({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
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
  onMoveWorkspace,
  onDeleteWorkspace,
  onCreateWorkspaceGroup,
  onRenameWorkspaceGroup,
  onMoveWorkspaceGroup,
  onDeleteWorkspaceGroup,
  onAssignWorkspaceGroup,
  dictationModelStatus,
  onDownloadDictationModel,
  onCancelDictationDownload,
  onRemoveDictationModel,
}: UseSettingsViewOrchestrationArgs) {
  const projects = useMemo(
    () => groupedWorkspaces.flatMap((group) => group.workspaces),
    [groupedWorkspaces],
  );
  const mainWorkspaces = useMemo(
    () => projects.filter((workspace) => (workspace.kind ?? "main") !== "worktree"),
    [projects],
  );
  const hasCodexHomeOverrides = useMemo(
    () => projects.some((workspace) => workspace.settings.codexHome != null),
    [projects],
  );
  const featureWorkspaceId = useMemo(
    () => projects.find((workspace) => workspace.connected)?.id ?? null,
    [projects],
  );

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

  const dictationReady = dictationModelStatus?.state === "ready";

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

  const { shortcutDrafts, handleShortcutKeyDown, clearShortcut } =
    useSettingsShortcutDrafts({
      appSettings,
      onUpdateAppSettings,
    });

  const projectsSectionProps = useSettingsProjectsSection({
    appSettings,
    workspaceGroups,
    groupedWorkspaces,
    ungroupedLabel,
    projects,
    onUpdateAppSettings,
    onMoveWorkspace,
    onDeleteWorkspace,
    onCreateWorkspaceGroup,
    onRenameWorkspaceGroup,
    onMoveWorkspaceGroup,
    onDeleteWorkspaceGroup,
    onAssignWorkspaceGroup,
  });

  const environmentsSectionProps = useSettingsEnvironmentsSection({
    mainWorkspaces,
    onUpdateWorkspaceSettings,
  });

  const displaySectionProps = useSettingsDisplaySection({
    appSettings,
    reduceTransparency,
    onToggleTransparency,
    onUpdateAppSettings,
    scaleShortcutTitle,
    scaleShortcutText,
    onTestNotificationSound,
    onTestSystemNotification,
  });

  const gitSectionProps = useSettingsGitSection({
    appSettings,
    onUpdateAppSettings,
  });

  const serverSectionProps = useSettingsServerSection({
    appSettings,
    onUpdateAppSettings,
    onMobileConnectSuccess,
  });

  const codexSectionProps = useSettingsCodexSection({
    appSettings,
    projects,
    onUpdateAppSettings,
    onRunDoctor,
    onRunCodexUpdate,
    onUpdateWorkspaceCodexBin,
    onUpdateWorkspaceSettings,
  });

  const featuresSectionProps = useSettingsFeaturesSection({
    appSettings,
    featureWorkspaceId,
    hasCodexHomeOverrides,
    onUpdateAppSettings,
  });

  return {
    projectsSectionProps,
    environmentsSectionProps,
    displaySectionProps,
    composerSectionProps: {
      appSettings,
      optionKeyLabel,
      composerPresetLabels: COMPOSER_PRESET_LABELS,
      onComposerPresetChange: (
        preset: AppSettings["composerEditorPreset"],
      ) => {
        const config = COMPOSER_PRESET_CONFIGS[preset];
        void onUpdateAppSettings({
          ...appSettings,
          composerEditorPreset: preset,
          ...config,
        });
      },
      onUpdateAppSettings,
    },
    dictationSectionProps: {
      appSettings,
      optionKeyLabel,
      metaKeyLabel,
      dictationModels: DICTATION_MODELS,
      selectedDictationModel,
      dictationModelStatus,
      dictationReady,
      onUpdateAppSettings,
      onDownloadDictationModel,
      onCancelDictationDownload,
      onRemoveDictationModel,
    },
    shortcutsSectionProps: {
      shortcutDrafts,
      onShortcutKeyDown: handleShortcutKeyDown,
      onClearShortcut: clearShortcut,
    },
    openAppsSectionProps: {
      openAppDrafts,
      openAppSelectedId,
      openAppIconById,
      onOpenAppDraftChange: handleOpenAppDraftChange,
      onOpenAppKindChange: handleOpenAppKindChange,
      onCommitOpenApps: handleCommitOpenAppsDrafts,
      onMoveOpenApp: handleMoveOpenApp,
      onDeleteOpenApp: handleDeleteOpenApp,
      onAddOpenApp: handleAddOpenApp,
      onSelectOpenAppDefault: handleSelectOpenAppDefault,
    },
    gitSectionProps,
    serverSectionProps,
    codexSectionProps,
    featuresSectionProps,
  };
}

export type SettingsViewOrchestration = ReturnType<typeof useSettingsViewOrchestration>;
