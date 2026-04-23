import { formatRelativeTime } from "../../../utils/time";
import type { LatestAgentRun } from "../homeTypes";
import { useI18n } from "@/i18n";

type HomeLatestAgentsSectionProps = {
  isLoadingLatestAgents: boolean;
  latestAgentRuns: LatestAgentRun[];
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function HomeLatestAgentsSection({
  isLoadingLatestAgents,
  latestAgentRuns,
  onSelectThread,
}: HomeLatestAgentsSectionProps) {
  const { tx } = useI18n();

  return (
    <div className="home-latest">
      <div className="home-latest-header">
        <div className="home-latest-label">{tx("Latest agents")}</div>
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
                {run.message.trim() || tx("Agent replied.")}
              </div>
              {run.isProcessing && (
                <div className="home-latest-status">{tx("Running")}</div>
              )}
            </button>
          ))}
        </div>
      ) : isLoadingLatestAgents ? (
        <div className="home-latest-grid home-latest-grid-loading" aria-label={tx("Loading agents")}>
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
          <div className="home-latest-empty-title">{tx("No agent activity yet")}</div>
          <div className="home-latest-empty-subtitle">
            {tx("Start a thread to see the latest responses here.")}
          </div>
        </div>
      )}
    </div>
  );
}
