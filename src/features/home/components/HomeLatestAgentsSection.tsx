import { formatRelativeTime } from "../../../utils/time";
import { useTranslation } from "react-i18next";
import type { LatestAgentRun } from "../homeTypes";

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
  const { t } = useTranslation();
  return (
    <div className="home-latest">
      <div className="home-latest-header">
        <div className="home-latest-label">{t("home.latestAgents")}</div>
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
                {run.message.trim() || t("home.latestAgentFallbackMessage")}
              </div>
              {run.isProcessing && (
                <div className="home-latest-status">{t("home.running")}</div>
              )}
            </button>
          ))}
        </div>
      ) : isLoadingLatestAgents ? (
        <div
          className="home-latest-grid home-latest-grid-loading"
          aria-label={t("home.loadingAgents")}
        >
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
          <div className="home-latest-empty-title">{t("home.noAgentActivityYet")}</div>
          <div className="home-latest-empty-subtitle">
            {t("home.noAgentActivitySubtitle")}
          </div>
        </div>
      )}
    </div>
  );
}
