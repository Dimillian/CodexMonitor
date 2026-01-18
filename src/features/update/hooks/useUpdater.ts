import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import type { DebugEntry } from "../../../types";

type UpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

type UpdateProgress = {
  totalBytes?: number;
  downloadedBytes: number;
};

export type UpdateState = {
  stage: UpdateStage;
  version?: string;
  progress?: UpdateProgress;
  error?: string;
};

type UseUpdaterOptions = {
  enabled?: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

function isUpdaterUnsupportedError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("plugin not found") || normalized.includes("not allowed");
}

export function useUpdater({ enabled = true, onDebug }: UseUpdaterOptions) {
  const [state, setState] = useState<UpdateState>({ stage: "idle" });
  const updateRef = useRef<Update | null>(null);

  const resetToIdle = useCallback(async () => {
    const update = updateRef.current;
    updateRef.current = null;
    setState({ stage: "idle" });
    await update?.close();
  }, []);

  const checkForUpdates = useCallback(async () => {
    let update: Awaited<ReturnType<typeof check>> | null = null;
    try {
      setState({ stage: "checking" });
      update = await check();
      if (!update) {
        setState({ stage: "idle" });
        return;
      }

      updateRef.current = update;
      setState({
        stage: "available",
        version: update.version,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      if (isUpdaterUnsupportedError(message)) {
        onDebug?.({
          id: `${Date.now()}-client-updater-unsupported`,
          timestamp: Date.now(),
          source: "client",
          label: "updater/unsupported",
          payload: message,
        });
        setState({ stage: "idle" });
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-updater-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/error",
        payload: message,
      });
      setState({ stage: "error", error: message });
    } finally {
      if (!updateRef.current) {
        await update?.close();
      }
    }
  }, [onDebug]);

  const startUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      await checkForUpdates();
      return;
    }

    setState((prev) => ({
      ...prev,
      stage: "downloading",
      progress: { totalBytes: undefined, downloadedBytes: 0 },
      error: undefined,
    }));

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setState((prev) => ({
            ...prev,
            progress: {
              totalBytes: event.data.contentLength,
              downloadedBytes: 0,
            },
          }));
          return;
        }

        if (event.event === "Progress") {
          setState((prev) => ({
            ...prev,
            progress: {
              totalBytes: prev.progress?.totalBytes,
              downloadedBytes:
                (prev.progress?.downloadedBytes ?? 0) + event.data.chunkLength,
            },
          }));
          return;
        }

        if (event.event === "Finished") {
          setState((prev) => ({
            ...prev,
            stage: "installing",
          }));
        }
      });

      setState((prev) => ({
        ...prev,
        stage: "restarting",
      }));
      await relaunch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      if (isUpdaterUnsupportedError(message)) {
        onDebug?.({
          id: `${Date.now()}-client-updater-unsupported`,
          timestamp: Date.now(),
          source: "client",
          label: "updater/unsupported",
          payload: message,
        });
        await resetToIdle();
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-updater-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/error",
        payload: message,
      });
      setState((prev) => ({
        ...prev,
        stage: "error",
        error: message,
      }));
    }
  }, [checkForUpdates, onDebug, resetToIdle]);

  useEffect(() => {
    if (!enabled || import.meta.env.DEV || !isTauri()) {
      return;
    }
    void checkForUpdates();
  }, [checkForUpdates, enabled]);


  return {
    state,
    startUpdate,
    dismiss: resetToIdle,
  };
}
