import { formatRelativeTime } from "../../../utils/time";

type LatestAgentRun = {
  message: string;
  timestamp: number;
  projectName: string;
  groupName?: string | null;
  workspaceId: string;
  threadId: string;
  isProcessing: boolean;
};

type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function Home({
  onOpenProject,
  onAddWorkspace,
  latestAgentRuns,
  isLoadingLatestAgents,
  onSelectThread,
}: HomeProps) {
  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-title">Codex Monitor</div>
        <div className="home-subtitle">
          Orchestrate agents across your local projects.
        </div>
      </div>
      <div className="home-latest">
        <div className="home-latest-header">
          <div className="home-latest-label">Latest agents</div>
        </div>
        {latestAgentRuns.length > 0 ? (
          <div className="home-latest-grid">
            {latestAgentRuns.map((run) => (
              <button
                className="home-latest-card home-latest-card-button"
                key={run.threadId}
                onClick={() => onSelectThread(run.workspaceId, run.threadId)}
                type="button"
              >
                <div className="home-latest-card-header">
                  <div className="home-latest-project">
                    <span className="home-latest-project-name">{run.projectName}</span>
                    {run.groupName && (
                      <span className="home-latest-group">{run.groupName}</span>
                    )}
                  </div>
                  <div className="home-latest-time">
                    {formatRelativeTime(run.timestamp)}
                  </div>
                </div>
                <div className="home-latest-message">
                  {run.message.trim() || "Agent replied."}
                </div>
                {run.isProcessing && (
                  <div className="home-latest-status">Running</div>
                )}
              </button>
            ))}
          </div>
        ) : isLoadingLatestAgents ? (
          <div className="home-latest-grid home-latest-grid-loading" aria-label="Loading agents">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="home-latest-card home-latest-card-skeleton" key={index}>
                <div className="home-latest-card-header">
                  <span className="home-latest-skeleton home-latest-skeleton-title" />
                  <span className="home-latest-skeleton home-latest-skeleton-time" />
                </div>
                <span className="home-latest-skeleton home-latest-skeleton-line" />
                <span className="home-latest-skeleton home-latest-skeleton-line short" />
              </div>
            ))}
          </div>
        ) : (
          <div className="home-latest-empty">
            <div className="home-latest-empty-title">No agent activity yet</div>
            <div className="home-latest-empty-subtitle">
              Start a thread to see the latest responses here.
            </div>
          </div>
        )}
      </div>
      <div className="home-actions">
        <button
          className="home-button primary"
          onClick={onOpenProject}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            ⌘
          </span>
          Open Project
        </button>
        <button
          className="home-button secondary"
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            +
          </span>
          Add Workspace
        </button>
      </div>
    </div>
  );
}
