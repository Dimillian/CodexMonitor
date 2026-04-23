import type {
  AccountSnapshot,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../../types";
import { HomeActions } from "./HomeActions";
import { HomeLatestAgentsSection } from "./HomeLatestAgentsSection";
import { HomeUsageSection } from "./HomeUsageSection";
import type {
  LatestAgentRun,
  UsageMetric,
  UsageWorkspaceOption,
} from "../homeTypes";
import { useI18n } from "@/i18n";

type HomeProps = {
  onAddWorkspace: () => void;
  onAddWorkspaceFromUrl: () => void;
  latestAgentRuns: LatestAgentRun[];
  isLoadingLatestAgents: boolean;
  localUsageSnapshot: LocalUsageSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  onRefreshLocalUsage: () => void;
  usageMetric: UsageMetric;
  onUsageMetricChange: (metric: UsageMetric) => void;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: UsageWorkspaceOption[];
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  accountInfo: AccountSnapshot | null;
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function Home({
  onAddWorkspace,
  onAddWorkspaceFromUrl,
  latestAgentRuns,
  isLoadingLatestAgents,
  localUsageSnapshot,
  isLoadingLocalUsage,
  localUsageError,
  onRefreshLocalUsage,
  usageMetric,
  onUsageMetricChange,
  usageWorkspaceId,
  usageWorkspaceOptions,
  onUsageWorkspaceChange,
  accountRateLimits,
  usageShowRemaining,
  accountInfo,
  onSelectThread,
}: HomeProps) {
  const { tx } = useI18n();

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-title">{tx("Codex Monitor")}</div>
        <div className="home-subtitle">
          {tx("Orchestrate agents across your local projects.")}
        </div>
      </div>
      <HomeLatestAgentsSection
        latestAgentRuns={latestAgentRuns}
        isLoadingLatestAgents={isLoadingLatestAgents}
        onSelectThread={onSelectThread}
      />
      <HomeActions
        onAddWorkspace={onAddWorkspace}
        onAddWorkspaceFromUrl={onAddWorkspaceFromUrl}
      />
      <HomeUsageSection
        accountInfo={accountInfo}
        accountRateLimits={accountRateLimits}
        isLoadingLocalUsage={isLoadingLocalUsage}
        localUsageError={localUsageError}
        localUsageSnapshot={localUsageSnapshot}
        onRefreshLocalUsage={onRefreshLocalUsage}
        onUsageMetricChange={onUsageMetricChange}
        onUsageWorkspaceChange={onUsageWorkspaceChange}
        usageMetric={usageMetric}
        usageShowRemaining={usageShowRemaining}
        usageWorkspaceId={usageWorkspaceId}
        usageWorkspaceOptions={usageWorkspaceOptions}
      />
    </div>
  );
}
