import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessMode } from "../../../types";
import {
  STORAGE_KEY_THREAD_CODEX_PARAMS,
  type ThreadCodexParams,
  type ThreadCodexParamsMap,
  loadThreadCodexParams,
  makeThreadCodexParamsKey,
  saveThreadCodexParams,
} from "../utils/threadStorage";

export type ThreadCodexParamsPatch = Partial<
  Pick<ThreadCodexParams, "modelId" | "effort" | "accessMode" | "collaborationModeId">
>;

type UseThreadCodexParamsResult = {
  version: number;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
  patchThreadCodexParams: (
    workspaceId: string,
    threadId: string,
    patch: ThreadCodexParamsPatch,
  ) => void;
  deleteThreadCodexParams: (workspaceId: string, threadId: string) => void;
};

const DEFAULT_ENTRY: ThreadCodexParams = {
  modelId: null,
  effort: null,
  accessMode: null,
  collaborationModeId: null,
  updatedAt: 0,
};

function coerceAccessMode(value: unknown): AccessMode | null {
  if (value === "read-only" || value === "current" || value === "full-access") {
    return value;
  }
  return null;
}

function sanitizeEntry(value: unknown): ThreadCodexParams | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  return {
    modelId: typeof entry.modelId === "string" ? entry.modelId : null,
    effort: typeof entry.effort === "string" ? entry.effort : null,
    accessMode: coerceAccessMode(entry.accessMode),
    collaborationModeId:
      typeof entry.collaborationModeId === "string"
        ? entry.collaborationModeId
        : null,
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
  };
}

export function useThreadCodexParams(): UseThreadCodexParamsResult {
  const paramsRef = useRef<ThreadCodexParamsMap>(loadThreadCodexParams());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY_THREAD_CODEX_PARAMS) {
        return;
      }
      paramsRef.current = loadThreadCodexParams();
      setVersion((v) => v + 1);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const getThreadCodexParams = useCallback(
    (workspaceId: string, threadId: string): ThreadCodexParams | null => {
      const key = makeThreadCodexParamsKey(workspaceId, threadId);
      const entry = paramsRef.current[key];
      return sanitizeEntry(entry) ?? null;
    },
    [],
  );

  const patchThreadCodexParams = useCallback(
    (workspaceId: string, threadId: string, patch: ThreadCodexParamsPatch) => {
      const key = makeThreadCodexParamsKey(workspaceId, threadId);
      const current = sanitizeEntry(paramsRef.current[key]) ?? DEFAULT_ENTRY;
      const nextEntry: ThreadCodexParams = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      const next: ThreadCodexParamsMap = { ...paramsRef.current, [key]: nextEntry };
      paramsRef.current = next;
      saveThreadCodexParams(next);
      setVersion((v) => v + 1);
    },
    [],
  );

  const deleteThreadCodexParams = useCallback((workspaceId: string, threadId: string) => {
    const key = makeThreadCodexParamsKey(workspaceId, threadId);
    if (!(key in paramsRef.current)) {
      return;
    }
    const { [key]: _removed, ...rest } = paramsRef.current;
    paramsRef.current = rest;
    saveThreadCodexParams(rest);
    setVersion((v) => v + 1);
  }, []);

  return useMemo(
    () => ({
      version,
      getThreadCodexParams,
      patchThreadCodexParams,
      deleteThreadCodexParams,
    }),
    [deleteThreadCodexParams, getThreadCodexParams, patchThreadCodexParams, version],
  );
}

