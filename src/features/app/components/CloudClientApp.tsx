import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationItem, ThreadSummary, WorkspaceInfo } from "../../../types";
import {
  cloudkitStatus,
  cloudkitTest,
  cloudkitFetchLatestRunner,
  cloudkitGetCommandResult,
  cloudkitGetSnapshot,
  cloudkitSubmitCommand,
  e2eMark,
  e2eQuit,
} from "../../../services/tauri";
import {
  globalScopeKey,
  parseCloudSnapshot,
  threadScopeKey,
  workspaceScopeKey,
  type CloudGlobalSnapshot,
  type CloudThreadSnapshot,
  type CloudWorkspaceSnapshot,
} from "../../../cloud/cloudTypes";
import {
  getCachedThreadSnapshot,
  loadCloudCache,
  writeCloudCacheGlobal,
  writeCloudCacheRunner,
  writeCloudCacheThread,
  writeCloudCacheWorkspace,
} from "../../../cloud/cloudCache";
import { Home } from "../../home/components/Home";
import { useLayoutMode } from "../../layout/hooks/useLayoutMode";
import { useResizablePanels } from "../../layout/hooks/useResizablePanels";
import { Composer } from "../../composer/components/Composer";
import { Messages } from "../../messages/components/Messages";
import { SettingsView } from "../../settings/components/SettingsView";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { buildItemsFromThread } from "../../../threads/threadItems";
import { MainHeader } from "./MainHeader";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TabletNav } from "./TabletNav";

