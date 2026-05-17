import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  OpenCodeDoctorResult,
  OpenCodeUpdateResult,
  WorkspaceInfo,
} from "@/types";
import { useGlobalAgentsMd } from "./useGlobalAgentsMd";
import { useGlobalOpenCodeConfigJson } from "./useGlobalOpenCodeConfigJson";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";
import { buildEditorContentMeta } from "@settings/components/settingsViewHelpers";
import { normalizeOpenCodeArgsInput } from "@/utils/opencodeArgsInput";

type UseSettingsOpenCodeSectionArgs = {
  appSettings: AppSettings;
  projects: WorkspaceInfo[];
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onRunDoctor: (
    opencodeBin: string | null,
    opencodeArgs: string | null,
  ) => Promise<OpenCodeDoctorResult>;
  onRunOpenCodeUpdate?: (
    opencodeBin: string | null,
    opencodeArgs: string | null,
  ) => Promise<OpenCodeUpdateResult>;
};

export type SettingsOpenCodeSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ReturnType<typeof useSettingsDefaultModels>["models"];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
  opencodePathDraft: string;
  opencodeArgsDraft: string;
  opencodeDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: OpenCodeDoctorResult | null;
  };
  opencodeUpdateState: {
    status: "idle" | "running" | "done";
    result: OpenCodeUpdateResult | null;
  };
  globalAgentsMeta: string;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  globalConfigMeta: string;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  onSetOpenCodePathDraft: Dispatch<SetStateAction<string>>;
  onSetOpenCodeArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseOpenCode: () => Promise<void>;
  onSaveOpenCodeSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunOpenCodeUpdate: () => Promise<void>;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
};

export const useSettingsOpenCodeSection = ({
  appSettings,
  projects,
  onUpdateAppSettings,
  onRunDoctor,
  onRunOpenCodeUpdate,
}: UseSettingsOpenCodeSectionArgs): SettingsOpenCodeSectionProps => {
  const [opencodePathDraft, setOpenCodePathDraft] = useState(appSettings.opencodeBin ?? "");
  const [opencodeArgsDraft, setOpenCodeArgsDraft] = useState(appSettings.opencodeArgs ?? "");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: OpenCodeDoctorResult | null;
  }>({ status: "idle", result: null });
  const [opencodeUpdateState, setOpenCodeUpdateState] = useState<{
    status: "idle" | "running" | "done";
    result: OpenCodeUpdateResult | null;
  }>({ status: "idle", result: null });

  const {
    models: defaultModels,
    isLoading: defaultModelsLoading,
    error: defaultModelsError,
    connectedWorkspaceCount: defaultModelsConnectedWorkspaceCount,
    refresh: refreshDefaultModels,
  } = useSettingsDefaultModels(projects);

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
  } = useGlobalOpenCodeConfigJson();

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

  useEffect(() => {
    setOpenCodePathDraft(appSettings.opencodeBin ?? "");
  }, [appSettings.opencodeBin]);

  useEffect(() => {
    setOpenCodeArgsDraft(appSettings.opencodeArgs ?? "");
  }, [appSettings.opencodeArgs]);

  const nextOpenCodeBin = opencodePathDraft.trim() ? opencodePathDraft.trim() : null;
  const nextOpenCodeArgs = normalizeOpenCodeArgsInput(opencodeArgsDraft);
  const opencodeDirty =
    nextOpenCodeBin !== (appSettings.opencodeBin ?? null) ||
    nextOpenCodeArgs !== (appSettings.opencodeArgs ?? null);

  const handleBrowseOpenCode = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setOpenCodePathDraft(selection);
  };

  const handleSaveOpenCodeSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        opencodeBin: nextOpenCodeBin,
        opencodeArgs: nextOpenCodeArgs,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(nextOpenCodeBin, nextOpenCodeArgs);
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          opencodeBin: nextOpenCodeBin,
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

  const handleRunOpenCodeUpdate = async () => {
    setOpenCodeUpdateState({ status: "running", result: null });
    try {
      if (!onRunOpenCodeUpdate) {
        setOpenCodeUpdateState({
          status: "done",
          result: {
            ok: false,
            method: "unknown",
            package: null,
            beforeVersion: null,
            afterVersion: null,
            upgraded: false,
            output: null,
            details: "OpenCode updates are not available in this build.",
          },
        });
        return;
      }

      const result = await onRunOpenCodeUpdate(nextOpenCodeBin, nextOpenCodeArgs);
      setOpenCodeUpdateState({ status: "done", result });
    } catch (error) {
      setOpenCodeUpdateState({
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

  return {
    appSettings,
    onUpdateAppSettings,
    defaultModels,
    defaultModelsLoading,
    defaultModelsError,
    defaultModelsConnectedWorkspaceCount,
    onRefreshDefaultModels: () => {
      void refreshDefaultModels();
    },
    opencodePathDraft,
    opencodeArgsDraft,
    opencodeDirty,
    isSavingSettings,
    doctorState,
    opencodeUpdateState,
    globalAgentsMeta: globalAgentsEditorMeta.meta,
    globalAgentsError,
    globalAgentsContent,
    globalAgentsLoading,
    globalAgentsRefreshDisabled: globalAgentsEditorMeta.refreshDisabled,
    globalAgentsSaveDisabled: globalAgentsEditorMeta.saveDisabled,
    globalAgentsSaveLabel: globalAgentsEditorMeta.saveLabel,
    globalConfigMeta: globalConfigEditorMeta.meta,
    globalConfigError,
    globalConfigContent,
    globalConfigLoading,
    globalConfigRefreshDisabled: globalConfigEditorMeta.refreshDisabled,
    globalConfigSaveDisabled: globalConfigEditorMeta.saveDisabled,
    globalConfigSaveLabel: globalConfigEditorMeta.saveLabel,
    onSetOpenCodePathDraft: setOpenCodePathDraft,
    onSetOpenCodeArgsDraft: setOpenCodeArgsDraft,
    onSetGlobalAgentsContent: setGlobalAgentsContent,
    onSetGlobalConfigContent: setGlobalConfigContent,
    onBrowseOpenCode: handleBrowseOpenCode,
    onSaveOpenCodeSettings: handleSaveOpenCodeSettings,
    onRunDoctor: handleRunDoctor,
    onRunOpenCodeUpdate: handleRunOpenCodeUpdate,
    onRefreshGlobalAgents: () => {
      void refreshGlobalAgents();
    },
    onSaveGlobalAgents: () => {
      void saveGlobalAgents();
    },
    onRefreshGlobalConfig: () => {
      void refreshGlobalConfig();
    },
    onSaveGlobalConfig: () => {
      void saveGlobalConfig();
    },
  };
};
