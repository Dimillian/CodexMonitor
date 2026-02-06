import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppOption, DebugEntry, WorkspaceInfo } from "../../../types";
import { getAppsList } from "../../../services/tauri";

type UseAppsOptions = {
  activeWorkspace: WorkspaceInfo | null;
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

export function useApps({ activeWorkspace, enabled, onDebug }: UseAppsOptions) {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlightWorkspaceId = useRef<string | null>(null);
  const pendingWorkspaceId = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const enabledRef = useRef(enabled);
  const connectedRef = useRef(isConnected);

  workspaceIdRef.current = workspaceId;
  enabledRef.current = enabled;
  connectedRef.current = isConnected;

  const executeFetch = useCallback(async (targetWorkspaceId: string) => {
    if (inFlightWorkspaceId.current) {
      pendingWorkspaceId.current = targetWorkspaceId;
      return;
    }
    inFlightWorkspaceId.current = targetWorkspaceId;
    onDebug?.({
      id: `${Date.now()}-client-apps-list`,
      timestamp: Date.now(),
      source: "client",
      label: "app/list",
      payload: { workspaceId: targetWorkspaceId },
    });
    try {
      const response = await getAppsList(targetWorkspaceId, null, 100);
      onDebug?.({
        id: `${Date.now()}-server-apps-list`,
        timestamp: Date.now(),
        source: "server",
        label: "app/list response",
        payload: response,
      });
      if (
        workspaceIdRef.current === targetWorkspaceId &&
        enabledRef.current &&
        connectedRef.current
      ) {
        setApps(normalizeAppsResponse(response));
      }
      lastFetchedWorkspaceId.current = targetWorkspaceId;
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
        workspaceIdRef.current === targetWorkspaceId &&
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
      inFlightWorkspaceId.current = null;
      if (
        pendingWorkspaceId.current &&
        pendingWorkspaceId.current !== targetWorkspaceId
      ) {
        const pending = pendingWorkspaceId.current;
        pendingWorkspaceId.current = null;
        if (pending === workspaceIdRef.current) {
          void executeFetch(pending);
        }
      }
    }
  }, [onDebug]);

  const refreshApps = useCallback(async () => {
    if (!workspaceId || !isConnected || !enabled) {
      setApps([]);
      lastFetchedWorkspaceId.current = null;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }
    void executeFetch(workspaceId);
  }, [enabled, executeFetch, isConnected, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !enabled) {
      setApps([]);
      lastFetchedWorkspaceId.current = null;
      pendingWorkspaceId.current = null;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId) {
      return;
    }
    void refreshApps();
  }, [enabled, isConnected, refreshApps, retryVersion, workspaceId]);

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