function ensureClientId() {
  try {
    const existing = window.localStorage.getItem("cloudClientId");
    if (existing && existing.trim()) {
      return existing;
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem("cloudClientId", next);
    return next;
  } catch {
    return "ios-client";
  }
}

function isRunnerOnline(updatedAtMs: number) {
  return Date.now() - updatedAtMs < 20_000;
}

type PendingCommand = {
  id: string;
  createdAt: number;
  status: "submitting" | "waiting" | "done" | "error";
  error?: string;
};

export function CloudClientApp() {
  const { settings: appSettings, saveSettings, doctor } = useAppSettings();
  // iOS/iPadOS build: always operate in Cloud mode.
  const cloudEnabled = true;
  const {
    sidebarWidth,
    onSidebarResizeStart,
  } = useResizablePanels();
  const layoutMode = useLayoutMode();
  const isCompact = layoutMode !== "desktop";
  const isTablet = layoutMode === "tablet";
  const isPhone = layoutMode === "phone";
  const clientId = useMemo(() => ensureClientId(), []);
  const [activeTab, setActiveTab] = useState<"projects" | "codex" | "git" | "log">(
    "projects",
  );
  const tabletTab = activeTab === "projects" ? "codex" : activeTab;
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [runnerLabel, setRunnerLabel] = useState<string | null>(null);
  const [runnerOnline, setRunnerOnline] = useState(false);
  const [global, setGlobal] = useState<CloudGlobalSnapshot | null>(null);
  const [workspaceSnaps, setWorkspaceSnaps] = useState<Record<string, CloudWorkspaceSnapshot>>(
    {},
  );
  const [threadSnap, setThreadSnap] = useState<CloudThreadSnapshot | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<"read-only" | "current" | "full-access">(
    "current",
  );
  const [reduceTransparency, setReduceTransparency] = useState(() => {
    try {
      const stored = window.localStorage.getItem("reduceTransparency");
      // iOS: default to reduced transparency (no vibrancy background).
      return stored == null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const lastThreadUpdatedAt = useRef<number>(0);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [threadLoadMode, setThreadLoadMode] = useState<"idle" | "loading" | "syncing">("idle");
  const [threadLoadLabel, setThreadLoadLabel] = useState<string | null>(null);
  const e2eThreadRequested = useRef(false);
  const e2eBaseline = useRef<{ assistantCount: number } | null>(null);
  const e2eCompleted = useRef(false);
  const lastWorkspaceUpdatedAt = useRef<Record<string, number>>({});
  const lastWorkspaceFetchAt = useRef<Record<string, number>>({});
  const lastThreadFetchAt = useRef<number>(0);
  const lastSendRef = useRef<{
    workspaceId: string;
    threadId: string;
    text: string;
    atMs: number;
  } | null>(null);

  const e2eEnabled = (import.meta as any).env?.VITE_E2E === "1";
  const pollIntervalMs = useMemo(() => {
    const configured = appSettings.cloudKitPollIntervalMs;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.min(Math.max(configured, 1000), 30_000);
    }
    return 5000;
  }, [appSettings.cloudKitPollIntervalMs]);

  const restoreRequested = useRef(false);
  useEffect(() => {
    if (e2eEnabled) {
      return;
    }
    if (restoreRequested.current) {
      return;
    }
    restoreRequested.current = true;
    try {
      const storedWorkspaceId = window.localStorage.getItem("cloud.activeWorkspaceId");
      const storedThreadId = window.localStorage.getItem("cloud.activeThreadId");
      if (storedWorkspaceId) {
        setActiveWorkspaceId(storedWorkspaceId);
      }
      if (storedThreadId) {
        setActiveThreadId(storedThreadId);
      }
    } catch {
      // ignore
    }
  }, [e2eEnabled]);

  useEffect(() => {
    if (e2eEnabled) {
      return;
    }
    try {
      if (activeWorkspaceId) {
        window.localStorage.setItem("cloud.activeWorkspaceId", activeWorkspaceId);
      } else {
        window.localStorage.removeItem("cloud.activeWorkspaceId");
      }
      if (activeThreadId) {
        window.localStorage.setItem("cloud.activeThreadId", activeThreadId);
      } else {
        window.localStorage.removeItem("cloud.activeThreadId");
      }
    } catch {
      // ignore
    }
  }, [activeThreadId, activeWorkspaceId, e2eEnabled]);

  const cacheHydrated = useRef(false);
  useEffect(() => {
    if (cacheHydrated.current) {
      return;
    }
    cacheHydrated.current = true;

    const cached = loadCloudCache();
    if (!cached) {
      return;
    }

    if (cached.runner) {
      setRunnerId(cached.runner.runnerId);
      setRunnerLabel(`${cached.runner.name} (${cached.runner.platform})`);
      setRunnerOnline(isRunnerOnline(cached.runner.updatedAtMs));
    }

    if (cached.global) {
      setGlobal(cached.global);
    }

    if (Object.keys(cached.workspaces).length > 0) {
      setWorkspaceSnaps(cached.workspaces);
      const nextWorkspaceTs: Record<string, number> = {};
      Object.values(cached.workspaces).forEach((snap) => {
        nextWorkspaceTs[snap.payload.workspaceId] = snap.ts;
      });
      lastWorkspaceUpdatedAt.current = nextWorkspaceTs;
    }

    if (activeWorkspaceId && activeThreadId) {
      const cachedThread = getCachedThreadSnapshot(cached, activeWorkspaceId, activeThreadId);
      if (cachedThread) {
        lastThreadUpdatedAt.current = cachedThread.ts;
        setThreadSnap(cachedThread);
      }
    }
  }, [activeThreadId, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    if (threadSnap?.payload.threadId === activeThreadId && threadSnap.payload.workspaceId === activeWorkspaceId) {
      return;
    }
    const cached = loadCloudCache();
    const cachedThread = getCachedThreadSnapshot(cached, activeWorkspaceId, activeThreadId);
    if (!cachedThread) {
      return;
    }
    if (cachedThread.ts <= lastThreadUpdatedAt.current) {
      return;
    }
    lastThreadUpdatedAt.current = cachedThread.ts;
    setThreadSnap(cachedThread);
  }, [activeThreadId, activeWorkspaceId, threadSnap]);

  useEffect(() => {
    try {
      window.localStorage.setItem("reduceTransparency", String(reduceTransparency));
    } catch {
      // ignore
    }
  }, [reduceTransparency]);

  const submitCommand = useCallback(
    async (type: string, args: Record<string, unknown>) => {
      if (!cloudEnabled || !runnerId) {
        return null;
      }
      const commandId = crypto.randomUUID();
      await cloudkitSubmitCommand(
        runnerId,
        JSON.stringify({ commandId, clientId, type, args }),
      );
      return commandId;
    },
    [clientId, cloudEnabled, runnerId],
  );

  useEffect(() => {
    if (!cloudEnabled) {
      setRunnerId(null);
      setRunnerLabel(null);
      setRunnerOnline(false);
      setGlobal(null);
      setWorkspaceSnaps({});
      setThreadSnap(null);
      return;
    }

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        setCloudError(null);
        const runner = await cloudkitFetchLatestRunner();
        if (!runner) {
          setRunnerId(null);
          setRunnerLabel(null);
          setRunnerOnline(false);
          // Keep the last cached snapshots visible (offline-first); just mark as offline.
          return;
        }
        setRunnerId(runner.runnerId);
        setRunnerLabel(`${runner.name} (${runner.platform})`);
        setRunnerOnline(isRunnerOnline(runner.updatedAtMs));
        writeCloudCacheRunner(runner);

        let globalSnapshot: CloudGlobalSnapshot | null = null;
        const globalRecord = await cloudkitGetSnapshot(runner.runnerId, globalScopeKey());
        if (globalRecord?.payloadJson) {
          const parsed = parseCloudSnapshot<CloudGlobalSnapshot["payload"]>(globalRecord.payloadJson);
          if (parsed) {
            globalSnapshot = parsed as CloudGlobalSnapshot;
            setGlobal(globalSnapshot);
            writeCloudCacheGlobal(globalSnapshot);
          }
        }

        const workspaceIds = (globalSnapshot?.payload.workspaces ?? []).map((ws) => ws.id);
        if (workspaceIds.length > 0) {
          const now = Date.now();
          const refreshMs = Math.max(pollIntervalMs * 2, 6000);
          const idsToFetch: string[] = [];

          if (activeWorkspaceId && workspaceIds.includes(activeWorkspaceId)) {
            idsToFetch.push(activeWorkspaceId);
          } else if (workspaceIds.length > 0) {
            // Keep at least one workspace hydrated so the Projects list isn't empty.
            idsToFetch.push(workspaceIds[0]);
          }

          for (const workspaceId of workspaceIds) {
            if (idsToFetch.length >= 2) break;
            if (idsToFetch.includes(workspaceId)) continue;
            if ((lastWorkspaceUpdatedAt.current[workspaceId] ?? 0) === 0) {
              idsToFetch.push(workspaceId);
            }
          }

          const snapshots = await Promise.all(
            idsToFetch.map(async (workspaceId) => {
              try {
                const lastFetch = lastWorkspaceFetchAt.current[workspaceId] ?? 0;
                if (lastFetch && now - lastFetch < refreshMs) {
                  return null;
                }
                lastWorkspaceFetchAt.current[workspaceId] = now;
                const wsRecord = await cloudkitGetSnapshot(
                  runner.runnerId,
                  workspaceScopeKey(workspaceId),
                );
                if (!wsRecord?.payloadJson) return null;
                const parsed = parseCloudSnapshot<CloudWorkspaceSnapshot["payload"]>(
                  wsRecord.payloadJson,
                );
                if (!parsed) return null;
                const next = parsed as CloudWorkspaceSnapshot;
                const prevTs = lastWorkspaceUpdatedAt.current[workspaceId] ?? 0;
                if (next.ts <= prevTs) {
                  return null;
                }
                lastWorkspaceUpdatedAt.current[workspaceId] = next.ts;
                return next;
              } catch {
                return null;
              }
            }),
          );
          const nextById: Record<string, CloudWorkspaceSnapshot> = {};
          for (const snap of snapshots) {
            if (!snap) continue;
            nextById[snap.payload.workspaceId] = snap;
            writeCloudCacheWorkspace(snap);
          }
          if (Object.keys(nextById).length > 0) {
            setWorkspaceSnaps((prev) => ({ ...prev, ...nextById }));
          }
        }

        if (activeWorkspaceId && activeThreadId) {
          const now = Date.now();
          const refreshMs =
            threadLoadMode !== "idle" || pendingCommand?.status === "waiting"
              ? pollIntervalMs
              : Math.max(pollIntervalMs * 2, 8000);
          if (now - lastThreadFetchAt.current >= refreshMs) {
            lastThreadFetchAt.current = now;
            const thRecord = await cloudkitGetSnapshot(
              runner.runnerId,
              threadScopeKey(activeWorkspaceId, activeThreadId),
            );
            if (thRecord?.payloadJson) {
              const parsed = parseCloudSnapshot<CloudThreadSnapshot["payload"]>(thRecord.payloadJson);
              if (parsed) {
                const next = parsed as CloudThreadSnapshot;
                if (next.ts > lastThreadUpdatedAt.current) {
                  lastThreadUpdatedAt.current = next.ts;
                  setThreadSnap(next);
                  writeCloudCacheThread(next);
                  setThreadLoadMode("idle");
                  setThreadLoadLabel(null);
                }
              }
            }
          }
        } else {
          setThreadSnap(null);
        }
      } catch {
        // ignore; we'll retry on next tick
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), pollIntervalMs);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, pendingCommand?.status, pollIntervalMs, threadLoadMode]);

  useEffect(() => {
    if (!cloudEnabled) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        await cloudkitStatus();
      } catch (error) {
        if (!active) return;
        setCloudError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [cloudEnabled]);

  const workspaces: WorkspaceInfo[] = global?.payload.workspaces ?? [];

  const activeWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  useEffect(() => {
    if (e2eEnabled) {
      return;
    }
    if (!activeWorkspaceId) {
      return;
    }
    if (!workspaces.length) {
      return;
    }
    const exists = workspaces.some((ws) => ws.id === activeWorkspaceId);
    if (!exists) {
      setActiveWorkspaceId(null);
      setActiveThreadId(null);
    }
  }, [activeWorkspaceId, e2eEnabled, workspaces]);

  const threads = activeWorkspaceId ? (workspaceSnaps[activeWorkspaceId]?.payload.threads ?? []) : [];

  useEffect(() => {
    if (e2eEnabled) {
      return;
    }
    if (!activeWorkspaceId) {
      return;
    }
    if (!activeThreadId) {
      return;
    }
    if (threads.length === 0) {
      return;
    }
    const exists = threads.some((t) => t.id === activeThreadId);
    if (!exists) {
      setActiveThreadId(null);
    }
  }, [activeThreadId, activeWorkspaceId, e2eEnabled, threads]);

  const activeItems: ConversationItem[] = useMemo(() => {
    if (!threadSnap || threadSnap.payload.threadId !== activeThreadId) {
      return [];
    }
    const items = Array.isArray(threadSnap.payload.items) ? threadSnap.payload.items : null;
    if (items && items.length) {
      return items;
    }
    const thread = threadSnap.payload.thread as Record<string, unknown> | null | undefined;
    if (thread && typeof thread === "object") {
      return buildItemsFromThread(thread);
    }
    return [];
  }, [activeThreadId, threadSnap]);

  useEffect(() => {
    if (!activeThreadId) {
      if (threadLoadMode !== "idle") {
        setThreadLoadMode("idle");
        setThreadLoadLabel(null);
      }
      return;
    }
    if (threadLoadMode === "loading" && activeItems.length > 0) {
      setThreadLoadMode("idle");
      setThreadLoadLabel(null);
    }
  }, [activeItems.length, activeThreadId, threadLoadMode]);

  useEffect(() => {
    if (threadLoadMode !== "syncing") {
      return;
    }
    if (!activeThreadId) {
      return;
    }
    if (activeItems.length === 0) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setThreadLoadMode("idle");
      setThreadLoadLabel(null);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [activeItems.length, activeThreadId, threadLoadMode]);

  const canSend = Boolean(
    cloudEnabled && runnerId && runnerOnline && activeWorkspaceId && activeThreadId,
  );

  const handleSelectWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      setActiveThreadId(null);
      setThreadLoadMode("idle");
      setThreadLoadLabel(null);
      lastThreadFetchAt.current = 0;
      if (isCompact) {
        setActiveTab("codex");
      }
      if (runnerId && cloudEnabled) {
        void submitCommand("connectWorkspace", { workspaceId: id });
        void (async () => {
          try {
            const wsRecord = await cloudkitGetSnapshot(runnerId, workspaceScopeKey(id));
            if (!wsRecord?.payloadJson) return;
            const parsed = parseCloudSnapshot<CloudWorkspaceSnapshot["payload"]>(wsRecord.payloadJson);
            if (!parsed) return;
            const next = parsed as CloudWorkspaceSnapshot;
            const prevTs = lastWorkspaceUpdatedAt.current[id] ?? 0;
            if (next.ts <= prevTs) return;
            lastWorkspaceUpdatedAt.current[id] = next.ts;
            setWorkspaceSnaps((prev) => ({ ...prev, [id]: next }));
            writeCloudCacheWorkspace(next);
          } catch {
            // ignore; poller will retry.
          }
        })();
      }
    },
    [cloudEnabled, isCompact, runnerId, submitCommand],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      lastThreadFetchAt.current = 0;
      if (activeWorkspaceId) {
        const cached = loadCloudCache();
        const cachedThread = getCachedThreadSnapshot(cached, activeWorkspaceId, threadId);
        const hasCachedItems = Boolean(
          cachedThread &&
            Array.isArray(cachedThread.payload.items) &&
            cachedThread.payload.items.length > 0,
        );
        if (cachedThread && cachedThread.ts > lastThreadUpdatedAt.current) {
          lastThreadUpdatedAt.current = cachedThread.ts;
          setThreadSnap(cachedThread);
        }
        setThreadLoadMode(hasCachedItems ? "syncing" : "loading");
        setThreadLoadLabel(hasCachedItems ? "Syncing from iCloud…" : "Loading conversation…");
      } else {
        setThreadLoadMode("loading");
        setThreadLoadLabel("Loading conversation…");
      }
      if (isCompact) {
        setActiveTab("codex");
      }
      if (runnerId && cloudEnabled && activeWorkspaceId) {
        void submitCommand("resumeThread", { workspaceId: activeWorkspaceId, threadId });
        void (async () => {
          try {
            const record = await cloudkitGetSnapshot(
              runnerId,
              threadScopeKey(activeWorkspaceId, threadId),
            );
            if (!record?.payloadJson) return;
            const parsed = parseCloudSnapshot<CloudThreadSnapshot["payload"]>(record.payloadJson);
            if (!parsed) return;
            const next = parsed as CloudThreadSnapshot;
            if (next.ts > lastThreadUpdatedAt.current) {
              lastThreadUpdatedAt.current = next.ts;
              setThreadSnap(next);
              writeCloudCacheThread(next);
            }
          } catch {
            // ignore; poller will retry.
          }
        })();
      }
    },
    [activeWorkspaceId, cloudEnabled, isCompact, runnerId, submitCommand],
  );

  const handleSend = useCallback(async (text: string) => {
    if (!canSend || !runnerId || !activeWorkspaceId || !activeThreadId) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    const now = Date.now();
    const lastSend = lastSendRef.current;
    if (
      lastSend &&
      lastSend.workspaceId === activeWorkspaceId &&
      lastSend.threadId === activeThreadId &&
      lastSend.text === trimmed &&
      now - lastSend.atMs < 1500
    ) {
      return;
    }
    lastSendRef.current = {
      workspaceId: activeWorkspaceId,
      threadId: activeThreadId,
      text: trimmed,
      atMs: now,
    };

    const commandId = crypto.randomUUID();
    setPendingCommand({ id: commandId, createdAt: Date.now(), status: "submitting" });
    try {
      await cloudkitSubmitCommand(
        runnerId,
        JSON.stringify({
          commandId,
          clientId,
          type: "sendUserMessage",
          args: {
            workspaceId: activeWorkspaceId,
            threadId: activeThreadId,
            text: trimmed,
            accessMode,
          },
        }),
      );
      setPendingCommand((prev) => (prev ? { ...prev, status: "waiting" } : prev));
    } catch (error) {
      setPendingCommand({
        id: commandId,
        createdAt: Date.now(),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [accessMode, activeThreadId, activeWorkspaceId, canSend, clientId, runnerId]);

  useEffect(() => {
    if (!pendingCommand || pendingCommand.status !== "waiting" || !runnerId) {
      return;
    }
    let stopped = false;
    const interval = window.setInterval(() => {
      void (async () => {
        if (stopped) return;
        const result = await cloudkitGetCommandResult(runnerId, pendingCommand.id);
        if (!result) return;
        setPendingCommand((prev) => {
          if (!prev || prev.id !== pendingCommand.id) return prev;
          return result.ok
            ? { ...prev, status: "done" }
            : { ...prev, status: "error", error: result.payloadJson || "Command failed" };
        });
      })();
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pendingCommand, runnerId]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerId || !runnerOnline || !workspaces.length) {
      return;
    }
    // One-shot E2E: select first workspace/thread and send a joke prompt.
    if (activeWorkspaceId && activeThreadId) {
      return;
    }
    const ws = workspaces[0];
    handleSelectWorkspace(ws.id);
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, handleSelectWorkspace, runnerId, runnerOnline, workspaces]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerOnline) return;
    if (!activeWorkspaceId) return;
    if (!threads.length) return;
    if (activeThreadId) return;
    handleSelectThread(threads[0].id);
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, handleSelectThread, runnerOnline, threads]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerOnline) return;
    if (!activeWorkspaceId) return;
    if (activeThreadId) return;
    if (threads.length) return;
    if (pendingCommand) return;
    if (e2eThreadRequested.current) return;

    e2eThreadRequested.current = true;
    window.setTimeout(() => {
      if (!runnerOnline || !runnerId) return;
      void submitCommand("startThread", { workspaceId: activeWorkspaceId });
    }, 1500);
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, pendingCommand, runnerId, runnerOnline, submitCommand, threads.length]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerOnline) return;
    if (!activeWorkspaceId || !activeThreadId) return;
    if (pendingCommand) return;
    if (!e2eBaseline.current) {
      e2eBaseline.current = {
        assistantCount: activeItems.filter(
          (item) => item.kind === "message" && item.role === "assistant",
        ).length,
      };
    }
    void handleSend("Erzähl mir einen kurzen Witz.");
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, handleSend, pendingCommand, runnerOnline]);

  useEffect(() => {
    if (!e2eEnabled || e2eCompleted.current) return;
    if (!e2eBaseline.current) return;
    if (!pendingCommand || pendingCommand.status !== "done") return;

    const currentAssistantCount = activeItems.filter(
      (item) => item.kind === "message" && item.role === "assistant",
    ).length;
    if (currentAssistantCount <= e2eBaseline.current.assistantCount) return;

    e2eCompleted.current = true;
    void e2eMark("success: received assistant response");
    window.setTimeout(() => void e2eQuit(), 750);
  }, [activeItems, e2eEnabled, pendingCommand]);

  const headerHint = cloudError
    ? cloudError
    : !runnerId
      ? "Waiting for a running CodexMonitor on your iCloud…"
      : !runnerOnline
        ? "CodexMonitor on Mac seems offline. Start it to sync projects."
        : null;

  const threadsByWorkspace = useMemo(() => {
    const map: Record<string, ThreadSummary[]> = {};
    Object.entries(workspaceSnaps).forEach(([workspaceId, snap]) => {
      map[workspaceId] = snap.payload.threads ?? [];
    });
    return map;
  }, [workspaceSnaps]);

  const threadStatusById = useMemo(() => {
    const merged: Record<
      string,
      { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
    > = {};
    Object.values(workspaceSnaps).forEach((snap) => {
      Object.entries(snap.payload.threadStatusById ?? {}).forEach(([id, status]) => {
        merged[id] = status;
      });
    });
    return merged;
  }, [workspaceSnaps]);

  const threadListLoadingByWorkspace = useMemo(() => {
    const next: Record<string, boolean> = {};
    workspaces.forEach((ws) => {
      if (!runnerOnline) {
        next[ws.id] = false;
      } else {
        next[ws.id] = workspaceSnaps[ws.id] == null;
      }
    });
    return next;
  }, [runnerOnline, workspaceSnaps, workspaces]);

  useEffect(() => {
    if (!isPhone) {
      return;
    }
    if (!activeWorkspace && activeTab !== "projects") {
      setActiveTab("projects");
    }
  }, [activeTab, activeWorkspace, isPhone]);

  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects") {
      setActiveTab("codex");
    }
  }, [activeTab, isTablet]);

  const showHome = !activeWorkspace;
  const isThinking =
    Boolean(pendingCommand && pendingCommand.status === "waiting") ||
    Boolean(activeThreadId && threadStatusById[activeThreadId]?.isProcessing);

  const sidebarNode = (
    <Sidebar
      workspaces={workspaces}
      threadsByWorkspace={threadsByWorkspace}
      threadStatusById={threadStatusById}
      threadListLoadingByWorkspace={threadListLoadingByWorkspace}
      activeWorkspaceId={activeWorkspaceId}
      activeThreadId={activeThreadId}
      accountRateLimits={null}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenDebug={() => {
        alert("Debug view is not available in Cloud mode yet.");
      }}
      hasDebugAlerts={false}
      onAddWorkspace={() => {
        alert("Add workspaces from the Mac app. The iOS app is read-only.");
      }}
      onSelectHome={() => {
        setActiveWorkspaceId(null);
        setActiveThreadId(null);
        if (isCompact) {
          setActiveTab("projects");
        }
      }}
      onSelectWorkspace={(workspaceId) => {
        handleSelectWorkspace(workspaceId);
      }}
      onConnectWorkspace={(workspace) => {
        void submitCommand("connectWorkspace", { workspaceId: workspace.id });
      }}
      onAddAgent={(workspace) => {
        setActiveWorkspaceId(workspace.id);
        setActiveThreadId(null);
        if (isCompact) {
          setActiveTab("codex");
        }
        void submitCommand("startThread", { workspaceId: workspace.id });
      }}
      onAddWorktreeAgent={() => {
        alert("Worktree agents are not available from iOS yet.");
      }}
      onToggleWorkspaceCollapse={() => {}}
      onSelectThread={(workspaceId, threadId) => {
        if (workspaceId !== activeWorkspaceId) {
          handleSelectWorkspace(workspaceId);
        }
        handleSelectThread(threadId);
      }}
      onDeleteThread={() => {
        alert("Archiving threads from iOS is not available yet.");
      }}
      onDeleteWorkspace={() => {
        alert("Workspace deletion is not available from iOS.");
      }}
      onDeleteWorktree={() => {}}
    />
  );

  const messagesNode = (
    <Messages
      items={activeItems}
      threadId={activeThreadId}
      isThinking={isThinking}
      processingStartedAt={pendingCommand?.createdAt ?? null}
      loadingMode={threadLoadMode === "idle" ? null : threadLoadMode}
      loadingLabel={threadLoadLabel}
    />
  );

  const composerNode = (
    <Composer
      onSend={(text, _images) => void handleSend(text)}
      onStop={() => {}}
      canStop={false}
      disabled={!canSend}
      models={[]}
      selectedModelId={null}
      onSelectModel={() => {}}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={() => {}}
      accessMode={accessMode}
      onSelectAccessMode={setAccessMode}
      skills={[]}
      prompts={[]}
      files={[]}
    />
  );

  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${reduceTransparency ? " reduced-transparency" : ""}`;

  const tabletNavTab: "codex" | "git" | "log" =
    tabletTab === "git" ? "git" : tabletTab === "log" ? "log" : "codex";

  const tabletLayout = (
    <>
      <TabletNav activeTab={tabletNavTab} onSelect={setActiveTab} />
      <div className="tablet-projects">{sidebarNode}</div>
      <div
        className="projects-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize projects"
        onMouseDown={onSidebarResizeStart}
        onPointerDown={onSidebarResizeStart}
      />
      <section className="tablet-main">
        {headerHint && (
          <div className="update-toast" role="status">
            <div className="update-toast-title">Cloud</div>
            <div className="update-toast-body">{headerHint}</div>
          </div>
        )}
        {runnerLabel && (
          <div className="update-toast" role="status">
            <div className="update-toast-body">
              {runnerLabel} · {runnerOnline ? "online" : "offline"}
            </div>
          </div>
        )}
        {showHome ? (
          <Home
            onOpenProject={() =>
              alert("Add workspaces from the Mac app. The iOS app is read-only.")
            }
            onAddWorkspace={() =>
              alert("Add workspaces from the Mac app. The iOS app is read-only.")
            }
            onCloneRepository={() => {}}
          />
        ) : (
          <>
            <div className="main-topbar tablet-topbar" data-tauri-drag-region>
              <div className="main-topbar-left">
                <MainHeader
                  workspace={activeWorkspace}
                  branchName={"cloud"}
                  branches={[]}
                  onCheckoutBranch={() => {}}
                  onCreateBranch={() => {}}
                  readonly
                />
              </div>
              <div className="actions" />
            </div>
            {tabletTab === "codex" && (
              <>
                <div className="content tablet-content">{messagesNode}</div>
                {composerNode}
              </>
            )}
            {tabletTab !== "codex" && (
              <div className="compact-empty">
                <h3>Not available</h3>
                <p>This tab is not available in Cloud mode yet.</p>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );

  const phoneLayout = (
    <div className="compact-shell">
      {headerHint && (
        <div className="update-toast" role="status">
          <div className="update-toast-title">Cloud</div>
          <div className="update-toast-body">{headerHint}</div>
        </div>
      )}
      {runnerLabel && (
        <div className="update-toast" role="status">
          <div className="update-toast-body">
            {runnerLabel} · {runnerOnline ? "online" : "offline"}
          </div>
        </div>
      )}
      {activeTab === "projects" && <div className="compact-panel">{sidebarNode}</div>}
      {activeTab === "codex" && (
        <div className="compact-panel">
          {activeWorkspace ? (
            <>
              <div className="main-topbar compact-topbar" data-tauri-drag-region>
                <div className="main-topbar-left">
                  <MainHeader
                    workspace={activeWorkspace}
                    branchName={"cloud"}
                    branches={[]}
                    onCheckoutBranch={() => {}}
                    onCreateBranch={() => {}}
                    readonly
                  />
                </div>
                <div className="actions" />
              </div>
              <div className="content compact-content">{messagesNode}</div>
              {composerNode}
            </>
          ) : (
            <div className="compact-empty">
              <h3>No workspace selected</h3>
              <p>Choose a project to start chatting.</p>
              <button className="ghost" onClick={() => setActiveTab("projects")}>
                Go to Projects
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab !== "projects" && activeTab !== "codex" && (
        <div className="compact-panel">
          <div className="compact-empty">
            <h3>Not available</h3>
            <p>This tab is not available in Cloud mode yet.</p>
          </div>
        </div>
      )}
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />
    </div>
  );

  return (
    <div
      className={appClassName}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as React.CSSProperties
      }
    >
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      {isPhone ? phoneLayout : isTablet ? tabletLayout : tabletLayout}
      {settingsOpen ? (
        <SettingsView
          workspaces={workspaces}
          onClose={() => setSettingsOpen(false)}
          onMoveWorkspace={() => {}}
          onDeleteWorkspace={() => {}}
          reduceTransparency={reduceTransparency}
          onToggleTransparency={setReduceTransparency}
          appSettings={appSettings}
          onUpdateAppSettings={async (next) => {
            await saveSettings(next);
          }}
          onRunDoctor={doctor}
          onCloudKitStatus={cloudkitStatus}
          onCloudKitTest={cloudkitTest}
          onUpdateWorkspaceCodexBin={async () => {}}
          scaleShortcutTitle=""
          scaleShortcutText=""
          onTestNotificationSound={() => {}}
        />
      ) : null}
    </div>
  );
}
