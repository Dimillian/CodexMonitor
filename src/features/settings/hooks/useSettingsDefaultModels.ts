import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/tauri";

const CONFIG_MODEL_DESCRIPTION = "Configured in CODEX_HOME/config.toml";

type SettingsDefaultModelsState = {
  models: ModelOption[];
  configModel: string | null;
  isLoading: boolean;
  error: string | null;
};

const EMPTY_STATE: SettingsDefaultModelsState = {
  models: [],
  configModel: null,
  isLoading: false,
  error: null,
};

const normalizeEffort = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function parseModelListResponse(
  response: unknown,
  configModel: string | null,
): ModelOption[] {
  const rawData = (() => {
    if (!response || typeof response !== "object") {
      return [];
    }
    const record = response as Record<string, unknown>;
    const result = record.result as Record<string, unknown> | undefined;
    const nestedData = result?.data;
    if (Array.isArray(nestedData)) {
      return nestedData;
    }
    const topData = record.data;
    return Array.isArray(topData) ? topData : [];
  })();

  const dataFromServer: ModelOption[] = rawData.map((item: any) => ({
    id: String(item.id ?? item.model ?? ""),
    model: String(item.model ?? item.id ?? ""),
    displayName: String(item.displayName ?? item.display_name ?? item.model ?? ""),
    description: String(item.description ?? ""),
    supportedReasoningEfforts: Array.isArray(item.supportedReasoningEfforts)
      ? item.supportedReasoningEfforts
      : Array.isArray(item.supported_reasoning_efforts)
        ? item.supported_reasoning_efforts.map((effort: any) => ({
            reasoningEffort: String(
              effort.reasoningEffort ?? effort.reasoning_effort ?? "",
            ),
            description: String(effort.description ?? ""),
          }))
        : [],
    defaultReasoningEffort: normalizeEffort(
      item.defaultReasoningEffort ?? item.default_reasoning_effort,
    ),
    isDefault: Boolean(item.isDefault ?? item.is_default ?? false),
  }));

  if (!configModel) {
    return dataFromServer;
  }
  const hasConfigModel = dataFromServer.some((model) => model.model === configModel);
  if (hasConfigModel) {
    return dataFromServer;
  }
  const configOption: ModelOption = {
    id: configModel,
    model: configModel,
    displayName: `${configModel} (config)`,
    description: CONFIG_MODEL_DESCRIPTION,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  };
  return [configOption, ...dataFromServer];
}

export function useSettingsDefaultModels(projects: WorkspaceInfo[]) {
  const [state, setState] = useState<SettingsDefaultModelsState>(EMPTY_STATE);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);

  const sourceWorkspace = useMemo(() => {
    return projects.find((workspace) => workspace.connected) ?? null;
  }, [projects]);

  const refresh = useCallback(async () => {
    if (!sourceWorkspace) {
      setState(EMPTY_STATE);
      return;
    }
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [modelListResult, configModelResult] = await Promise.allSettled([
        getModelList(sourceWorkspace.id),
        getConfigModel(sourceWorkspace.id),
      ]);

      const configModel =
        configModelResult.status === "fulfilled" ? configModelResult.value : null;

      if (modelListResult.status === "rejected") {
        const message =
          modelListResult.reason instanceof Error
            ? modelListResult.reason.message
            : String(modelListResult.reason);
        if (requestId === requestIdRef.current) {
          setState({
            models: [],
            configModel,
            isLoading: false,
            error: message,
          });
        }
        return;
      }

      const models = parseModelListResponse(modelListResult.value, configModel);
      if (requestId === requestIdRef.current) {
        setState({
          models,
          configModel,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestId === requestIdRef.current) {
        setState({
          models: [],
          configModel: null,
          isLoading: false,
          error: message,
        });
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [sourceWorkspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    sourceWorkspace,
    refresh,
  };
}

