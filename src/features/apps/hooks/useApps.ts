import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppOption, DebugEntry, WorkspaceInfo } from "../../../types";
import { getAppsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { getAppServerParams, isAppListUpdatedEvent } from "../../../utils/appServerEvents";

type UseAppsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId?: string | null;
  enabled: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

function normalizeAppsResponse(response: any): AppOption[] {
  const data =
    response?.result?.data ??
    response?.data ??
    [];
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      name: String(item?.name ?? ""),
      description: item?.description ? String(item.description) : undefined,
      isAccessible: Boolean(item?.isAccessible ?? item?.is_accessible ?? false),
      installUrl: item?.installUrl
        ? String(item.installUrl)
        : item?.install_url
          ? String(item.install_url)
          : null,
      distributionChannel: item?.distributionChannel
        ? String(item.distributionChannel)
        : item?.distribution_channel
          ? String(item.distribution_channel)
          : null,
    }))
    .sort((a, b) => {
      if (a.isAccessible !== b.isAccessible) {
        return a.isAccessible ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

type AppsFetchTarget = {
  workspaceId: string;
  threadId: string | null;
};

function buildFetchKey(workspaceId: string, threadId: string | null): string {
  return `${workspaceId}::${threadId ?? ""}`;
}

export function useApps({
  activeWorkspace,
  activeThreadId = null,
  enabled,
  onDebug,
}: UseAppsOptions) {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const appsByKey = useRef<Record<string, AppOption[]>>({});
  const lastFetchedKey = useRef<string | null>(null);
  const visibleKey = useRef<string | null>(null);
  const inFlightKey = useRef<string | null>(null);
  const pendingTarget = useRef<AppsFetchTarget | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const threadId =
    typeof activeThreadId === "string" && activeThreadId.trim().length > 0
      ? activeThreadId
      : null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const threadIdRef = useRef<string | null>(threadId);
  const enabledRef = useRef(enabled);
  const connectedRef = useRef(isConnected);

  workspaceIdRef.current = workspaceId;
  threadIdRef.current = threadId;
  enabledRef.current = enabled;
  connectedRef.current = isConnected;

  const executeFetch = useCallback(async (target: AppsFetchTarget) => {
    const targetKey = buildFetchKey(target.workspaceId, target.threadId);
    if (inFlightKey.current) {
      pendingTarget.current = target;
      return;
    }
    inFlightKey.current = targetKey;
    onDebug?.({
      id: `${Date.now()}-client-apps-list`,
      timestamp: Date.now(),
      source: "client",
      label: "app/list",
      payload: { workspaceId: target.workspaceId, threadId: target.threadId },
    });
    try {
      const response = await getAppsList(
        target.workspaceId,
        null,
        100,
        target.threadId,
      );
      const nextApps = normalizeAppsResponse(response);
      appsByKey.current[targetKey] = nextApps;
      onDebug?.({
        id: `${Date.now()}-server-apps-list`,
        timestamp: Date.now(),
        source: "server",
        label: "app/list response",
        payload: response,
      });
      if (
        workspaceIdRef.current === target.workspaceId &&
        threadIdRef.current === target.threadId &&
        enabledRef.current &&
        connectedRef.current
      ) {
        setApps(nextApps);
        visibleKey.current = targetKey;
      }
      lastFetchedKey.current = targetKey;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-apps-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "app/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
      if (
        workspaceIdRef.current === target.workspaceId &&
        threadIdRef.current === target.threadId &&
        enabledRef.current &&
        connectedRef.current &&
        !retryTimer.current
      ) {
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          setRetryVersion((value) => value + 1);
        }, 1500);
      }
    } finally {
      inFlightKey.current = null;
      const pending = pendingTarget.current;
      if (pending && buildFetchKey(pending.workspaceId, pending.threadId) !== targetKey) {
        pendingTarget.current = null;
        if (
          pending.workspaceId === workspaceIdRef.current &&
          pending.threadId === threadIdRef.current
        ) {
          void executeFetch(pending);
        }
      }
    }
  }, [onDebug]);

  const refreshApps = useCallback(async () => {
    if (!workspaceId || !isConnected || !enabled) {
      setApps([]);
      lastFetchedKey.current = null;
      visibleKey.current = null;
      pendingTarget.current = null;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }
    void executeFetch({ workspaceId, threadId });
  }, [enabled, executeFetch, isConnected, threadId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !enabled) {
      setApps([]);
      lastFetchedKey.current = null;
      visibleKey.current = null;
      pendingTarget.current = null;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }
    const currentKey = buildFetchKey(workspaceId, threadId);
    if (visibleKey.current !== currentKey) {
      setApps(appsByKey.current[currentKey] ?? []);
      visibleKey.current = currentKey;
    }
    if (lastFetchedKey.current === currentKey) {
      return;
    }
    void refreshApps();
  }, [enabled, isConnected, refreshApps, retryVersion, threadId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !enabled) {
      return;
    }

    return subscribeAppServerEvents((event) => {
      if (event.workspace_id !== workspaceId) {
        return;
      }
      if (!isAppListUpdatedEvent(event)) {
        return;
      }

      const params = getAppServerParams(event);
      const eventThreadIdRaw =
        params.threadId ??
        params.thread_id ??
        (typeof params.thread === "object" &&
        params.thread !== null &&
        "id" in params.thread
          ? (params.thread as { id?: unknown }).id
          : null);
      const eventThreadId =
        typeof eventThreadIdRaw === "string" && eventThreadIdRaw.trim().length > 0
          ? eventThreadIdRaw
          : null;
      const currentThreadId = threadIdRef.current;
      if (eventThreadId && eventThreadId !== currentThreadId) {
        return;
      }
      if (!Array.isArray(params.data)) {
        return;
      }

      onDebug?.({
        id: `${Date.now()}-server-apps-list-updated`,
        timestamp: Date.now(),
        source: "server",
        label: "app/list updated",
        payload: event,
      });
      const currentKey = buildFetchKey(workspaceId, threadIdRef.current);
      const nextApps = normalizeAppsResponse({ data: params.data });
      appsByKey.current[currentKey] = nextApps;
      setApps(nextApps);
      visibleKey.current = currentKey;
      lastFetchedKey.current = currentKey;
    });
  }, [enabled, isConnected, onDebug, workspaceId]);

  useEffect(
    () => () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    },
    [],
  );

  const appOptions = useMemo(
    () => apps.filter((app) => app.id && app.name),
    [apps],
  );

  return {
    apps: appOptions,
    refreshApps,
  };
}
