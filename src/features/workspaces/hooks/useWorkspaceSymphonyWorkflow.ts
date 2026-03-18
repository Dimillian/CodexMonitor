import { useCallback } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import {
  readWorkspaceSymphonyWorkflowOverride,
  writeWorkspaceSymphonyWorkflowOverride,
} from "../../../services/tauri";
import { useFileEditor, type FileEditorResponse } from "../../shared/hooks/useFileEditor";

type UseWorkspaceSymphonyWorkflowOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useWorkspaceSymphonyWorkflow({
  activeWorkspace,
  onDebug,
}: UseWorkspaceSymphonyWorkflowOptions) {
  const workspaceId = activeWorkspace?.id ?? null;

  const readWithDebug = useCallback(async (): Promise<FileEditorResponse> => {
    if (!workspaceId) {
      return { exists: false, content: "", truncated: false };
    }
    const requestWorkspaceId = workspaceId;
    onDebug?.({
      id: `${Date.now()}-client-symphony-workflow-read`,
      timestamp: Date.now(),
      source: "client",
      label: "symphony/workflow/read",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await readWorkspaceSymphonyWorkflowOverride(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-symphony-workflow-read`,
        timestamp: Date.now(),
        source: "server",
        label: "symphony/workflow/read response",
        payload: response,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-symphony-workflow-read-error`,
        timestamp: Date.now(),
        source: "error",
        label: "symphony/workflow/read error",
        payload: message,
      });
      throw error;
    }
  }, [onDebug, workspaceId]);

  const writeWithDebug = useCallback(
    async (content: string) => {
      if (!workspaceId) {
        return;
      }
      const requestWorkspaceId = workspaceId;
      onDebug?.({
        id: `${Date.now()}-client-symphony-workflow-write`,
        timestamp: Date.now(),
        source: "client",
        label: "symphony/workflow/write",
        payload: { workspaceId: requestWorkspaceId },
      });
      try {
        await writeWorkspaceSymphonyWorkflowOverride(requestWorkspaceId, content);
        onDebug?.({
          id: `${Date.now()}-server-symphony-workflow-write`,
          timestamp: Date.now(),
          source: "server",
          label: "symphony/workflow/write response",
          payload: { ok: true },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDebug?.({
          id: `${Date.now()}-client-symphony-workflow-write-error`,
          timestamp: Date.now(),
          source: "error",
          label: "symphony/workflow/write error",
          payload: message,
        });
        throw error;
      }
    },
    [onDebug, workspaceId],
  );

  return useFileEditor({
    key: workspaceId,
    read: readWithDebug,
    write: writeWithDebug,
    readErrorTitle: "Couldn’t load Symphony workflow",
    writeErrorTitle: "Couldn’t save Symphony workflow",
  });
}
