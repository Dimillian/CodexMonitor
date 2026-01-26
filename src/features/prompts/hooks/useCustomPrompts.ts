import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomPromptOption, DebugEntry, WorkspaceInfo } from "../../../types";
import {
  createPrompt as createPromptService,
  deletePrompt as deletePromptService,
  getPromptsList,
  getGlobalPromptsDir as getGlobalPromptsDirService,
  getWorkspacePromptsDir as getWorkspacePromptsDirService,
  movePrompt as movePromptService,
  updatePrompt as updatePromptService,
} from "../../../services/tauri";

type UseCustomPromptsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useCustomPrompts({ activeWorkspace, onDebug }: UseCustomPromptsOptions) {
  const [prompts, setPrompts] = useState<CustomPromptOption[]>([]);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const logPromptError = useCallback(
    (idSuffix: string, label: string, error: unknown) => {
      const timestamp = Date.now();
      onDebug?.({
        id: `${timestamp}-${idSuffix}`,
        timestamp,
        source: "error",
        label,
        payload: error instanceof Error ? error.message : String(error),
      });
    },
    [onDebug],
  );

  const refreshPrompts = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-prompts-list`,
      timestamp: Date.now(),
      source: "client",
      label: "prompts/list",
      payload: { workspaceId },
    });
    try {
      const response = await getPromptsList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-prompts-list`,
        timestamp: Date.now(),
        source: "server",
        label: "prompts/list response",
        payload: response,
      });
      const responsePayload = response as any;
      let rawPrompts: any[] = [];
      if (Array.isArray(response)) {
        rawPrompts = response;
      } else if (Array.isArray(responsePayload?.prompts)) {
        rawPrompts = responsePayload.prompts;
      } else if (Array.isArray(responsePayload?.result?.prompts)) {
        rawPrompts = responsePayload.result.prompts;
      } else if (Array.isArray(responsePayload?.result)) {
        rawPrompts = responsePayload.result;
      }
      const data: CustomPromptOption[] = rawPrompts.map((item: any) => {
        let argumentHint: string | undefined;
        if (item.argumentHint) {
          argumentHint = String(item.argumentHint);
        } else if (item.argument_hint) {
          argumentHint = String(item.argument_hint);
        }

        let scope: CustomPromptOption["scope"];
        if (item.scope === "workspace" || item.scope === "global") {
          scope = item.scope;
        }

        return {
          name: String(item.name ?? ""),
          path: String(item.path ?? ""),
          description: item.description ? String(item.description) : undefined,
          argumentHint,
          content: String(item.content ?? ""),
          scope,
        };
      });
      setPrompts(data);
      lastFetchedWorkspaceId.current = workspaceId;
    } catch (error) {
      logPromptError("client-prompts-list-error", "prompts/list error", error);
    } finally {
      inFlight.current = false;
    }
  }, [isConnected, logPromptError, onDebug, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId) {
      return;
    }
    refreshPrompts();
  }, [isConnected, refreshPrompts, workspaceId]);

  const promptOptions = useMemo(
    () => prompts.filter((prompt) => prompt.name),
    [prompts],
  );

  const requireWorkspaceId = useCallback(() => {
    if (!workspaceId) {
      throw new Error("No workspace selected.");
    }
    return workspaceId;
  }, [workspaceId]);

  const createPrompt = useCallback(
    async (data: {
      scope: "workspace" | "global";
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      const id = requireWorkspaceId();
      try {
        await createPromptService(id, data);
        await refreshPrompts();
      } catch (error) {
        logPromptError("client-prompts-create-error", "prompts/create error", error);
        throw error;
      }
    },
    [logPromptError, refreshPrompts, requireWorkspaceId],
  );

  const updatePrompt = useCallback(
    async (data: {
      path: string;
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      const id = requireWorkspaceId();
      try {
        await updatePromptService(id, data);
        await refreshPrompts();
      } catch (error) {
        logPromptError("client-prompts-update-error", "prompts/update error", error);
        throw error;
      }
    },
    [logPromptError, refreshPrompts, requireWorkspaceId],
  );

  const deletePrompt = useCallback(
    async (path: string) => {
      const id = requireWorkspaceId();
      try {
        await deletePromptService(id, path);
        await refreshPrompts();
      } catch (error) {
        logPromptError("client-prompts-delete-error", "prompts/delete error", error);
        throw error;
      }
    },
    [logPromptError, refreshPrompts, requireWorkspaceId],
  );

  const movePrompt = useCallback(
    async (data: { path: string; scope: "workspace" | "global" }) => {
      const id = requireWorkspaceId();
      try {
        await movePromptService(id, data);
        await refreshPrompts();
      } catch (error) {
        logPromptError("client-prompts-move-error", "prompts/move error", error);
        throw error;
      }
    },
    [logPromptError, refreshPrompts, requireWorkspaceId],
  );

  const getWorkspacePromptsDir = useCallback(async () => {
    const id = requireWorkspaceId();
    try {
      return await getWorkspacePromptsDirService(id);
    } catch (error) {
      logPromptError("client-prompts-dir-error", "prompts/workspace dir error", error);
      throw error;
    }
  }, [logPromptError, requireWorkspaceId]);

  const getGlobalPromptsDir = useCallback(async () => {
    if (!workspaceId) {
      return null;
    }
    try {
      return await getGlobalPromptsDirService(workspaceId);
    } catch (error) {
      logPromptError("client-prompts-global-dir-error", "prompts/global dir error", error);
      throw error;
    }
  }, [logPromptError, workspaceId]);

  return {
    prompts: promptOptions,
    refreshPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    movePrompt,
    getWorkspacePromptsDir,
    getGlobalPromptsDir,
  };
}
