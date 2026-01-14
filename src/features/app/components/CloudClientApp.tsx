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
import { pushCloudTelemetry } from "../../../cloud/cloudTelemetry";
import { Home } from "../../home/components/Home";
import { useLayoutMode } from "../../layout/hooks/useLayoutMode";
import { useResizablePanels } from "../../layout/hooks/useResizablePanels";
import { Composer } from "../../composer/components/Composer";
import { Messages } from "../../messages/components/Messages";
import { SettingsView } from "../../settings/components/SettingsView";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { buildItemsFromThread } from "../../../utils/threadItems";
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
  phase: "submitting" | "waitingResult" | "waitingReply" | "error";
  resultPayloadJson?: string | null;
  error?: string;
};

type AwaitingReply = {
  commandId: string;
  workspaceId: string;
  threadId: string;
  startedAtMs: number;
  baselineAssistantCount: number;
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
  const [pendingByThreadKey, setPendingByThreadKey] = useState<Record<string, PendingCommand>>(
    {},
  );
  const pendingByThreadKeyRef = useRef(pendingByThreadKey);
  useEffect(() => {
    pendingByThreadKeyRef.current = pendingByThreadKey;
  }, [pendingByThreadKey]);

  const [awaitingByThreadKey, setAwaitingByThreadKey] = useState<Record<string, AwaitingReply>>(
    {},
  );
  const awaitingByThreadKeyRef = useRef(awaitingByThreadKey);
  useEffect(() => {
    awaitingByThreadKeyRef.current = awaitingByThreadKey;
  }, [awaitingByThreadKey]);

  const [localItemsByThreadKey, setLocalItemsByThreadKey] = useState<
    Record<string, ConversationItem[]>
  >({});
  const lastThreadUpdatedAtByKey = useRef<Record<string, number>>({});
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [threadLoadMode, setThreadLoadMode] = useState<"idle" | "loading" | "syncing">("idle");
  const [threadLoadLabel, setThreadLoadLabel] = useState<string | null>(null);
  const e2eThreadRequested = useRef(false);
  const e2eBaseline = useRef<{ assistantCount: number } | null>(null);
  const e2eCompleted = useRef(false);
  const lastWorkspaceUpdatedAt = useRef<Record<string, number>>({});
  const lastWorkspaceFetchAt = useRef<Record<string, number>>({});
  const lastThreadFetchAt = useRef<number>(0);
  const lastBackgroundThreadFetchAtByKey = useRef<Record<string, number>>({});
  const lastSendRef = useRef<{
    workspaceId: string;
    threadId: string;
    text: string;
    atMs: number;
  } | null>(null);

  const threadKey = useCallback((workspaceId: string, threadId: string) => {
    return `${workspaceId}::${threadId}`;
  }, []);

  const activeThreadKey = useMemo(() => {
    if (!activeWorkspaceId || !activeThreadId) return null;
    return threadKey(activeWorkspaceId, activeThreadId);
  }, [activeThreadId, activeWorkspaceId, threadKey]);

  const activePending = useMemo(() => {
    if (!activeThreadKey) return null;
    return pendingByThreadKey[activeThreadKey] ?? null;
  }, [activeThreadKey, pendingByThreadKey]);

  const activeAwaiting = useMemo(() => {
    if (!activeThreadKey) return null;
    return awaitingByThreadKey[activeThreadKey] ?? null;
  }, [activeThreadKey, awaitingByThreadKey]);

  const countAssistantMessages = useCallback((items: ConversationItem[]) => {
    return items.filter((item) => item.kind === "message" && item.role === "assistant").length;
  }, []);

  const reconcileLocalItems = useCallback(
    (key: string, snapshotItems: ConversationItem[]) => {
      setLocalItemsByThreadKey((prev) => {
        const local = prev[key];
        if (!local || local.length === 0) return prev;

        // Drop local items that are already present in the snapshot (exact role+text match).
        const snapshotSigs = new Set(
          snapshotItems
            .filter((item) => item.kind === "message")
            .map((item) => `${item.kind}:${(item as any).role}:${(item as any).text}`),
        );
        const filtered = local.filter((item) => {
          if (item.kind !== "message") return true;
          const sig = `${item.kind}:${(item as any).role}:${(item as any).text}`;
          return !snapshotSigs.has(sig);
        });
        if (filtered.length === local.length) return prev;
        const next = { ...prev };
        if (filtered.length) {
          next[key] = filtered;
        } else {
          delete next[key];
        }
        return next;
      });
    },
    [],
  );

  const applyAwaitingResolutionFromItems = useCallback(
    (key: string, workspaceId: string, threadId: string, items: ConversationItem[]) => {
      const awaiting = awaitingByThreadKeyRef.current[key];
      if (!awaiting) return;
      const assistantCount = countAssistantMessages(items);
      if (assistantCount > awaiting.baselineAssistantCount) {
        pushCloudTelemetry({
          event: "reply.seen",
          fromCache: false,
          workspaceId,
          threadId,
          commandId: awaiting.commandId,
          note: `assistant+${assistantCount - awaiting.baselineAssistantCount}`,
        });
        setAwaitingByThreadKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setPendingByThreadKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [countAssistantMessages],
  );

  const e2eEnabled = (import.meta as any).env?.VITE_E2E === "1";
  const pollIntervalMs = useMemo(() => {
    const configured = appSettings.cloudKitPollIntervalMs;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return Math.min(Math.max(configured, 1000), 30_000);
    }
    return 5000;
  }, [appSettings.cloudKitPollIntervalMs]);

  const shouldFastPollActiveThread =
    Boolean(activeAwaiting) || Boolean(activePending && activePending.phase !== "error");

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
      pushCloudTelemetry({ event: "cache.hydrate", fromCache: false, note: "empty" });
      return;
    }

    pushCloudTelemetry({
      event: "cache.hydrate",
      fromCache: true,
      note: `ws=${Object.keys(cached.workspaces).length} th=${Object.keys(cached.threads).length}`,
    });

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
        const key = threadKey(activeWorkspaceId, activeThreadId);
        lastThreadUpdatedAtByKey.current[key] = cachedThread.ts;
        setThreadSnap(cachedThread);
        pushCloudTelemetry({
          event: "thread.apply",
          fromCache: true,
          workspaceId: activeWorkspaceId,
          threadId: activeThreadId,
          note: `ts=${cachedThread.ts}`,
        });
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
    const key = threadKey(activeWorkspaceId, activeThreadId);
    const prevTs = lastThreadUpdatedAtByKey.current[key] ?? 0;
    if (cachedThread.ts <= prevTs) {
      return;
    }
    lastThreadUpdatedAtByKey.current[key] = cachedThread.ts;
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
      pushCloudTelemetry({
        event: "command.submit",
        commandId,
        workspaceId:
          typeof (args as any).workspaceId === "string" ? ((args as any).workspaceId as string) : undefined,
        threadId:
          typeof (args as any).threadId === "string" ? ((args as any).threadId as string) : undefined,
        note: type,
      });
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
        const globalScope = globalScopeKey();
        const globalFetchStart = performance.now();
        const globalRecord = await cloudkitGetSnapshot(runner.runnerId, globalScope);
        pushCloudTelemetry({
          event: "snapshot.fetch",
          scopeKey: globalScope,
          fromCache: false,
          durationMs: performance.now() - globalFetchStart,
        });
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
                const scopeKey = workspaceScopeKey(workspaceId);
                const wsFetchStart = performance.now();
                const wsRecord = await cloudkitGetSnapshot(runner.runnerId, scopeKey);
                pushCloudTelemetry({
                  event: "snapshot.fetch",
                  scopeKey,
                  workspaceId,
                  fromCache: false,
                  durationMs: performance.now() - wsFetchStart,
                });
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
            threadLoadMode !== "idle" || shouldFastPollActiveThread
              ? pollIntervalMs
              : Math.max(pollIntervalMs * 2, 8000);
          if (now - lastThreadFetchAt.current >= refreshMs) {
            lastThreadFetchAt.current = now;
            const scopeKey = threadScopeKey(activeWorkspaceId, activeThreadId);
            const thFetchStart = performance.now();
            const thRecord = await cloudkitGetSnapshot(runner.runnerId, scopeKey);
            pushCloudTelemetry({
              event: "snapshot.fetch",
              scopeKey,
              workspaceId: activeWorkspaceId,
              threadId: activeThreadId,
              fromCache: false,
              durationMs: performance.now() - thFetchStart,
            });
            if (thRecord?.payloadJson) {
              const parsed = parseCloudSnapshot<CloudThreadSnapshot["payload"]>(thRecord.payloadJson);
              if (parsed) {
                const next = parsed as CloudThreadSnapshot;
                const key = threadKey(activeWorkspaceId, activeThreadId);
                const prevTs = lastThreadUpdatedAtByKey.current[key] ?? 0;
                if (next.ts > prevTs) {
                  lastThreadUpdatedAtByKey.current[key] = next.ts;
                  setThreadSnap(next);
                  writeCloudCacheThread(next);
                  const nextItems = Array.isArray(next.payload.items) ? (next.payload.items as ConversationItem[]) : [];
                  if (nextItems.length) {
                    reconcileLocalItems(key, nextItems);
                    applyAwaitingResolutionFromItems(key, activeWorkspaceId, activeThreadId, nextItems);
                  }
                  setThreadLoadMode("idle");
                  setThreadLoadLabel(null);
                }
              }
            }
          }
          // Background: keep polling any other threads that are awaiting a reply so we can
          // clear spinners even if the user navigates away.
          const awaitingKeys = Object.keys(awaitingByThreadKeyRef.current);
          if (awaitingKeys.length > 0) {
            for (const key of awaitingKeys) {
              if (key === threadKey(activeWorkspaceId, activeThreadId)) continue;
              const last = lastBackgroundThreadFetchAtByKey.current[key] ?? 0;
              if (now - last < pollIntervalMs) continue;
              lastBackgroundThreadFetchAtByKey.current[key] = now;
              const [wsId, thId] = key.split("::");
              if (!wsId || !thId) continue;
              const bgScopeKey = threadScopeKey(wsId, thId);
              const bgFetchStart = performance.now();
              try {
                const record = await cloudkitGetSnapshot(runner.runnerId, bgScopeKey);
                pushCloudTelemetry({
                  event: "snapshot.fetch",
                  scopeKey: bgScopeKey,
                  workspaceId: wsId,
                  threadId: thId,
                  fromCache: false,
                  durationMs: performance.now() - bgFetchStart,
                  note: "thread(background)",
                });
                if (!record?.payloadJson) break;
                const parsed = parseCloudSnapshot<CloudThreadSnapshot["payload"]>(record.payloadJson);
                if (!parsed) break;
                const next = parsed as CloudThreadSnapshot;
                const prevTs = lastThreadUpdatedAtByKey.current[key] ?? 0;
                if (next.ts > prevTs) {
                  lastThreadUpdatedAtByKey.current[key] = next.ts;
                  writeCloudCacheThread(next);
                  const nextItems = Array.isArray(next.payload.items) ? (next.payload.items as ConversationItem[]) : [];
                  if (nextItems.length) {
                    reconcileLocalItems(key, nextItems);
                    applyAwaitingResolutionFromItems(key, wsId, thId, nextItems);
                  }
                }
              } catch {
                pushCloudTelemetry({
                  event: "snapshot.fetch.error",
                  scopeKey: bgScopeKey,
                  workspaceId: wsId,
                  threadId: thId,
                  fromCache: false,
                  durationMs: performance.now() - bgFetchStart,
                  note: "thread(background)",
                });
              }
              break;
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
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, pollIntervalMs, shouldFastPollActiveThread, threadKey, threadLoadMode, applyAwaitingResolutionFromItems, reconcileLocalItems]);

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
    const baseItems =
      items && items.length
        ? (items as ConversationItem[])
        : (() => {
            const thread = threadSnap.payload.thread as Record<string, unknown> | null | undefined;
            if (thread && typeof thread === "object") {
              return buildItemsFromThread(thread);
            }
            return [];
          })();

    if (!activeThreadKey) {
      return baseItems;
    }
    const localItems = localItemsByThreadKey[activeThreadKey] ?? [];
    if (!localItems.length) {
      return baseItems;
    }

    // Append local items (optimistic user/assistant messages) if they aren't already present.
    const baseSigs = new Set(
      baseItems
        .filter((item) => item.kind === "message")
        .map((item) => `${item.kind}:${(item as any).role}:${(item as any).text}`),
    );
    const merged = baseItems.slice();
    for (const item of localItems) {
      if (item.kind === "message") {
        const sig = `${item.kind}:${(item as any).role}:${(item as any).text}`;
        if (baseSigs.has(sig)) continue;
        baseSigs.add(sig);
      }
      merged.push(item);
    }
    return merged;
  }, [activeThreadId, activeThreadKey, localItemsByThreadKey, threadSnap]);

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
      // Avoid flicker: keep the sync badge visible longer, because CloudKit snapshots can lag.
      // The poller or a direct fetch will clear it earlier once a newer snapshot arrives.
      setThreadLoadMode((mode) => (mode === "syncing" ? "idle" : mode));
      setThreadLoadLabel(null);
    }, 12_000);
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
          const scopeKey = workspaceScopeKey(id);
          const fetchStart = performance.now();
          try {
            const wsRecord = await cloudkitGetSnapshot(runnerId, scopeKey);
            pushCloudTelemetry({
              event: "snapshot.fetch",
              scopeKey,
              workspaceId: id,
              fromCache: false,
              durationMs: performance.now() - fetchStart,
              note: "workspace(select)",
            });
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
            pushCloudTelemetry({
              event: "snapshot.fetch.error",
              scopeKey,
              workspaceId: id,
              fromCache: false,
              durationMs: performance.now() - fetchStart,
              note: "workspace(select)",
            });
            // ignore; poller will retry.
          }
        })();
      }
    },
    [cloudEnabled, isCompact, runnerId, submitCommand],
  );

  const handleSelectThread = useCallback(
    (workspaceId: string, threadId: string) => {
      if (activeWorkspaceId !== workspaceId) {
        setActiveWorkspaceId(workspaceId);
      }
      setActiveThreadId(threadId);
      lastThreadFetchAt.current = 0;
      if (workspaceId) {
        const cached = loadCloudCache();
        const cachedThread = getCachedThreadSnapshot(cached, workspaceId, threadId);
        const hasCachedItems = Boolean(
          cachedThread &&
            Array.isArray(cachedThread.payload.items) &&
            cachedThread.payload.items.length > 0,
        );
        pushCloudTelemetry({
          event: "thread.cache",
          fromCache: hasCachedItems,
          workspaceId,
          threadId,
        });
        if (cachedThread) {
          const key = threadKey(workspaceId, threadId);
          const prevTs = lastThreadUpdatedAtByKey.current[key] ?? 0;
          if (cachedThread.ts > prevTs) {
            lastThreadUpdatedAtByKey.current[key] = cachedThread.ts;
          }
          setThreadSnap(cachedThread);
          pushCloudTelemetry({
            event: "thread.apply",
            fromCache: true,
            workspaceId,
            threadId,
            note: `ts=${cachedThread.ts}`,
          });
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
      if (runnerId && cloudEnabled && workspaceId) {
        void submitCommand("resumeThread", { workspaceId, threadId });
        void (async () => {
          const scopeKey = threadScopeKey(workspaceId, threadId);
          const fetchStart = performance.now();
          try {
            const record = await cloudkitGetSnapshot(runnerId, scopeKey);
            pushCloudTelemetry({
              event: "snapshot.fetch",
              scopeKey,
              workspaceId,
              threadId,
              fromCache: false,
              durationMs: performance.now() - fetchStart,
              note: "thread(select)",
            });
            if (!record?.payloadJson) return;
            const parsed = parseCloudSnapshot<CloudThreadSnapshot["payload"]>(record.payloadJson);
            if (!parsed) return;
            const next = parsed as CloudThreadSnapshot;
            const key = threadKey(workspaceId, threadId);
            const prevTs = lastThreadUpdatedAtByKey.current[key] ?? 0;
            if (next.ts > prevTs) {
              lastThreadUpdatedAtByKey.current[key] = next.ts;
              setThreadSnap(next);
              writeCloudCacheThread(next);
            }
          } catch {
            pushCloudTelemetry({
              event: "snapshot.fetch.error",
              scopeKey,
              workspaceId,
              threadId,
              fromCache: false,
              durationMs: performance.now() - fetchStart,
              note: "thread(select)",
            });
            // ignore; poller will retry.
          }
        })();
      }
    },
    [activeWorkspaceId, cloudEnabled, isCompact, runnerId, submitCommand, threadKey],
  );

  const handleSend = useCallback(async (text: string) => {
    if (!canSend || !runnerId || !activeWorkspaceId || !activeThreadId) {
      return;
    }
    const key = threadKey(activeWorkspaceId, activeThreadId);
    const existingPending = pendingByThreadKey[key];
    if (existingPending && existingPending.phase !== "error") {
      pushCloudTelemetry({
        event: "send.blocked",
        workspaceId: activeWorkspaceId,
        threadId: activeThreadId,
        note: existingPending.phase,
      });
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
    const baselineAssistantCount = countAssistantMessages(activeItems);
    setPendingByThreadKey((prev) => ({
      ...prev,
      [key]: { id: commandId, createdAt: Date.now(), phase: "submitting" },
    }));
    setAwaitingByThreadKey((prev) => ({
      ...prev,
      [key]: {
        commandId,
        workspaceId: activeWorkspaceId,
        threadId: activeThreadId,
        startedAtMs: Date.now(),
        baselineAssistantCount,
      },
    }));
    setLocalItemsByThreadKey((prev) => ({
      ...prev,
      [key]: [
        ...(prev[key] ?? []),
        {
          kind: "message",
          id: `local-${commandId}-user`,
          role: "user",
          text: trimmed,
        },
      ],
    }));
    try {
      pushCloudTelemetry({
        event: "send.submit",
        commandId,
        workspaceId: activeWorkspaceId,
        threadId: activeThreadId,
        note: trimmed,
      });
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
      setPendingByThreadKey((prev) => {
        const entry = prev[key];
        if (!entry || entry.id !== commandId) return prev;
        return { ...prev, [key]: { ...entry, phase: "waitingResult" } };
      });
    } catch (error) {
      setPendingByThreadKey((prev) => ({
        ...prev,
        [key]: {
          id: commandId,
          createdAt: Date.now(),
          phase: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
      setAwaitingByThreadKey((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [
    accessMode,
    activeItems,
    activeThreadId,
    activeWorkspaceId,
    canSend,
    clientId,
    countAssistantMessages,
    pendingByThreadKey,
    runnerId,
    threadKey,
  ]);

  useEffect(() => {
    if (!runnerId) {
      return;
    }
    let stopped = false;
    const interval = window.setInterval(() => {
      void (async () => {
        if (stopped) return;
        const entries = Object.entries(pendingByThreadKeyRef.current).filter(
          ([, pending]) => pending.phase === "waitingResult",
        );
        if (!entries.length) return;

        await Promise.all(
          entries.map(async ([key, pending]) => {
            const [workspaceId, threadId] = key.split("::");
            const fetchStart = performance.now();
            const result = await cloudkitGetCommandResult(runnerId, pending.id);
            pushCloudTelemetry({
              event: "command.result.poll",
              commandId: pending.id,
              workspaceId,
              threadId,
              fromCache: false,
              durationMs: performance.now() - fetchStart,
              note: result ? (result.ok ? "ok" : "error") : "none",
            });
            if (!result) return;

            if (!result.ok) {
              setPendingByThreadKey((prev) => ({
                ...prev,
                [key]: {
                  ...pending,
                  phase: "error",
                  error: result.payloadJson || "Command failed",
                },
              }));
              setAwaitingByThreadKey((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
              return;
            }

            setPendingByThreadKey((prev) => {
              const current = prev[key];
              if (!current || current.id !== pending.id) return prev;
              return {
                ...prev,
                [key]: { ...current, phase: "waitingReply", resultPayloadJson: result.payloadJson ?? null },
              };
            });

            // If the runner already extracted assistant text, show it immediately so the UI doesn't
            // feel stuck while waiting for the next snapshot poll.
            let assistantText = "";
            try {
              const parsed = result.payloadJson ? (JSON.parse(result.payloadJson) as any) : null;
              if (parsed && typeof parsed.assistantText === "string") {
                assistantText = parsed.assistantText;
              }
            } catch {
              // ignore
            }
            if (assistantText.trim()) {
              const commandId = pending.id;
              setLocalItemsByThreadKey((prev) => ({
                ...prev,
                [key]: [
                  ...(prev[key] ?? []),
                  {
                    kind: "message",
                    id: `local-${commandId}-assistant`,
                    role: "assistant",
                    text: assistantText,
                  },
                ],
              }));
              // Clear "working" for this thread immediately; the next snapshot will reconcile.
              setAwaitingByThreadKey((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
              setPendingByThreadKey((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
              pushCloudTelemetry({
                event: "reply.seen",
                fromCache: true,
                workspaceId,
                threadId,
                commandId,
                note: "assistantText(result)",
              });
            }
          }),
        );
      })();
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [applyAwaitingResolutionFromItems, runnerId]);

  useEffect(() => {
    const keys = Object.keys(awaitingByThreadKey);
    if (keys.length === 0) return;

    const timeout = window.setInterval(() => {
      const now = Date.now();
      Object.entries(awaitingByThreadKeyRef.current).forEach(([key, awaiting]) => {
        if (now - awaiting.startedAtMs < 15 * 60_000) {
          return;
        }
        pushCloudTelemetry({
          event: "reply.timeout",
          fromCache: false,
          workspaceId: awaiting.workspaceId,
          threadId: awaiting.threadId,
          commandId: awaiting.commandId,
        });
        setAwaitingByThreadKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setPendingByThreadKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      });
    }, 10_000);

    return () => window.clearInterval(timeout);
  }, [awaitingByThreadKey]);

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
    handleSelectThread(activeWorkspaceId, threads[0].id);
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, handleSelectThread, runnerOnline, threads]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerOnline) return;
    if (!activeWorkspaceId) return;
    if (activeThreadId) return;
    if (threads.length) return;
    if (Object.keys(pendingByThreadKey).length) return;
    if (e2eThreadRequested.current) return;

    e2eThreadRequested.current = true;
    window.setTimeout(() => {
      if (!runnerOnline || !runnerId) return;
      void submitCommand("startThread", { workspaceId: activeWorkspaceId });
    }, 1500);
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, pendingByThreadKey, runnerId, runnerOnline, submitCommand, threads.length]);

  useEffect(() => {
    if (!e2eEnabled || !cloudEnabled || !runnerOnline) return;
    if (!activeWorkspaceId || !activeThreadId) return;
    if (Object.keys(pendingByThreadKey).length) return;
    if (!e2eBaseline.current) {
      e2eBaseline.current = {
        assistantCount: countAssistantMessages(activeItems),
      };
    }
    void handleSend("Erzähl mir einen kurzen Witz.");
  }, [activeThreadId, activeWorkspaceId, cloudEnabled, e2eEnabled, handleSend, pendingByThreadKey, runnerOnline, countAssistantMessages, activeItems]);

  useEffect(() => {
    if (!e2eEnabled || e2eCompleted.current) return;
    if (!e2eBaseline.current) return;
    if (!activeWorkspaceId || !activeThreadId) return;
    const key = threadKey(activeWorkspaceId, activeThreadId);
    if (awaitingByThreadKey[key] || pendingByThreadKey[key]) return;

    const currentAssistantCount = countAssistantMessages(activeItems);
    if (currentAssistantCount <= e2eBaseline.current.assistantCount) return;

    e2eCompleted.current = true;
    void e2eMark("success: received assistant response");
    window.setTimeout(() => void e2eQuit(), 750);
  }, [activeItems, e2eEnabled, activeThreadId, activeWorkspaceId, awaitingByThreadKey, pendingByThreadKey, threadKey, countAssistantMessages]);

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
    // Cloud mode: mark threads as processing if this device has an in-flight command for them.
    Object.entries(awaitingByThreadKey).forEach(([key]) => {
      const [, threadId] = key.split("::");
      if (!threadId) return;
      merged[threadId] = { ...(merged[threadId] ?? { hasUnread: false, isReviewing: false, isProcessing: false }), isProcessing: true };
    });
    Object.entries(pendingByThreadKey).forEach(([key, pending]) => {
      const [, threadId] = key.split("::");
      if (!threadId) return;
      if (pending.phase === "error") return;
      merged[threadId] = { ...(merged[threadId] ?? { hasUnread: false, isReviewing: false, isProcessing: false }), isProcessing: true };
    });
    return merged;
  }, [awaitingByThreadKey, pendingByThreadKey, workspaceSnaps]);

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
    Boolean(activeAwaiting) ||
    Boolean(activePending && activePending.phase !== "error") ||
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
        handleSelectThread(workspaceId, threadId);
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
      disabled={!canSend || Boolean(activePending && activePending.phase !== "error")}
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
