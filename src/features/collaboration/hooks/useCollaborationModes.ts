import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollaborationModeOption,
  DebugEntry,
  WorkspaceInfo,
} from "../../../types";
import { getCollaborationModes } from "../../../services/tauri";

type UseCollaborationModesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useCollaborationModes({
  activeWorkspace,
  enabled,
  onDebug,
}: UseCollaborationModesOptions) {
  const [modes, setModes] = useState<CollaborationModeOption[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const previousWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const selectedModeIdRef = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const extractModeList = useCallback((response: any): any[] => {
    const candidates = [
      response?.result?.data,
      response?.result?.modes,
      response?.result,
      response?.data,
      response?.modes,
      response,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
      if (candidate && typeof candidate === "object") {
        const nested = (candidate as any).data ?? (candidate as any).modes;
        if (Array.isArray(nested)) {
          return nested;
        }
        if (nested && typeof nested === "object") {
          const deep = (nested as any).data ?? (nested as any).modes;
          if (Array.isArray(deep)) {
            return deep;
          }
        }
      }
    }
    return [];
  }, []);

  const selectedMode = useMemo(
    () => modes.find((mode) => mode.id === selectedModeId) ?? null,
    [modes, selectedModeId],
  );

  const refreshModes = useCallback(async () => {
    if (!workspaceId || !isConnected || !enabled) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-collaboration-mode-list`,
      timestamp: Date.now(),
      source: "client",
      label: "collaborationMode/list",
      payload: { workspaceId },
    });
    try {
      const response = await getCollaborationModes(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-collaboration-mode-list`,
        timestamp: Date.now(),
        source: "server",
        label: "collaborationMode/list response",
        payload: response,
      });
      const rawData = extractModeList(response);
      const data: CollaborationModeOption[] = rawData
        .map((item: any) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const modeId = String(item.mode ?? item.name ?? "").trim();
          if (!modeId) {
            return null;
          }

          const settings =
            item.settings && typeof item.settings === "object"
              ? item.settings
              : {
                  model: item.model ?? null,
                  reasoning_effort:
                    item.reasoning_effort ?? item.reasoningEffort ?? null,
                  developer_instructions:
                    item.developer_instructions ??
                    item.developerInstructions ??
                    null,
                };

          const model = String(settings.model ?? "");
          const reasoningEffort = settings.reasoning_effort ?? null;
          const developerInstructions = settings.developer_instructions ?? null;

          const labelSource =
            typeof item.label === "string" && item.label.trim()
              ? item.label
              : typeof item.name === "string" && item.name.trim()
                ? item.name
                : modeId;

          const option: CollaborationModeOption = {
            id: modeId,
            label: labelSource,
            mode: modeId,
            model,
            reasoningEffort: reasoningEffort ? String(reasoningEffort) : null,
            developerInstructions: developerInstructions
              ? String(developerInstructions)
              : null,
            value: item as Record<string, unknown>,
          };
          return option;
        })
        .filter((mode): mode is CollaborationModeOption => mode !== null);
      setModes(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const preferredModeId =
        data.find(
          (mode) =>
            mode.id.trim().toLowerCase() === "default" ||
            mode.mode.trim().toLowerCase() === "default",
        )?.id ??
        data.find(
          (mode) =>
            mode.id.trim().toLowerCase() === "code" ||
            mode.mode.trim().toLowerCase() === "code",
        )?.id ??
        data[0]?.id ??
        null;
      setSelectedModeId((currentSelection) => {
        const selection = currentSelection ?? selectedModeIdRef.current;
        if (!selection) {
          return preferredModeId;
        }
        if (!data.some((mode) => mode.id === selection)) {
          return preferredModeId;
        }
        return selection;
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-collaboration-mode-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "collaborationMode/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [enabled, extractModeList, isConnected, onDebug, workspaceId]);

  useEffect(() => {
    selectedModeIdRef.current = selectedModeId;
  }, [selectedModeId]);

  useEffect(() => {
    if (previousWorkspaceId.current !== workspaceId) {
      previousWorkspaceId.current = workspaceId;
      setModes([]);
      lastFetchedWorkspaceId.current = null;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setModes([]);
      setSelectedModeId(null);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    if (!workspaceId || !isConnected) {
      setModes([]);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    const alreadyFetchedForWorkspace = lastFetchedWorkspaceId.current === workspaceId;
    if (alreadyFetchedForWorkspace) {
      return;
    }
    refreshModes();
  }, [enabled, isConnected, modes.length, refreshModes, workspaceId]);

  return {
    collaborationModes: modes,
    selectedCollaborationMode: selectedMode,
    selectedCollaborationModeId: selectedModeId,
    setSelectedCollaborationModeId: setSelectedModeId,
    refreshCollaborationModes: refreshModes,
  };
}
