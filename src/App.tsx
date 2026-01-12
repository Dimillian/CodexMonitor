import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/composer.css";
import "./styles/diff.css";
import "./styles/diff-viewer.css";
import "./styles/debug.css";
import "./styles/plan.css";
import "./styles/about.css";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { MainHeader } from "./components/MainHeader";
import { Messages } from "./components/Messages";
import { ApprovalToasts } from "./components/ApprovalToasts";
import { Composer } from "./components/Composer";
import { GitDiffPanel } from "./components/GitDiffPanel";
import { GitDiffViewer } from "./components/GitDiffViewer";
import { DebugPanel } from "./components/DebugPanel";
import { PlanPanel } from "./components/PlanPanel";
import { AboutView } from "./components/AboutView";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useThreads } from "./hooks/useThreads";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useGitStatus } from "./hooks/useGitStatus";
import { useGitDiffs } from "./hooks/useGitDiffs";
import { useGitLog } from "./hooks/useGitLog";
import { useGitRemote } from "./hooks/useGitRemote";
import { useModels } from "./hooks/useModels";
import { useSkills } from "./hooks/useSkills";
import { useDebugLog } from "./hooks/useDebugLog";
import { useWorkspaceRefreshOnFocus } from "./hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "./hooks/useWorkspaceRestore";
import { useResizablePanels } from "./hooks/useResizablePanels";
import type { AccessMode, QueuedMessage } from "./types";

function useWindowLabel() {
  const [label, setLabel] = useState("main");
  useEffect(() => {
    try {
      const window = getCurrentWindow();
      setLabel(window.label ?? "main");
    } catch {
      setLabel("main");
    }
  }, []);
  return label;
}

