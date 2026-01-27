import { useCallback, useRef } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { buildErrorDebugEntry } from "../../../utils/debugEntries";
import {
  getWorktreeSetupStatus,
  markWorktreeSetupRan,
  openTerminalSession,
  writeTerminalSession,
} from "../../../services/tauri";

const WORKTREE_SETUP_TERMINAL_ID = "worktree-setup";
const WORKTREE_SETUP_TERMINAL_TITLE = "Setup";
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;

type UseWorktreeSetupScriptOptions = {
  ensureTerminalWithTitle: (workspaceId: string, terminalId: string, title: string) => string;
  restartTerminalSession: (workspaceId: string, terminalId: string) => Promise<void>;
  openTerminal: () => void;
  onDebug?: (entry: DebugEntry) => void;
};

export type WorktreeSetupScriptState = {
  maybeRunWorktreeSetupScript: (worktree: WorkspaceInfo) => Promise<void>;
};

export function useWorktreeSetupScript({
  ensureTerminalWithTitle,
  restartTerminalSession,
  openTerminal,
  onDebug,
}: UseWorktreeSetupScriptOptions): WorktreeSetupScriptState {
  const runningRef = useRef<Set<string>>(new Set());

  const maybeRunWorktreeSetupScript = useCallback(
    async (worktree: WorkspaceInfo) => {
      if ((worktree.kind ?? "main") !== "worktree") {
        return;
      }
      if (runningRef.current.has(worktree.id)) {
        return;
      }
      runningRef.current.add(worktree.id);
      try {
        const status = await getWorktreeSetupStatus(worktree.id);
        const script = status.script?.trim() ? status.script : null;
        if (!status.shouldRun || !script) {
          return;
        }

        openTerminal();
        const terminalId = ensureTerminalWithTitle(
          worktree.id,
          WORKTREE_SETUP_TERMINAL_ID,
          WORKTREE_SETUP_TERMINAL_TITLE,
        );

        try {
          await restartTerminalSession(worktree.id, terminalId);
        } catch (error) {
          onDebug?.(buildErrorDebugEntry("worktree setup restart error", error));
        }

        await openTerminalSession(
          worktree.id,
          terminalId,
          DEFAULT_TERMINAL_COLS,
          DEFAULT_TERMINAL_ROWS,
        );
        await writeTerminalSession(worktree.id, terminalId, `${script}\n`);
        await markWorktreeSetupRan(worktree.id);
      } catch (error) {
        onDebug?.(buildErrorDebugEntry("worktree setup script error", error));
      } finally {
        runningRef.current.delete(worktree.id);
      }
    },
    [ensureTerminalWithTitle, onDebug, openTerminal, restartTerminalSession],
  );

  return {
    maybeRunWorktreeSetupScript,
  };
}
