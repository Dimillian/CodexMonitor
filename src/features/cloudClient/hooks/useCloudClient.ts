import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudDiscoverRunner, cloudRpc, natsStatus } from "../../../services/tauri";
import { buildItemsFromThread } from "../../../utils/threadItems";
import type { ConversationItem, WorkspaceInfo } from "../../../types";

type CloudClientLogEntry = { at: number; message: string };

type E2EStatus = "idle" | "running" | "pass" | "fail";

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function extractThreadId(response: unknown) {
  if (typeof response === "string") {
    return response;
  }
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  const direct = asString(record.threadId ?? record.thread_id ?? record.id);
  return direct || null;
}

function lastAssistantMessage(items: ConversationItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "message" && item.role === "assistant" && item.text.trim()) {
      return item.text.trim();
    }
  }
  return null;
}

export function useCloudClient() {
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<CloudClientLogEntry[]>([]);
  const [e2eStatus, setE2eStatus] = useState<E2EStatus>("idle");
  const [e2eDetail, setE2eDetail] = useState<string>("");

  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const appendLog = useCallback((message: string) => {
    const entry = { at: Date.now(), message };
    console.log(`[cloud] ${message}`);
    setLogs((prev) => [...prev, entry].slice(-120));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollThread = useCallback(
    async (nextRunnerId: string, workspaceId: string, nextThreadId: string) => {
      const thread = await cloudRpc<any>(nextRunnerId, "resume_thread", {
        workspaceId,
        threadId: nextThreadId,
      });
      const nextItems = buildItemsFromThread((thread ?? {}) as Record<string, unknown>);
      if (!isMountedRef.current) {
        return nextItems;
      }
      setItems(nextItems);
      return nextItems;
    },
    [],
  );

  const startPolling = useCallback(
    (nextRunnerId: string, workspaceId: string, nextThreadId: string) => {
      stopPolling();
      pollTimerRef.current = window.setInterval(() => {
        void pollThread(nextRunnerId, workspaceId, nextThreadId).catch(() => {});
      }, 1500);
    },
    [pollThread, stopPolling],
  );

  const checkNats = useCallback(async () => {
    try {
      const status = await natsStatus();
      appendLog(
        status.ok
          ? `NATS OK (${status.server ?? "connected"})`
          : `NATS error: ${status.error ?? "unknown error"}`,
      );
      return status.ok;
    } catch (error) {
      appendLog(`NATS error: ${asString(error)}`);
      return false;
    }
  }, [appendLog]);

  const discover = useCallback(async () => {
    setBusy(true);
    try {
      const found = await cloudDiscoverRunner();
      if (!found) {
        appendLog("No runner discovered (is the macOS app running?).");
        setRunnerId(null);
        return null;
      }
      appendLog(`Discovered runner: ${found}`);
      setRunnerId(found);
      return found;
    } finally {
      setBusy(false);
    }
  }, [appendLog]);

  const loadWorkspaces = useCallback(
    async (nextRunnerId: string) => {
      setBusy(true);
      try {
        const list = await cloudRpc<WorkspaceInfo[]>(nextRunnerId, "list_workspaces", {});
        setWorkspaces(Array.isArray(list) ? list : []);
        appendLog(`Loaded workspaces: ${Array.isArray(list) ? list.length : 0}`);
        return Array.isArray(list) ? list : [];
      } finally {
        setBusy(false);
      }
    },
    [appendLog],
  );

  const connectWorkspace = useCallback(
    async (nextRunnerId: string, workspaceId: string) => {
      setBusy(true);
      try {
        await cloudRpc(nextRunnerId, "connect_workspace", { workspaceId });
        appendLog(`Connected workspace: ${workspaceId}`);
      } finally {
        setBusy(false);
      }
    },
    [appendLog],
  );

  const startThread = useCallback(
    async (nextRunnerId: string, workspaceId: string) => {
      setBusy(true);
      try {
        const response = await cloudRpc<any>(nextRunnerId, "start_thread", { workspaceId });
        const nextThreadId = extractThreadId(response);
        if (!nextThreadId) {
          throw new Error(`Missing threadId in response: ${JSON.stringify(response)}`);
        }
        setThreadId(nextThreadId);
        appendLog(`Started thread: ${nextThreadId}`);
        await pollThread(nextRunnerId, workspaceId, nextThreadId);
        startPolling(nextRunnerId, workspaceId, nextThreadId);
        return nextThreadId;
      } finally {
        setBusy(false);
      }
    },
    [appendLog, pollThread, startPolling],
  );

  const sendText = useCallback(
    async (nextRunnerId: string, workspaceId: string, nextThreadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      setBusy(true);
      try {
        await cloudRpc(nextRunnerId, "send_user_message", {
          workspaceId,
          threadId: nextThreadId,
          text: trimmed,
          accessMode: "current",
          model: null,
          effort: null,
          images: [],
        });
        appendLog(`Sent: ${trimmed}`);
        await pollThread(nextRunnerId, workspaceId, nextThreadId);
      } finally {
        setBusy(false);
      }
    },
    [appendLog, pollThread],
  );

  const e2eRun = useCallback(async () => {
    setE2eStatus("running");
    setE2eDetail("Starting...");
    appendLog("E2E: start");

    try {
      const natsOk = await checkNats();
      if (!natsOk) {
        throw new Error("NATS not reachable.");
      }

      const nextRunnerId = (await discover()) ?? "";
      if (!nextRunnerId) {
        throw new Error("No runner discovered.");
      }
      setE2eDetail(`Runner: ${nextRunnerId}`);

      const ws = await loadWorkspaces(nextRunnerId);
      const first = ws[0];
      if (!first) {
        throw new Error("No workspaces found on runner.");
      }
      setActiveWorkspaceId(first.id);
      setE2eDetail(`Workspace: ${first.name}`);
      await connectWorkspace(nextRunnerId, first.id);

      const nextThreadId = await startThread(nextRunnerId, first.id);
      setE2eDetail(`Thread: ${nextThreadId}`);

      await sendText(nextRunnerId, first.id, nextThreadId, "Erzähl mir bitte einen Witz.");
      setE2eDetail("Waiting for assistant reply...");

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const nextItems = await pollThread(nextRunnerId, first.id, nextThreadId);
        const assistant = lastAssistantMessage(nextItems);
        if (assistant) {
          appendLog("E2E: pass");
          setE2eStatus("pass");
          setE2eDetail("PASS");
          document.title = "E2E PASS";
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      throw new Error("Timed out waiting for assistant reply.");
    } catch (error) {
      const detail = asString(error) || "E2E failed.";
      appendLog(`E2E: fail: ${detail}`);
      setE2eStatus("fail");
      setE2eDetail(detail);
      document.title = "E2E FAIL";
    }
  }, [
    appendLog,
    checkNats,
    connectWorkspace,
    discover,
    loadWorkspaces,
    pollThread,
    sendText,
    startThread,
  ]);

  const connectionLabel = useMemo(() => {
    const workspace = workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null;
    return {
      runnerId,
      workspace,
      threadId,
    };
  }, [activeWorkspaceId, runnerId, threadId, workspaces]);

  return {
    runnerId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    threadId,
    setThreadId,
    items,
    busy,
    logs,
    e2eStatus,
    e2eDetail,
    connectionLabel,
    stopPolling,
    checkNats,
    discover,
    loadWorkspaces,
    connectWorkspace,
    startThread,
    sendText,
    e2eRun,
  };
}

