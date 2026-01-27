import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { readAgentMd, writeAgentMd } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";

type UseWorkspaceAgentMdOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

type AgentMdState = {
  content: string;
  exists: boolean;
  truncated: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
};

const EMPTY_STATE: AgentMdState = {
  content: "",
  exists: false,
  truncated: false,
  isLoading: false,
  isSaving: false,
  error: null,
};

export function useWorkspaceAgentMd({ activeWorkspace, onDebug }: UseWorkspaceAgentMdOptions) {
  const [state, setState] = useState<AgentMdState>(EMPTY_STATE);
  const lastLoadedContentRef = useRef<string>("");
  const inFlightWorkspaceIdRef = useRef<string | null>(null);
  const latestWorkspaceIdRef = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;

  useEffect(() => {
    latestWorkspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    if (inFlightWorkspaceIdRef.current === workspaceId) {
      return;
    }
    inFlightWorkspaceIdRef.current = workspaceId;
    const requestWorkspaceId = workspaceId;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    onDebug?.({
      id: `${Date.now()}-client-agent-md-read`,
      timestamp: Date.now(),
      source: "client",
      label: "agent.md/read",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await readAgentMd(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-agent-md-read`,
        timestamp: Date.now(),
        source: "server",
        label: "agent.md/read response",
        payload: response,
      });
      if (requestWorkspaceId !== latestWorkspaceIdRef.current) {
        return;
      }
      lastLoadedContentRef.current = response.content;
      setState({
        content: response.content,
        exists: response.exists,
        truncated: response.truncated,
        isLoading: false,
        isSaving: false,
        error: null,
      });
    } catch (error) {
      if (requestWorkspaceId !== latestWorkspaceIdRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-agent-md-read-error`,
        timestamp: Date.now(),
        source: "error",
        label: "agent.md/read error",
        payload: message,
      });
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      pushErrorToast({
        title: "Couldn’t load agent.md",
        message,
      });
    } finally {
      if (inFlightWorkspaceIdRef.current === requestWorkspaceId) {
        inFlightWorkspaceIdRef.current = null;
      }
    }
  }, [onDebug, workspaceId]);

  const save = useCallback(async () => {
    if (!workspaceId) {
      return false;
    }
    const requestWorkspaceId = workspaceId;
    const content = state.content;
    setState((prev) => ({ ...prev, isSaving: true, error: null }));
    onDebug?.({
      id: `${Date.now()}-client-agent-md-write`,
      timestamp: Date.now(),
      source: "client",
      label: "agent.md/write",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      await writeAgentMd(requestWorkspaceId, content);
      onDebug?.({
        id: `${Date.now()}-server-agent-md-write`,
        timestamp: Date.now(),
        source: "server",
        label: "agent.md/write response",
        payload: { ok: true },
      });
      if (requestWorkspaceId !== latestWorkspaceIdRef.current) {
        return false;
      }
      lastLoadedContentRef.current = content;
      setState((prev) => ({
        ...prev,
        exists: true,
        truncated: false,
        isSaving: false,
        error: null,
      }));
      return true;
    } catch (error) {
      if (requestWorkspaceId !== latestWorkspaceIdRef.current) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-agent-md-write-error`,
        timestamp: Date.now(),
        source: "error",
        label: "agent.md/write error",
        payload: message,
      });
      setState((prev) => ({ ...prev, isSaving: false, error: message }));
      pushErrorToast({
        title: "Couldn’t save agent.md",
        message,
      });
      return false;
    }
  }, [onDebug, state.content, workspaceId]);

  const setContent = useCallback((value: string) => {
    setState((prev) => ({ ...prev, content: value }));
  }, []);

  useEffect(() => {
    setState(EMPTY_STATE);
    lastLoadedContentRef.current = "";
    inFlightWorkspaceIdRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    refresh().catch(() => {});
  }, [refresh, workspaceId]);

  const isDirty = useMemo(() => state.content !== lastLoadedContentRef.current, [state.content]);

  return {
    ...state,
    isDirty,
    setContent,
    refresh,
    save,
  };
}