function MainApp() {
  const {
    sidebarWidth,
    rightPanelWidth,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
  } = useResizablePanels();
  const [centerMode, setCenterMode] = useState<"chat" | "diff">("chat");
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [gitPanelMode, setGitPanelMode] = useState<"diff" | "log">("diff");
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [prefillDraft, setPrefillDraft] = useState<QueuedMessage | null>(null);
  const [flushingByThread, setFlushingByThread] = useState<Record<string, boolean>>(
    {},
  );
  const {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  } = useDebugLog();

  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    hasLoaded,
    refreshWorkspaces,
  } = useWorkspaces({ onDebug: addDebugEntry });

  const { status: gitStatus, refresh: refreshGitStatus } =
    useGitStatus(activeWorkspace);
  const {
    diffs: gitDiffs,
    isLoading: isDiffLoading,
    error: diffError,
  } = useGitDiffs(activeWorkspace, gitStatus.files, centerMode === "diff");
  const {
    entries: gitLogEntries,
    total: gitLogTotal,
    isLoading: gitLogLoading,
    error: gitLogError,
  } = useGitLog(activeWorkspace, gitPanelMode === "log");
  const { remote: gitRemoteUrl } = useGitRemote(activeWorkspace);
  const {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
  } = useModels({ activeWorkspace, onDebug: addDebugEntry });
  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });

  const resolvedModel = selectedModel?.model ?? null;
  const fileStatus =
    gitStatus.files.length > 0
      ? `${gitStatus.files.length} file${gitStatus.files.length === 1 ? "" : "s"} changed`
      : "Working tree clean";

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    threadsByWorkspace,
    threadStatusById,
    threadListLoadingByWorkspace,
    activeTurnIdByThread,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    planByThread,
    interruptTurn,
    removeThread,
    startThreadForWorkspace,
    listThreadsForWorkspace,
    sendUserMessage,
    startReview,
    handleApprovalDecision,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: selectedEffort,
    accessMode,
    onMessageActivity: refreshGitStatus,
  });

  const activeRateLimits = activeWorkspaceId
    ? rateLimitsByWorkspace[activeWorkspaceId] ?? null
    : null;
  const activeTokenUsage = activeThreadId
    ? tokenUsageByThread[activeThreadId] ?? null
    : null;
  const activePlan = activeThreadId ? planByThread[activeThreadId] ?? null : null;
  const hasActivePlan = Boolean(
    activePlan && (activePlan.steps.length > 0 || activePlan.explanation),
  );
  const showHome = !activeWorkspace;
  const canInterrupt = activeThreadId
    ? Boolean(
        threadStatusById[activeThreadId]?.isProcessing &&
          activeTurnIdByThread[activeThreadId],
      )
    : false;
  const isProcessing = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const activeQueue = activeThreadId
    ? queuedByThread[activeThreadId] ?? []
    : [];

  useWindowDrag("titlebar");
  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspace,
  });
  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace,
  });

  async function handleAddWorkspace() {
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        setActiveThreadId(null, workspace.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addDebugEntry({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message,
      });
      alert(`Failed to add workspace.\n\n${message}`);
    }
  }

  function selectWorkspace(workspaceId: string) {
    const target = workspaces.find((entry) => entry.id === workspaceId);
    if (target?.settings.sidebarCollapsed) {
      void updateWorkspaceSettings(workspaceId, {
        ...target.settings,
        sidebarCollapsed: false,
      });
    }
    setActiveWorkspaceId(workspaceId);
  }

  function exitDiffView() {
    setCenterMode("chat");
    setSelectedDiffPath(null);
  }

  async function handleAddAgent(workspace: (typeof workspaces)[number]) {
    exitDiffView();
    selectWorkspace(workspace.id);
    if (!workspace.connected) {
      await connectWorkspace(workspace);
    }
    await startThreadForWorkspace(workspace.id);
  }

  function handleSelectDiff(path: string) {
    setSelectedDiffPath(path);
    setCenterMode("diff");
    setGitPanelMode("diff");
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (activeThreadId && threadStatusById[activeThreadId]?.isReviewing) {
      return;
    }
    if (isProcessing && activeThreadId) {
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
      };
      setQueuedByThread((prev) => ({
        ...prev,
        [activeThreadId]: [...(prev[activeThreadId] ?? []), item],
      }));
      return;
    }
    if (activeWorkspace && !activeWorkspace.connected) {
      await connectWorkspace(activeWorkspace);
    }
    if (trimmed.startsWith("/review")) {
      await startReview(trimmed);
      return;
    }
    await sendUserMessage(trimmed);
  }

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    if (flushingByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    setFlushingByThread((prev) => ({ ...prev, [threadId]: true }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        if (nextItem.text.trim().startsWith("/review")) {
          await startReview(nextItem.text);
        } else {
          await sendUserMessage(nextItem.text);
        }
      } catch {
        setQueuedByThread((prev) => ({
          ...prev,
          [threadId]: [nextItem, ...(prev[threadId] ?? [])],
        }));
      } finally {
        setFlushingByThread((prev) => ({ ...prev, [threadId]: false }));
      }
    })();
  }, [
    activeThreadId,
    flushingByThread,
    isProcessing,
    isReviewing,
    queuedByThread,
    sendUserMessage,
  ]);

  return (
    <div
      className="app"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--right-panel-width": `${rightPanelWidth}px`,
          "--plan-panel-height": `${planPanelHeight}px`,
        } as React.CSSProperties
      }
    >
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      <Sidebar
        workspaces={workspaces}
        threadsByWorkspace={threadsByWorkspace}
        threadStatusById={threadStatusById}
        threadListLoadingByWorkspace={threadListLoadingByWorkspace}
        activeWorkspaceId={activeWorkspaceId}
        activeThreadId={activeThreadId}
        accountRateLimits={activeRateLimits}
        onAddWorkspace={handleAddWorkspace}
        onSelectHome={() => {
          exitDiffView();
          setActiveWorkspaceId(null);
        }}
        onSelectWorkspace={(workspaceId) => {
          exitDiffView();
          selectWorkspace(workspaceId);
        }}
        onConnectWorkspace={connectWorkspace}
        onAddAgent={handleAddAgent}
        onToggleWorkspaceCollapse={(workspaceId, collapsed) => {
          const target = workspaces.find((entry) => entry.id === workspaceId);
          if (!target) {
            return;
          }
          void updateWorkspaceSettings(workspaceId, {
            ...target.settings,
            sidebarCollapsed: collapsed,
          });
        }}
        onSelectThread={(workspaceId, threadId) => {
          exitDiffView();
          selectWorkspace(workspaceId);
          setActiveThreadId(threadId, workspaceId);
        }}
        onDeleteThread={(workspaceId, threadId) => {
          removeThread(workspaceId, threadId);
        }}
      />
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={onSidebarResizeStart}
      />

      <section className="main">
        {showHome && (
          <Home
            onOpenProject={handleAddWorkspace}
            onAddWorkspace={handleAddWorkspace}
            onCloneRepository={() => {}}
          />
        )}

        {activeWorkspace && !showHome && (
          <>
            <div className="main-topbar" data-tauri-drag-region>
              <div className="main-topbar-left">
                {centerMode === "diff" && (
                  <button
                    className="ghost icon-button"
                    onClick={() => {
                      setCenterMode("chat");
                      setSelectedDiffPath(null);
                    }}
                    aria-label="Back to chat"
                  >
                    <span aria-hidden>‹</span>
                  </button>
                )}
                <MainHeader
                  workspace={activeWorkspace}
                  branchName={gitStatus.branchName || "unknown"}
                />
              </div>
              <div className="actions">
                {hasDebugAlerts && (
                  <button
                    className="ghost icon-button"
                    onClick={() => setDebugOpen((prev) => !prev)}
                    aria-label="Debug"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M9 7.5V6.5a3 3 0 0 1 6 0v1"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                      <rect
                        x="7"
                        y="7.5"
                        width="10"
                        height="9"
                        rx="3"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                      <path
                        d="M4 12h3m10 0h3M6 8l2 2m8-2-2 2M6 16l2-2m8 2-2-2"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                      <circle cx="10" cy="12" r="0.8" fill="currentColor" />
                      <circle cx="14" cy="12" r="0.8" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <ApprovalToasts
              approvals={approvals}
              workspaces={workspaces}
              onDecision={handleApprovalDecision}
            />

            <div className="content">
              {centerMode === "diff" ? (
                <GitDiffViewer
                  diffs={gitDiffs}
                  selectedPath={selectedDiffPath}
                  isLoading={isDiffLoading}
                  error={diffError}
                />
              ) : (
                <Messages
                  items={activeItems}
                  isThinking={
                    activeThreadId
                      ? threadStatusById[activeThreadId]?.isProcessing ?? false
                      : false
                  }
                />
              )}
            </div>

            <div
              className="right-panel-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right panel"
              onMouseDown={onRightPanelResizeStart}
            />
            <div className={`right-panel ${hasActivePlan ? "" : "plan-collapsed"}`}>
              <div className="right-panel-top">
                <GitDiffPanel
                  mode={gitPanelMode}
                  onModeChange={setGitPanelMode}
                  branchName={gitStatus.branchName || "unknown"}
                  totalAdditions={gitStatus.totalAdditions}
                  totalDeletions={gitStatus.totalDeletions}
                  fileStatus={fileStatus}
                  error={gitStatus.error}
                  logError={gitLogError}
                  logLoading={gitLogLoading}
                  files={gitStatus.files}
                  selectedPath={selectedDiffPath}
                  onSelectFile={handleSelectDiff}
                  logEntries={gitLogEntries}
                  logTotal={gitLogTotal}
                  gitRemoteUrl={gitRemoteUrl}
                />
              </div>
              <div
                className="right-panel-divider"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize plan panel"
                onMouseDown={onPlanPanelResizeStart}
              />
              <div className="right-panel-bottom">
                <PlanPanel plan={activePlan} isProcessing={isProcessing} />
              </div>
            </div>

            {centerMode === "chat" && (
              <Composer
                onSend={handleSend}
                onStop={interruptTurn}
                canStop={canInterrupt}
                disabled={
                  activeThreadId
                    ? threadStatusById[activeThreadId]?.isReviewing ?? false
                    : false
                }
                contextUsage={activeTokenUsage}
                queuedMessages={activeQueue}
                sendLabel={isProcessing ? "Queue" : "Send"}
                prefillDraft={prefillDraft}
                onPrefillHandled={(id) => {
                  if (prefillDraft?.id === id) {
                    setPrefillDraft(null);
                  }
                }}
                onEditQueued={(item) => {
                  if (!activeThreadId) {
                    return;
                  }
                  setQueuedByThread((prev) => ({
                    ...prev,
                    [activeThreadId]: (prev[activeThreadId] ?? []).filter(
                      (entry) => entry.id !== item.id,
                    ),
                  }));
                  setPrefillDraft(item);
                }}
                onDeleteQueued={(id) => {
                  if (!activeThreadId) {
                    return;
                  }
                  setQueuedByThread((prev) => ({
                    ...prev,
                    [activeThreadId]: (prev[activeThreadId] ?? []).filter(
                      (entry) => entry.id !== id,
                    ),
                  }));
                }}
                models={models}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                reasoningOptions={reasoningOptions}
                selectedEffort={selectedEffort}
                onSelectEffort={setSelectedEffort}
                accessMode={accessMode}
                onSelectAccessMode={setAccessMode}
                skills={skills}
              />
            )}
            <DebugPanel
              entries={debugEntries}
              isOpen={debugOpen}
              onClear={clearDebugEntries}
              onCopy={handleCopyDebug}
            />
          </>
        )}
      </section>
    </div>
  );
}

function App() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return <AboutView />;
  }
  return <MainApp />;
}

export default App;
