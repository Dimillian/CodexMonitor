import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { DebugEntry, TerminalStatus, WorkspaceInfo } from "../../../types";
import { buildErrorDebugEntry } from "../../../utils/debugEntries";
import { subscribeTerminalOutput, type TerminalOutputEvent } from "../../../services/events";
import {
  openTerminalSession,
  resizeTerminalSession,
  writeTerminalSession,
} from "../../../services/tauri";

const MAX_BUFFER_CHARS = 200_000;

type UseTerminalSessionOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeTerminalId: string | null;
  isVisible: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export type TerminalSessionState = {
  status: TerminalStatus;
  message: string;
  containerRef: RefObject<HTMLDivElement | null>;
  hasSession: boolean;
  cleanupTerminalSession: (workspaceId: string, terminalId: string) => void;
};

function appendBuffer(existing: string | undefined, data: string): string {
  const next = (existing ?? "") + data;
  if (next.length <= MAX_BUFFER_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_BUFFER_CHARS);
}

function shouldIgnoreTerminalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Terminal session not found");
}

export function useTerminalSession({
  activeWorkspace,
  activeTerminalId,
  isVisible,
  onDebug,
}: UseTerminalSessionOptions): TerminalSessionState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const openedSessionsRef = useRef<Set<string>>(new Set());
  const outputBuffersRef = useRef<Map<string, string>>(new Map());
  const activeKeyRef = useRef<string | null>(null);
  const renderedKeyRef = useRef<string | null>(null);
  const activeWorkspaceRef = useRef<WorkspaceInfo | null>(null);
  const activeTerminalIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [message, setMessage] = useState("Open a terminal to start a session.");
  const [hasSession, setHasSession] = useState(false);
  const cleanupTerminalSession = useCallback((workspaceId: string, terminalId: string) => {
    const key = `${workspaceId}:${terminalId}`;
    outputBuffersRef.current.delete(key);
    openedSessionsRef.current.delete(key);
    if (activeKeyRef.current === key) {
      terminalRef.current?.reset();
    }
  }, []);

  const activeKey = useMemo(() => {
    if (!activeWorkspace || !activeTerminalId) {
      return null;
    }
    return `${activeWorkspace.id}:${activeTerminalId}`;
  }, [activeTerminalId, activeWorkspace]);

  useEffect(() => {
    activeKeyRef.current = activeKey;
    activeWorkspaceRef.current = activeWorkspace;
    activeTerminalIdRef.current = activeTerminalId;
  }, [activeKey, activeTerminalId, activeWorkspace]);

  const writeToTerminal = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const refreshTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    const lastRow = Math.max(0, terminal.rows - 1);
    terminal.refresh(0, lastRow);
    terminal.focus();
  }, []);

  const syncActiveBuffer = useCallback(
    (key: string) => {
      const term = terminalRef.current;
      if (!term) {
        return;
      }
      term.reset();
      const buffered = outputBuffersRef.current.get(key);
      if (buffered) {
        term.write(buffered);
      }
      refreshTerminal();
    },
    [refreshTerminal],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let canceled = false;
    subscribeTerminalOutput((payload: TerminalOutputEvent) => {
      const { workspaceId, terminalId, data } = payload;
      const key = `${workspaceId}:${terminalId}`;
      const next = appendBuffer(outputBuffersRef.current.get(key), data);
      outputBuffersRef.current.set(key, next);
      if (activeKeyRef.current === key) {
        writeToTerminal(data);
      }
    })
      .then((handler) => {
        if (canceled) {
          handler();
          return;
        }
        unlisten = handler;
      })
      .catch((error) => {
        onDebug?.(buildErrorDebugEntry("terminal listen error", error));
      });
    return () => {
      canceled = true;
      if (unlisten) {
        try {
          unlisten();
        } catch {
          // Ignore double-unlisten when tearing down.
        }
      }
    };
  }, [onDebug, writeToTerminal]);

  useEffect(() => {
    if (!isVisible) {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
      renderedKeyRef.current = null;
      return;
    }

    if (!terminalRef.current && containerRef.current) {
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: "Menlo, Monaco, \"Courier New\", monospace",
        allowTransparency: true,
        theme: {
          background: "transparent",
          foreground: "#d9dee7",
          cursor: "#d9dee7",
        },
        scrollback: 5000,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      inputDisposableRef.current = terminal.onData((data: string) => {
        const workspace = activeWorkspaceRef.current;
        const terminalId = activeTerminalIdRef.current;
        if (!workspace || !terminalId) {
          return;
        }
        const key = `${workspace.id}:${terminalId}`;
        if (!openedSessionsRef.current.has(key)) {
          return;
        }
        void writeTerminalSession(workspace.id, terminalId, data).catch((error) => {
          if (shouldIgnoreTerminalError(error)) {
            openedSessionsRef.current.delete(key);
            return;
          }
          onDebug?.(buildErrorDebugEntry("terminal write error", error));
        });
      });
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setHasSession(false);
      return;
    }
    if (!activeWorkspace || !activeTerminalId) {
      setStatus("idle");
      setMessage("Open a terminal to start a session.");
      setHasSession(false);
      return;
    }
    if (!terminalRef.current || !fitAddonRef.current) {
      setStatus("idle");
      setMessage("Preparing terminal...");
      return;
    }
    const key = `${activeWorkspace.id}:${activeTerminalId}`;
    const fitAddon = fitAddonRef.current;
    fitAddon.fit();

    const cols = terminalRef.current.cols;
    const rows = terminalRef.current.rows;
    const openSession = async () => {
      setStatus("connecting");
      setMessage("Starting terminal session...");
      if (!openedSessionsRef.current.has(key)) {
        await openTerminalSession(activeWorkspace.id, activeTerminalId, cols, rows);
        openedSessionsRef.current.add(key);
      }
      setStatus("ready");
      setMessage("Terminal ready.");
      setHasSession(true);
      if (renderedKeyRef.current !== key) {
        syncActiveBuffer(key);
        renderedKeyRef.current = key;
      } else {
        refreshTerminal();
      }
    };

    openSession().catch((error) => {
      setStatus("error");
      setMessage("Failed to start terminal session.");
      onDebug?.(buildErrorDebugEntry("terminal open error", error));
    });
  }, [activeTerminalId, activeWorkspace, isVisible, onDebug, syncActiveBuffer]);

  useEffect(() => {
    if (!isVisible || !activeKey || !terminalRef.current || !fitAddonRef.current) {
      return;
    }
    fitAddonRef.current.fit();
    refreshTerminal();
  }, [activeKey, isVisible, refreshTerminal]);

  useEffect(() => {
    if (
      !isVisible ||
      !terminalRef.current ||
      !activeWorkspace ||
      !activeTerminalId ||
      !hasSession
    ) {
      return;
    }
    const fitAddon = fitAddonRef.current;
    const terminal = terminalRef.current;
    if (!fitAddon) {
      return;
    }

    const resize = () => {
      fitAddon.fit();
      const key = `${activeWorkspace.id}:${activeTerminalId}`;
      resizeTerminalSession(
        activeWorkspace.id,
        activeTerminalId,
        terminal.cols,
        terminal.rows,
      ).catch((error) => {
        if (shouldIgnoreTerminalError(error)) {
          openedSessionsRef.current.delete(key);
          return;
        }
        onDebug?.(buildErrorDebugEntry("terminal resize error", error));
      });
    };

    const observer = new ResizeObserver(() => {
      resize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    resize();

    return () => {
      observer.disconnect();
    };
  }, [activeTerminalId, activeWorkspace, hasSession, isVisible]);

  return {
    status,
    message,
    containerRef,
    hasSession,
    cleanupTerminalSession,
  };
}
