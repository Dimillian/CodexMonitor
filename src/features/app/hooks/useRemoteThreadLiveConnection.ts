import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { subscribeAppServerEvents } from "@services/events";
import { threadLiveSubscribe, threadLiveUnsubscribe } from "@services/tauri";
import {
  getAppServerParams,
  getAppServerRawMethod,
} from "@utils/appServerEvents";
import type { WorkspaceInfo } from "@/types";

export type RemoteThreadConnectionState = "live" | "polling" | "disconnected";

const SELF_DETACH_IGNORE_WINDOW_MS = 10_000;

type ReconnectOptions = {
  runResume?: boolean;
};

type UseRemoteThreadLiveConnectionOptions = {
  backendMode: string;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  activeThreadIsProcessing?: boolean;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown> | unknown;
  reconnectWorkspace?: (workspace: WorkspaceInfo) => Promise<unknown> | unknown;
};

function keyForThread(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

function splitKey(key: string): { workspaceId: string; threadId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator >= key.length - 1) {
    return null;
  }
  return {
    workspaceId: key.slice(0, separator),
    threadId: key.slice(separator + 1),
  };
}

function isThreadActivityMethod(method: string) {
  return (
    method.startsWith("item/") ||
    method.startsWith("turn/") ||
    method === "error" ||
    method === "thread/tokenUsage/updated"
  );
}

function extractThreadId(method: string, params: Record<string, unknown>): string | null {
  if (method === "turn/started" || method === "turn/completed" || method === "error") {
    const turn = (params.turn as Record<string, unknown> | undefined) ?? {};
    const fromTurn = String(turn.threadId ?? turn.thread_id ?? "").trim();
    if (fromTurn) {
      return fromTurn;
    }
  }
  const direct = String(params.threadId ?? params.thread_id ?? "").trim();
  return direct.length > 0 ? direct : null;
}

