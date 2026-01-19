import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, ModelOption, WorkspaceInfo } from "../../../types";
import { getModelList } from "../../../services/tauri";

type UseModelsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  preferredModelId?: string | null;
  preferredEffort?: string | null;
};

const pickDefaultModel = (models: ModelOption[]) =>
  models.find((model) => model.model === "gpt-5.2-codex") ??
  models.find((model) => model.isDefault) ??
  models[0] ??
  null;

export function useModels({
  activeWorkspace,
  onDebug,
  preferredModelId = null,
  preferredEffort = null,
}: UseModelsOptions) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffortState] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const hasUserSelectedModel = useRef(false);
  const hasUserSelectedEffort = useRef(false);
  const lastWorkspaceId = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  useEffect(() => {
    if (workspaceId === lastWorkspaceId.current) {
      return;
    }
    hasUserSelectedModel.current = false;
    hasUserSelectedEffort.current = false;
    lastWorkspaceId.current = workspaceId;
  }, [workspaceId]);

  const setSelectedModelId = useCallback((next: string | null) => {
    hasUserSelectedModel.current = true;
    setSelectedModelIdState(next);
  }, []);

  const setSelectedEffort = useCallback((next: string | null) => {
    hasUserSelectedEffort.current = true;
    setSelectedEffortState(next);
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const reasoningOptions = useMemo(() => {
    if (!selectedModel) {
      return [];
    }
    return selectedModel.supportedReasoningEfforts.map(
      (effort) => effort.reasoningEffort,
    );
  }, [selectedModel]);

  const resolveEffort = useCallback(
    (model: ModelOption, preferCurrent: boolean) => {
      const supportedEfforts = model.supportedReasoningEfforts.map(
        (effort) => effort.reasoningEffort,
      );
      if (
        preferCurrent &&
        selectedEffort &&
        supportedEfforts.includes(selectedEffort)
      ) {
        return selectedEffort;
      }
      if (preferredEffort && supportedEfforts.includes(preferredEffort)) {
        return preferredEffort;
      }
      return model.defaultReasoningEffort ?? null;
    },
    [preferredEffort, selectedEffort],
  );

  const refreshModels = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-model-list`,
      timestamp: Date.now(),
      source: "client",
      label: "model/list",
      payload: { workspaceId },
    });
    try {
      const response = await getModelList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-model-list`,
        timestamp: Date.now(),
        source: "server",
        label: "model/list response",
        payload: response,
      });
      const rawData = response.result?.data ?? response.data ?? [];
      const data: ModelOption[] = rawData.map((item: any) => ({
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
        defaultReasoningEffort: String(
          item.defaultReasoningEffort ?? item.default_reasoning_effort ?? "",
        ),
        isDefault: Boolean(item.isDefault ?? item.is_default ?? false),
      }));
      setModels(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const defaultModel = pickDefaultModel(data);
      const existingSelection = data.find((model) => model.id === selectedModelId) ?? null;
      if (selectedModelId && !existingSelection) {
        hasUserSelectedModel.current = false;
      }
      const preferredSelection = preferredModelId
        ? data.find((model) => model.id === preferredModelId) ?? null
        : null;
      const shouldKeepExisting =
        hasUserSelectedModel.current && existingSelection !== null;
      const nextSelection =
        (shouldKeepExisting ? existingSelection : null) ??
        preferredSelection ??
        defaultModel ??
        existingSelection;
      if (nextSelection) {
        if (nextSelection.id !== selectedModelId) {
          setSelectedModelIdState(nextSelection.id);
        }
        const nextEffort = resolveEffort(
          nextSelection,
          hasUserSelectedEffort.current,
        );
        if (nextEffort !== selectedEffort) {
          setSelectedEffortState(nextEffort);
        }
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-model-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "model/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [
    isConnected,
    onDebug,
    preferredModelId,
    selectedEffort,
    selectedModelId,
    resolveEffort,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && models.length > 0) {
      return;
    }
    refreshModels();
  }, [isConnected, models.length, refreshModels, workspaceId]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    if (
      selectedEffort &&
      selectedModel.supportedReasoningEfforts.some(
        (effort) => effort.reasoningEffort === selectedEffort,
      )
    ) {
      return;
    }
    hasUserSelectedEffort.current = false;
    setSelectedEffortState(selectedModel.defaultReasoningEffort ?? null);
  }, [selectedEffort, selectedModel]);

  useEffect(() => {
    if (!models.length) {
      return;
    }
    const preferredSelection = preferredModelId
      ? models.find((model) => model.id === preferredModelId) ?? null
      : null;
    const defaultModel = pickDefaultModel(models);
    const existingSelection = selectedModelId
      ? models.find((model) => model.id === selectedModelId) ?? null
      : null;
    if (selectedModelId && !existingSelection) {
      hasUserSelectedModel.current = false;
    }
    const shouldKeepUserSelection =
      hasUserSelectedModel.current && existingSelection !== null;
    if (shouldKeepUserSelection) {
      return;
    }
    const nextSelection =
      preferredSelection ?? defaultModel ?? existingSelection ?? null;
    if (!nextSelection) {
      return;
    }
    if (nextSelection.id !== selectedModelId) {
      setSelectedModelIdState(nextSelection.id);
    }
    const nextEffort = resolveEffort(nextSelection, hasUserSelectedEffort.current);
    if (nextEffort !== selectedEffort) {
      setSelectedEffortState(nextEffort);
    }
  }, [models, preferredModelId, selectedEffort, selectedModelId, resolveEffort]);

  return {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    refreshModels,
  };
}
