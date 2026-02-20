import { useCallback, useEffect, useRef, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { closeTerminalSession } from "../../../services/tauri";
import { buildErrorDebugEntry } from "../../../utils/debugEntries";
import { useTerminalSession } from "./useTerminalSession";
import { useTerminalTabs } from "./useTerminalTabs";

type UseTerminalControllerOptions = {
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  terminalOpen: boolean;
  onCloseTerminalPanel?: () => void;
  onDebug: (entry: DebugEntry) => void;
};

export function useTerminalController({
  activeWorkspaceId,
  activeWorkspace,
  terminalOpen,
  onCloseTerminalPanel,
  onDebug,
}: UseTerminalControllerOptions) {
  const cleanupTerminalRef = useRef<((workspaceId: string, terminalId: string) => void) | null>(
    null,
  );
  const [focusRequestVersion, setFocusRequestVersion] = useState(0);
  const requestTerminalFocus = useCallback(() => {
    setFocusRequestVersion((prev) => prev + 1);
  }, []);
  const shouldIgnoreTerminalCloseError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("Terminal session not found");
  }, []);

  const handleTerminalClose = useCallback(
    async (workspaceId: string, terminalId: string) => {
      cleanupTerminalRef.current?.(workspaceId, terminalId);
      try {
        await closeTerminalSession(workspaceId, terminalId);
      } catch (error) {
        if (shouldIgnoreTerminalCloseError(error)) {
          return;
        }
        onDebug(buildErrorDebugEntry("terminal close error", error));
      }
    },
    [onDebug, shouldIgnoreTerminalCloseError],
  );

  const {
    terminals: terminalTabs,
    activeTerminalId,
    createTerminal,
    ensureTerminalWithTitle,
    closeTerminal,
    setActiveTerminal,
    ensureTerminal,
  } = useTerminalTabs({
    activeWorkspaceId,
    onCloseTerminal: handleTerminalClose,
  });

  useEffect(() => {
    if (terminalOpen && activeWorkspaceId) {
      ensureTerminal(activeWorkspaceId);
    }
  }, [activeWorkspaceId, ensureTerminal, terminalOpen]);

  const terminalState = useTerminalSession({
    activeWorkspace,
    activeTerminalId,
    isVisible: terminalOpen,
    focusRequestVersion,
    onDebug,
    onSessionExit: (workspaceId, terminalId) => {
      const shouldClosePanel =
        workspaceId === activeWorkspaceId &&
        terminalTabs.length === 1 &&
        terminalTabs[0]?.id === terminalId;
      closeTerminal(workspaceId, terminalId);
      if (shouldClosePanel) {
        onCloseTerminalPanel?.();
      }
    },
  });

  useEffect(() => {
    cleanupTerminalRef.current = terminalState.cleanupTerminalSession;
  }, [terminalState.cleanupTerminalSession]);

  const onSelectTerminal = useCallback(
    (terminalId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      requestTerminalFocus();
      setActiveTerminal(activeWorkspaceId, terminalId);
    },
    [activeWorkspaceId, requestTerminalFocus, setActiveTerminal],
  );

  const onNewTerminal = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    requestTerminalFocus();
    createTerminal(activeWorkspaceId);
  }, [activeWorkspaceId, createTerminal, requestTerminalFocus]);

  const onCloseTerminal = useCallback(
    (terminalId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      const shouldClosePanel =
        terminalTabs.length === 1 && terminalTabs[0]?.id === terminalId;
      closeTerminal(activeWorkspaceId, terminalId);
      if (shouldClosePanel) {
        onCloseTerminalPanel?.();
      }
    },
    [activeWorkspaceId, closeTerminal, onCloseTerminalPanel, terminalTabs],
  );

  const restartTerminalSession = useCallback(
    async (workspaceId: string, terminalId: string) => {
      cleanupTerminalRef.current?.(workspaceId, terminalId);
      try {
        await closeTerminalSession(workspaceId, terminalId);
      } catch (error) {
        if (!shouldIgnoreTerminalCloseError(error)) {
          onDebug(buildErrorDebugEntry("terminal close error", error));
          throw error;
        }
      }
    },
    [onDebug, shouldIgnoreTerminalCloseError],
  );

  return {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureTerminalWithTitle,
    restartTerminalSession,
    requestTerminalFocus,
  };
}