function isDocumentVisible() {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

function isWindowFocused() {
  if (typeof document === "undefined" || typeof document.hasFocus !== "function") {
    return true;
  }
  return document.hasFocus();
}

export function useRemoteThreadLiveConnection({
  backendMode,
  activeWorkspace,
  activeThreadId,
  activeThreadIsProcessing = false,
  refreshThread,
  reconnectWorkspace,
}: UseRemoteThreadLiveConnectionOptions) {
  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeWorkspaceConnected = activeWorkspace?.connected ?? false;
  const [connectionState, setConnectionState] =
    useState<RemoteThreadConnectionState>(() => {
      if (backendMode !== "remote") {
        return activeWorkspace?.connected ? "live" : "disconnected";
      }
      if (!activeWorkspace?.connected) {
        return "disconnected";
      }
      return "polling";
    });

  const backendModeRef = useRef(backendMode);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const activeThreadIdRef = useRef(activeThreadId);
  const activeThreadIsProcessingRef = useRef(activeThreadIsProcessing);
  const refreshThreadRef = useRef(refreshThread);
  const reconnectWorkspaceRef = useRef(reconnectWorkspace);
  const connectionStateRef = useRef(connectionState);
  const activeSubscriptionKeyRef = useRef<string | null>(null);
  const desiredSubscriptionKeyRef = useRef<string | null>(null);
  const ignoreDetachedEventsUntilRef = useRef<Map<string, number>>(new Map());
  const inFlightReconnectRef = useRef<{
    key: string;
    sequence: number;
    promise: Promise<boolean>;
  } | null>(null);
  const reconnectSequenceRef = useRef(0);

  useEffect(() => {
    backendModeRef.current = backendMode;
    activeWorkspaceRef.current = activeWorkspace;
    activeThreadIdRef.current = activeThreadId;
    activeThreadIsProcessingRef.current = activeThreadIsProcessing;
    refreshThreadRef.current = refreshThread;
    reconnectWorkspaceRef.current = reconnectWorkspace;
  }, [
    backendMode,
    activeWorkspace,
    activeThreadId,
    activeThreadIsProcessing,
    refreshThread,
    reconnectWorkspace,
  ]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const setState = useCallback((next: RemoteThreadConnectionState) => {
    if (connectionStateRef.current === next) {
      return;
    }
    connectionStateRef.current = next;
    setConnectionState(next);
  }, []);

  const unsubscribeByKey = useCallback(
    async (key: string) => {
      const parsed = splitKey(key);
      if (!parsed) {
        return;
      }
      await threadLiveUnsubscribe(parsed.workspaceId, parsed.threadId).catch(() => {
        // Ignore cleanup errors; foreground reattach handles recovery.
      });
    },
    [],
  );

  const reconcileDisconnectedState = useCallback(() => {
    const workspace = activeWorkspaceRef.current;
    if (backendModeRef.current !== "remote") {
      setState(workspace?.connected ? "live" : "disconnected");
      return;
    }
    if (!workspace?.connected) {
      setState("disconnected");
      return;
    }
    setState("polling");
  }, [setState]);

  const reconnectLive = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      options?: ReconnectOptions,
    ): Promise<boolean> => {
      if (
        backendModeRef.current !== "remote" ||
        !workspaceId ||
        !threadId ||
        !activeWorkspaceRef.current
      ) {
        reconcileDisconnectedState();
        return false;
      }

      const targetKey = keyForThread(workspaceId, threadId);
      desiredSubscriptionKeyRef.current = targetKey;
      const inFlightReconnect = inFlightReconnectRef.current;
      if (inFlightReconnect?.key === targetKey) {
        if (inFlightReconnect.sequence === reconnectSequenceRef.current) {
          return inFlightReconnect.promise;
        }
        // A newer sequence (blur/focus/key change) has invalidated this attempt.
        inFlightReconnectRef.current = null;
      }

      const reconnectPromise = (async (): Promise<boolean> => {
        const sequence = reconnectSequenceRef.current + 1;
        reconnectSequenceRef.current = sequence;
        const workspaceAtStart = activeWorkspaceRef.current;
        setState(workspaceAtStart?.connected ? "polling" : "disconnected");

        try {
          desiredSubscriptionKeyRef.current = targetKey;
          const workspaceEntry = activeWorkspaceRef.current;
          if (
            workspaceEntry &&
            !workspaceEntry.connected &&
            reconnectWorkspaceRef.current &&
            workspaceEntry.id === workspaceId
          ) {
            await Promise.resolve(reconnectWorkspaceRef.current(workspaceEntry));
          }
          if (sequence !== reconnectSequenceRef.current) {
            return false;
          }

          if (options?.runResume !== false) {
            await Promise.resolve(refreshThreadRef.current(workspaceId, threadId));
          }
          if (sequence !== reconnectSequenceRef.current) {
            return false;
          }

          if (activeSubscriptionKeyRef.current === targetKey) {
            ignoreDetachedEventsUntilRef.current.set(
              targetKey,
              Date.now() + SELF_DETACH_IGNORE_WINDOW_MS,
            );
            await threadLiveUnsubscribe(workspaceId, threadId).catch(() => {
              // Best-effort dedupe: ignore unsubscribe failures before reattach.
            });
            activeSubscriptionKeyRef.current = null;
          }
          await threadLiveSubscribe(workspaceId, threadId);
          if (sequence !== reconnectSequenceRef.current) {
            if (desiredSubscriptionKeyRef.current !== targetKey) {
              await threadLiveUnsubscribe(workspaceId, threadId).catch(() => {
                // Best-effort cleanup for stale reconnect attempts.
              });
            }
            return false;
          }

          activeSubscriptionKeyRef.current = targetKey;
          setState("polling");
          return true;
        } catch {
          if (sequence === reconnectSequenceRef.current) {
            reconcileDisconnectedState();
          }
          return false;
        }
      })();

      const reconnectSequence = reconnectSequenceRef.current;
      inFlightReconnectRef.current = {
        key: targetKey,
        sequence: reconnectSequence,
        promise: reconnectPromise,
      };
      reconnectPromise.finally(() => {
        if (inFlightReconnectRef.current?.promise === reconnectPromise) {
          inFlightReconnectRef.current = null;
        }
      });
      return reconnectPromise;
    },
    [reconcileDisconnectedState, setState],
  );

  useEffect(() => {
    const nextKey =
      backendMode === "remote" && activeWorkspaceId && activeThreadId
        ? keyForThread(activeWorkspaceId, activeThreadId)
        : null;
    desiredSubscriptionKeyRef.current = nextKey;
    const previousKey = activeSubscriptionKeyRef.current;

    if (previousKey && previousKey !== nextKey) {
      activeSubscriptionKeyRef.current = null;
      void unsubscribeByKey(previousKey);
    }

    if (!nextKey) {
      reconcileDisconnectedState();
      return;
    }
    if (!isDocumentVisible()) {
      reconcileDisconnectedState();
      return;
    }
    const parsed = splitKey(nextKey);
    if (!parsed) {
      reconcileDisconnectedState();
      return;
    }
    if (
      activeSubscriptionKeyRef.current === nextKey &&
      connectionStateRef.current !== "disconnected" &&
      activeWorkspaceConnected
    ) {
      return;
    }
    void reconnectLive(parsed.workspaceId, parsed.threadId, { runResume: true });
  }, [
    activeThreadId,
    activeWorkspaceConnected,
    activeWorkspaceId,
    backendMode,
    reconcileDisconnectedState,
    reconnectLive,
    unsubscribeByKey,
  ]);

  useEffect(() => {
    const unlisten = subscribeAppServerEvents((event) => {
      const method = getAppServerRawMethod(event);
      if (!method) {
        return;
      }
      const params = getAppServerParams(event);
      const activeWorkspaceEntry = activeWorkspaceRef.current;
      const activeWorkspaceId = activeWorkspaceEntry?.id ?? null;
      const selectedThreadId = activeThreadIdRef.current;
      if (!activeWorkspaceId || !selectedThreadId) {
        return;
      }
      if (event.workspace_id !== activeWorkspaceId) {
        return;
      }

      if (method === "codex/connected" && isDocumentVisible()) {
        void reconnectLive(activeWorkspaceId, selectedThreadId, { runResume: false });
        return;
      }

      if (method === "thread/live_attached") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          activeSubscriptionKeyRef.current = keyForThread(activeWorkspaceId, threadId);
          setState("polling");
        }
        return;
      }

      if (method === "thread/live_detached") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          const threadKey = keyForThread(activeWorkspaceId, threadId);
          const ignoreDetachedUntil =
            ignoreDetachedEventsUntilRef.current.get(threadKey) ?? 0;
          if (ignoreDetachedUntil > 0 && ignoreDetachedUntil >= Date.now()) {
            ignoreDetachedEventsUntilRef.current.delete(threadKey);
            return;
          }
          if (ignoreDetachedUntil > 0) {
            ignoreDetachedEventsUntilRef.current.delete(threadKey);
          }
          activeSubscriptionKeyRef.current = null;
          reconcileDisconnectedState();
          if (isDocumentVisible() && isWindowFocused()) {
            void reconnectLive(activeWorkspaceId, selectedThreadId, {
              runResume: true,
            });
          }
        }
        return;
      }

      if (method === "thread/live_heartbeat") {
        const threadId = extractThreadId(method, params);
        if (threadId === selectedThreadId) {
          setState("live");
        }
        return;
      }

      if (!isThreadActivityMethod(method)) {
        return;
      }
      const threadId = extractThreadId(method, params);
      if (threadId !== selectedThreadId) {
        return;
      }
      setState("live");
    });

    return () => {
      unlisten();
    };
  }, [reconnectLive, reconcileDisconnectedState, setState]);

  useEffect(() => {
    let unlistenWindowFocus: (() => void) | null = null;
    let unlistenWindowBlur: (() => void) | null = null;
    let didCleanup = false;

    const reconnectActiveThread = () => {
      const workspaceId = activeWorkspaceRef.current?.id ?? null;
      const threadId = activeThreadIdRef.current;
      if (!workspaceId || !threadId) {
        return;
      }
      void reconnectLive(workspaceId, threadId, { runResume: true });
    };

    const handleFocus = () => {
      if (!isDocumentVisible()) {
        return;
      }
      reconnectActiveThread();
    };

    const handleBlur = () => {
      reconnectSequenceRef.current += 1;
      desiredSubscriptionKeyRef.current = null;
      const currentKey = activeSubscriptionKeyRef.current;
      if (!currentKey) {
        return;
      }
      activeSubscriptionKeyRef.current = null;
      void unsubscribeByKey(currentKey);
      reconcileDisconnectedState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectActiveThread();
        return;
      }
      handleBlur();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    try {
      const windowHandle = getCurrentWindow();
      windowHandle
        .listen("tauri://focus", handleFocus)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowFocus = unlisten;
        })
        .catch(() => {
          // Ignore non-Tauri environments.
        });
      windowHandle
        .listen("tauri://blur", handleBlur)
        .then((unlisten) => {
          if (didCleanup) {
            unlisten();
            return;
          }
          unlistenWindowBlur = unlisten;
        })
        .catch(() => {
          // Ignore non-Tauri environments.
        });
    } catch {
      // Ignore non-Tauri environments.
    }

    return () => {
      didCleanup = true;
      if (unlistenWindowFocus) {
        unlistenWindowFocus();
      }
      if (unlistenWindowBlur) {
        unlistenWindowBlur();
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      desiredSubscriptionKeyRef.current = null;
      ignoreDetachedEventsUntilRef.current.clear();
      const currentKey = activeSubscriptionKeyRef.current;
      if (currentKey) {
        activeSubscriptionKeyRef.current = null;
        void unsubscribeByKey(currentKey);
      }
    };
  }, [reconnectLive, reconcileDisconnectedState, unsubscribeByKey]);

  return {
    connectionState,
    reconnectLive,
  };
}
