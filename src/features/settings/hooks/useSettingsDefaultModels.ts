import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { getModelList } from "../../../services/tauri";
import { parseModelListResponse } from "../../models/utils/modelListResponse";

type SettingsDefaultModelsState = {
  models: ModelOption[];
  isLoading: boolean;
  error: string | null;
  connectedWorkspaceCount: number;
};

const EMPTY_STATE: SettingsDefaultModelsState = {
  models: [],
  isLoading: false,
  error: null,
  connectedWorkspaceCount: 0,
};

const parseGptVersionScore = (slug: string): number | null => {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(slug.trim());
  if (!match) {
    return null;
  }
  const major = Number(match[1] ?? NaN);
  const minor = Number(match[2] ?? 0);
  const patch = Number(match[3] ?? 0);
  if (!Number.isFinite(major)) {
    return null;
  }
  return major * 1_000_000 + minor * 1_000 + patch;
};

const gptVariantPenalty = (slug: string): number => {
  const match = /^gpt-(\d+(?:\.\d+){0,2})(.*)$/i.exec(slug.trim());
  if (!match) {
    return 1;
  }
  const suffix = match[2] ?? "";
  return suffix.startsWith("-") ? 1 : 0;
};

function compareModelsByLatest(a: ModelOption, b: ModelOption): number {
  const scoreA = parseGptVersionScore(a.model) ?? -1;
  const scoreB = parseGptVersionScore(b.model) ?? -1;
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }
  const penaltyA = gptVariantPenalty(a.model);
  const penaltyB = gptVariantPenalty(b.model);
  if (penaltyA !== penaltyB) {
    return penaltyA - penaltyB;
  }
  if (a.isDefault !== b.isDefault) {
    return a.isDefault ? -1 : 1;
  }
  return a.model.localeCompare(b.model);
}

export function useSettingsDefaultModels(projects: WorkspaceInfo[]) {
  const [state, setState] = useState<SettingsDefaultModelsState>(EMPTY_STATE);
  const requestIdRef = useRef(0);

  const connectedWorkspaces = useMemo(
    () => projects.filter((workspace) => workspace.connected),
    [projects],
  );

  const refresh = useCallback(async () => {
    const connected = connectedWorkspaces;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (connected.length === 0) {
      setState(EMPTY_STATE);
      return;
    }
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      connectedWorkspaceCount: connected.length,
    }));

    try {
      const results = await Promise.allSettled(
        connected.map((workspace) => getModelList(workspace.id)),
      );
      if (requestId !== requestIdRef.current) {
        return;
      }

      const modelBySlug = new Map<string, ModelOption>();
      const errors: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          const workspaceName = connected[index]?.name ?? `workspace-${index + 1}`;
          errors.push(`${workspaceName}: ${message}`);
          return;
        }
        parseModelListResponse(result.value).forEach((model) => {
          const slug = model.model;
          if (!slug) {
            return;
          }
          const existing = modelBySlug.get(slug);
          if (!existing) {
            modelBySlug.set(slug, model);
            return;
          }
          // Prefer the entry that includes more metadata (e.g., reasoning efforts).
          const existingEfforts = existing.supportedReasoningEfforts.length;
          const nextEfforts = model.supportedReasoningEfforts.length;
          const preferNext =
            (model.isDefault && !existing.isDefault) || nextEfforts > existingEfforts;
          if (preferNext) {
            modelBySlug.set(slug, model);
          }
        });
      });

      const models = Array.from(modelBySlug.values()).sort(compareModelsByLatest);
      setState({
        models,
        isLoading: false,
        error: errors.length ? errors.join(" | ") : null,
        connectedWorkspaceCount: connected.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestId === requestIdRef.current) {
        setState({
          models: [],
          isLoading: false,
          error: message,
          connectedWorkspaceCount: connected.length,
        });
      }
    }
  }, [connectedWorkspaces]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
