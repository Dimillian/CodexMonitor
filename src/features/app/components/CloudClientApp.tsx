import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { ConversationItem, WorkspaceInfo } from "../../../types";
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
import { Messages } from "../../messages/components/Messages";
import { TabBar } from "./TabBar";
import { SettingsView } from "../../settings/components/SettingsView";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { buildItemsFromThread } from "../../../threads/threadItems";

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
  const clientId = useMemo(() => ensureClientId(), []);
  const [activeTab, setActiveTab] = useState<"projects" | "codex" | "git" | "log">(
    "projects",
  );
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [runnerLabel, setRunnerLabel] = useState<string | null>(null);
  const [runnerOnline, setRunnerOnline] = useState(false);
  const [global, setGlobal] = useState<CloudGlobalSnapshot | null>(null);
  const [workspaceSnap, setWorkspaceSnap] = useState<CloudWorkspaceSnapshot | null>(null);
  const [threadSnap, setThreadSnap] = useState<CloudThreadSnapshot | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const lastThreadUpdatedAt = useRef<number>(0);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const e2eThreadRequested = useRef(false);
  const e2eBaseline = useRef<{ assistantCount: number } | null>(null);
  const e2eCompleted = useRef(false);

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
      setWorkspaceSnap(null);
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
          setGlobal(null);
          return;
        }
        setRunnerId(runner.runnerId);
        setRunnerLabel(`${runner.name} (${runner.platform})`);
        setRunnerOnline(isRunnerOnline(runner.updatedAtMs));

        const globalRecord = await cloudkitGetSnapshot(runner.runnerId, globalScopeKey());
        if (globalRecord?.payloadJson) {
          const parsed = parseCloudSnapshot<CloudGlobalSnapshot["payload"]>(globalRecord.payloadJson);
          if (parsed) {
            setGlobal(parsed as CloudGlobalSnapshot);
          }
        }

        if (activeWorkspaceId) {
          const wsRecord = await cloudkitGetSnapshot(runner.runnerId, workspaceScopeKey(activeWorkspaceId));
          if (wsRecord?.payloadJson) {
            const parsed = parseCloudSnapshot<CloudWorkspaceSnapshot["payload"]>(wsRecord.payloadJson);
            if (parsed) {
              setWorkspaceSnap(parsed as CloudWorkspaceSnapshot);
            }
          }
        } else {
          setWorkspaceSnap(null);
        }

        if (activeWorkspaceId && activeThreadId) {
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
    const interval = window.setInterval(() => void tick(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [activeThreadId, activeWorkspaceId, cloudEnabled]);

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

  const threads = workspaceSnap?.payload.workspaceId === activeWorkspaceId
    ? workspaceSnap.payload.threads
    : [];

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

  const canSend = Boolean(
    cloudEnabled && runnerId && runnerOnline && activeWorkspaceId && activeThreadId,
  );

  const handleSelectWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      setActiveThreadId(null);
      setActiveTab("codex");
      if (runnerId && cloudEnabled) {
        void submitCommand("connectWorkspace", { workspaceId: id });
      }
    },
    [cloudEnabled, runnerId, submitCommand],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      setActiveTab("codex");
      if (runnerId && cloudEnabled && activeWorkspaceId) {
        void submitCommand("resumeThread", { workspaceId: activeWorkspaceId, threadId });
      }
    },
    [activeWorkspaceId, cloudEnabled, runnerId, submitCommand],
  );

  const handleSend = useCallback(async (overrideText?: string) => {
    if (!canSend || !runnerId || !activeWorkspaceId || !activeThreadId) {
      return;
    }
    const text = (overrideText ?? draft).trim();
    if (!text) return;
    setDraft("");

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
            text,
            accessMode: "current",
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
  }, [activeThreadId, activeWorkspaceId, canSend, clientId, draft, runnerId]);

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

  const e2eEnabled = (import.meta as any).env?.VITE_E2E === "1";
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

  const showProjects = activeTab === "projects";
  const showChat = activeTab === "codex";
  const showPlaceholder = !showProjects && !showChat;

  return (
    <div className="cloud-client">
      <div className="cloud-client-topbar">
        <div className="cloud-client-title">{showProjects ? "Projects" : activeWorkspace?.name ?? "Codex"}</div>
        <button
          type="button"
          className="ghost icon-button"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings aria-hidden />
        </button>
      </div>

      {headerHint && <div className="cloud-client-hint">{headerHint}</div>}
      {runnerLabel && (
        <div className="cloud-client-runner">
          {runnerLabel} · {runnerOnline ? "online" : "offline"}
        </div>
      )}

      {showProjects && (
        <div className="cloud-client-projects">
          {workspaces.length === 0 ? (
            <div className="cloud-client-empty">No workspaces yet.</div>
          ) : (
            workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                className={`cloud-client-workspace ${activeWorkspaceId === ws.id ? "active" : ""}`}
                onClick={() => handleSelectWorkspace(ws.id)}
              >
                <div className="cloud-client-workspace-name">{ws.name}</div>
                <div className="cloud-client-workspace-sub">{ws.connected ? "connected" : "disconnected"}</div>
              </button>
            ))
          )}
        </div>
      )}

      {showChat && (
        <div className="cloud-client-chat">
          <div className="cloud-client-threadbar">
            {threads.length === 0 ? (
              <div className="cloud-client-empty">No agents yet.</div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`cloud-client-thread ${activeThreadId === thread.id ? "active" : ""}`}
                  onClick={() => handleSelectThread(thread.id)}
                >
                  {thread.name}
                </button>
              ))
            )}
          </div>
          <div className="cloud-client-actions">
            <button
              type="button"
              className="ghost"
              disabled={!canSend || Boolean(pendingCommand)}
              onClick={() => void handleSend("Erzähl mir einen kurzen Witz.")}
            >
              Demo: Witz
            </button>
          </div>
          <div className="cloud-client-messages">
            <Messages
              items={activeItems}
              threadId={activeThreadId}
              isThinking={Boolean(pendingCommand && pendingCommand.status === "waiting")}
              processingStartedAt={pendingCommand?.createdAt ?? null}
            />
          </div>
          <div className="cloud-client-composer">
            {pendingCommand?.status === "error" && (
              <div className="cloud-client-error">
                {pendingCommand.error ?? "Command failed."}
              </div>
            )}
            <textarea
              className="cloud-client-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={canSend ? "Ask Codex…" : "Select a workspace + agent first…"}
              disabled={!canSend}
              rows={2}
            />
            <button
              type="button"
              className="primary"
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              Send
            </button>
          </div>
        </div>
      )}
      {showPlaceholder && (
        <div className="cloud-client-empty">
          This tab is not available in Cloud mode yet.
        </div>
      )}

      <TabBar activeTab={activeTab} onSelect={(tab) => setActiveTab(tab)} />

      {/* Settings screen is still the desktop SettingsView; we keep it optional. */}
      {settingsOpen ? (
        <SettingsView
          workspaces={[]}
          onClose={() => setSettingsOpen(false)}
          onMoveWorkspace={() => {}}
          onDeleteWorkspace={() => {}}
          reduceTransparency={false}
          onToggleTransparency={() => {}}
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
