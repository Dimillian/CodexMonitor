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
  preferredModeId?: string | null;
  selectionKey?: string | null;
  onDebug?: (entry: DebugEntry) => void;
};

function pickWorkspaceDefaultModeId(modes: CollaborationModeOption[]): string | null {
  return (
    modes.find(
      (mode) =>
        mode.id.trim().toLowerCase() === "default" ||
        mode.mode.trim().toLowerCase() === "default",
    )?.id ??
    modes.find(
      (mode) =>
        mode.id.trim().toLowerCase() === "code" ||
        mode.mode.trim().toLowerCase() === "code",
    )?.id ??
    modes[0]?.id ??
    null
  );
}

export function useCollaborationModes({
  activeWorkspace,
  enabled,
  preferredModeId = null,
  selectionKey = null,
  onDebug,
}: UseCollaborationModesOptions) {
  const [modes, setModes] = useState<CollaborationModeOption[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const previousWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const selectedModeIdRef = useRef<string | null>(null);
  const lastSelectionKey = useRef<string | null>(null);
  const lastEnabled = useRef(enabled);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const extractModeList = useCallback((response: unknown): unknown[] => {
    const res = response as Record<string, unknown> | null | undefined;
    const candidates = [
      (res?.result as Record<string, unknown> | undefined)?.data,
      (res?.result as Record<string, unknown> | undefined)?.modes,
      res?.result,
      res?.data,
      res?.modes,
      response,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
      if (candidate && typeof candidate === "object") {
        const rec = candidate as Record<string, unknown>;
        const nested = rec.data ?? rec.modes;
        if (Array.isArray(nested)) {
          return nested;
        }
        if (nested && typeof nested === "object") {
          const nestedRec = nested as Record<string, unknown>;
          const deep = nestedRec.data ?? nestedRec.modes;
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
        .map((item: unknown) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const rec = item as Record<string, unknown>;
          const modeId = String(rec.mode ?? rec.name ?? "").trim();
          if (!modeId) {
            return null;
          }

          const settings =
            rec.settings && typeof rec.settings === "object"
              ? (rec.settings as Record<string, unknown>)
              : {
                  model: rec.model ?? null,
                  reasoning_effort:
                    rec.reasoning_effort ?? rec.reasoningEffort ?? null,
                  developer_instructions:
                    rec.developer_instructions ??
                    rec.developerInstructions ??
                    null,
                };

          const model = String(settings.model ?? "");
          const reasoningEffort = settings.reasoning_effort ?? null;
          const developerInstructions = settings.developer_instructions ?? null;

          const labelSource =
            typeof rec.label === "string" && rec.label.trim()
              ? rec.label
              : typeof rec.name === "string" && rec.name.trim()
                ? rec.name
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
            value: rec as Record<string, unknown>,
          };
          return option;
        })
        .filter((mode): mode is CollaborationModeOption => mode !== null);
      setModes(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const workspaceDefaultModeId = pickWorkspaceDefaultModeId(data);
      setSelectedModeId((currentSelection) => {
        const selection = currentSelection ?? selectedModeIdRef.current;
        if (!selection) {
          return workspaceDefaultModeId;
        }
        if (!data.some((mode) => mode.id === selection)) {
          return workspaceDefaultModeId;
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
    const wasEnabled = lastEnabled.current;
    lastEnabled.current = enabled;
    if (!enabled) {
      return;
    }
    const enabledJustReenabled = !wasEnabled;
    if (!enabledJustReenabled && selectionKey === lastSelectionKey.current) {
      return;
    }
    lastSelectionKey.current = selectionKey;
    // When switching threads, prefer the per-thread override. If there is no stored override,
    // reset to the workspace default instead of carrying over the previous thread's selection.
    // Also validate that a stored override still exists; otherwise fall back to the workspace default
    // so collaboration payload generation remains enabled.
    setSelectedModeId(() => {
      if (!modes.length) {
        // If modes aren't loaded yet, keep the preferred ID (if any) until refresh validates it.
        return preferredModeId;
      }
      if (preferredModeId && modes.some((mode) => mode.id === preferredModeId)) {
        return preferredModeId;
      }
      return pickWorkspaceDefaultModeId(modes);
    });
  }, [enabled, modes, preferredModeId, selectionKey]);

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
