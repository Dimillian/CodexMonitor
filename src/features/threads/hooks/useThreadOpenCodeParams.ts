import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessMode, ServiceTier } from "@/types";
import {
  STORAGE_KEY_THREAD_OPENCODE_PARAMS,
  type ThreadOpenCodeParams,
  type ThreadOpenCodeParamsMap,
  loadThreadOpenCodeParams,
  makeThreadOpenCodeParamsKey,
  saveThreadOpenCodeParams,
} from "@threads/utils/threadStorage";

type ThreadOpenCodeParamsPatch = Partial<
  Pick<
    ThreadOpenCodeParams,
    | "modelId"
    | "effort"
    | "serviceTier"
    | "accessMode"
    | "collaborationModeId"
    | "opencodeArgsOverride"
  >
>;

type UseThreadOpenCodeParamsResult = {
  version: number;
  getThreadOpenCodeParams: (workspaceId: string, threadId: string) => ThreadOpenCodeParams | null;
  patchThreadOpenCodeParams: (
    workspaceId: string,
    threadId: string,
    patch: ThreadOpenCodeParamsPatch,
  ) => void;
  deleteThreadOpenCodeParams: (workspaceId: string, threadId: string) => void;
};

const DEFAULT_ENTRY: ThreadOpenCodeParams = {
  modelId: null,
  effort: null,
  serviceTier: undefined,
  accessMode: null,
  collaborationModeId: null,
  opencodeArgsOverride: null,
  updatedAt: 0,
};

function coerceAccessMode(value: unknown): AccessMode | null {
  if (value === "read-only" || value === "current" || value === "full-access") {
    return value;
  }
  return null;
}

function coerceServiceTier(value: unknown): ServiceTier | null {
  if (value === "fast" || value === "flex") {
    return value;
  }
  return null;
}

function sanitizeEntry(value: unknown): ThreadOpenCodeParams | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const hasOpenCodeArgsOverrideField = Object.prototype.hasOwnProperty.call(
    entry,
    "opencodeArgsOverride",
  );
  const opencodeArgsOverride = hasOpenCodeArgsOverrideField
    ? entry.opencodeArgsOverride === undefined
      ? undefined
      : typeof entry.opencodeArgsOverride === "string" || entry.opencodeArgsOverride === null
        ? entry.opencodeArgsOverride
        : null
    : undefined;
  const hasServiceTierField = Object.prototype.hasOwnProperty.call(entry, "serviceTier");
  const serviceTier = hasServiceTierField
    ? entry.serviceTier === undefined
      ? undefined
      : entry.serviceTier === null
        ? null
        : coerceServiceTier(entry.serviceTier)
    : undefined;
  return {
    modelId: typeof entry.modelId === "string" ? entry.modelId : null,
    effort: typeof entry.effort === "string" ? entry.effort : null,
    serviceTier,
    accessMode: coerceAccessMode(entry.accessMode),
    collaborationModeId:
      typeof entry.collaborationModeId === "string"
        ? entry.collaborationModeId
        : null,
    opencodeArgsOverride,
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
  };
}

export function useThreadOpenCodeParams(): UseThreadOpenCodeParamsResult {
  const paramsRef = useRef<ThreadOpenCodeParamsMap>(loadThreadOpenCodeParams());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY_THREAD_OPENCODE_PARAMS) {
        return;
      }
      paramsRef.current = loadThreadOpenCodeParams();
      setVersion((v) => v + 1);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const getThreadOpenCodeParams = useCallback(
    (workspaceId: string, threadId: string): ThreadOpenCodeParams | null => {
      const key = makeThreadOpenCodeParamsKey(workspaceId, threadId);
      const entry = paramsRef.current[key];
      return sanitizeEntry(entry) ?? null;
    },
    [],
  );

  const patchThreadOpenCodeParams = useCallback(
    (workspaceId: string, threadId: string, patch: ThreadOpenCodeParamsPatch) => {
      const key = makeThreadOpenCodeParamsKey(workspaceId, threadId);
      const current = sanitizeEntry(paramsRef.current[key]) ?? DEFAULT_ENTRY;
      const nextEntry: ThreadOpenCodeParams = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      const next: ThreadOpenCodeParamsMap = { ...paramsRef.current, [key]: nextEntry };
      paramsRef.current = next;
      saveThreadOpenCodeParams(next);
      setVersion((v) => v + 1);
    },
    [],
  );

  const deleteThreadOpenCodeParams = useCallback((workspaceId: string, threadId: string) => {
    const key = makeThreadOpenCodeParamsKey(workspaceId, threadId);
    if (!(key in paramsRef.current)) {
      return;
    }
    const { [key]: _removed, ...rest } = paramsRef.current;
    paramsRef.current = rest;
    saveThreadOpenCodeParams(rest);
    setVersion((v) => v + 1);
  }, []);

  return useMemo(
    () => ({
      version,
      getThreadOpenCodeParams,
      patchThreadOpenCodeParams,
      deleteThreadOpenCodeParams,
    }),
    [deleteThreadOpenCodeParams, getThreadOpenCodeParams, patchThreadOpenCodeParams, version],
  );
}
