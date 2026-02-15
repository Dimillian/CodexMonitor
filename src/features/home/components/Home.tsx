import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import type { LocalUsageSnapshot } from "../../../types";
import { UI_LOCALE } from "../../../i18n/locale";
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

type UsageMetric = "tokens" | "time";

type UsageWorkspaceOption = {
  id: string;
  label: string;
};

type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
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
  onSelectThread: (workspaceId: string, threadId: string) => void;
};

export function Home({
  onOpenProject,
  onAddWorkspace,
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
  onSelectThread,
}: HomeProps) {
  const formatCompactNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "--";
    }
    if (value >= 1_000_000_000) {
      const scaled = value / 1_000_000_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}b`;
    }
    if (value >= 1_000_000) {
      const scaled = value / 1_000_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}m`;
    }
    if (value >= 1_000) {
      const scaled = value / 1_000;
      return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}k`;
    }
    return String(value);
  };

  const formatCount = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "--";
    }
    return new Intl.NumberFormat(UI_LOCALE).format(value);
  };

  const formatDuration = (valueMs: number | null | undefined) => {
    if (valueMs === null || valueMs === undefined) {
      return "--";
    }
    const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}小时 ${minutes}分`;
    }
    if (totalMinutes > 0) {
      return `${totalMinutes}分`;
    }
    return `${totalSeconds}秒`;
  };

  const formatDurationCompact = (valueMs: number | null | undefined) => {
    if (valueMs === null || valueMs === undefined) {
      return "--";
    }
    const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
    if (totalMinutes >= 60) {
      const hours = totalMinutes / 60;
      return `${hours.toFixed(hours >= 10 ? 0 : 1)}小时`;
    }
    if (totalMinutes > 0) {
      return `${totalMinutes}分`;
    }
    const seconds = Math.max(0, Math.round(valueMs / 1000));
    return `${seconds}秒`;
  };

  const formatDayLabel = (value: string | null | undefined) => {
    if (!value) {
      return "--";
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return value;
    }
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(UI_LOCALE, {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const latestRun = latestAgentRuns[0] ?? null;
  const last7Days = usageDays.slice(-7);
  const last7AgentMs = last7Days.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const last30AgentMs = usageDays.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const averageDailyAgentMs =
    last7Days.length > 0 ? Math.round(last7AgentMs / last7Days.length) : 0;
  const last7AgentRuns = last7Days.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const peakAgentDay = usageDays.reduce<
    | { day: string; agentTimeMs: number }
    | null
  >((best, day) => {
    const value = day.agentTimeMs ?? 0;
    if (value <= 0) {
      return best;
    }
    if (!best || value > best.agentTimeMs) {
      return { day: day.day, agentTimeMs: value };
    }
    return best;
  }, null);
  const peakAgentDayLabel = peakAgentDay?.day ?? null;
  const peakAgentTimeMs = peakAgentDay?.agentTimeMs ?? 0;
  const maxUsageValue = Math.max(
    1,
    ...last7Days.map((day) =>
      usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0,
    ),
  );
  const updatedLabel = localUsageSnapshot
    ? `更新于 ${formatRelativeTime(localUsageSnapshot.updatedAt)}`
    : null;
  const showUsageSkeleton = isLoadingLocalUsage && !localUsageSnapshot;
  const showUsageEmpty = !isLoadingLocalUsage && !localUsageSnapshot;

  const handleResumeLatest = () => {
    if (!latestRun) {
      return;
    }
    onSelectThread(latestRun.workspaceId, latestRun.threadId);
  };

  const handleExploreMore = () => {
    const usageSection = document.querySelector(".home-usage");
    if (!(usageSection instanceof HTMLElement)) {
      return;
    }
    usageSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-icon" aria-hidden>
          <Sparkles size={18} />
        </div>
        <div className="home-hero-eyebrow">CodexMonitor</div>
        <div className="home-title">Let&apos;s build</div>
        <div className="home-subtitle">
          对话优先、文档优先的 AI 编码工作台。
        </div>
        <div className="home-hero-shortcuts" aria-label="快捷入口">
          <span>⌘K 命令菜单</span>
          <span>/ Slash 命令</span>
          <span>$ Skills</span>
          <span>@ 文件上下文</span>
        </div>
      </div>
      <div className="home-suggestions">
        <div className="home-suggestions-header">
          <div className="home-section-title">快速开始</div>
          <button
            type="button"
            className="home-suggestions-explore"
            onClick={handleExploreMore}
          >
            探索更多
          </button>
        </div>
        <div className="home-suggestions-grid">
          <button className="home-suggestion-card" type="button" onClick={onOpenProject}>
            <span className="home-suggestion-icon" aria-hidden>
              🎮
            </span>
            <span className="home-suggestion-title">打开项目并开始对话</span>
            <span className="home-suggestion-description">
              选择本地仓库，立即进入提问 - 审阅 - 修改闭环。
            </span>
          </button>
          <button className="home-suggestion-card" type="button" onClick={onAddWorkspace}>
            <span className="home-suggestion-icon" aria-hidden>
              📊
            </span>
            <span className="home-suggestion-title">添加工作区并连接 Codex</span>
            <span className="home-suggestion-description">
              接入新环境，集中管理多项目上下文与历史对话。
            </span>
          </button>
          <button
            className="home-suggestion-card"
            type="button"
            onClick={handleResumeLatest}
            disabled={!latestRun}
          >
            <span className="home-suggestion-icon" aria-hidden>
              👤
            </span>
            <span className="home-suggestion-title">继续最近一次任务</span>
            <span className="home-suggestion-description">
              {latestRun
                ? `继续 ${latestRun.projectName} 的最新对话，减少上下文切换。`
                : "暂无最近对话，先发起一次新会话。"}
            </span>
          </button>
        </div>
      </div>
      <div className="home-latest">
        <div className="home-latest-header">
          <div className="home-latest-label">最新对话</div>
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
                <span className="home-latest-card-header">
                  <span className="home-latest-project">
                    <span className="home-latest-project-name">{run.projectName}</span>
                    {run.groupName && (
                      <span className="home-latest-group">{run.groupName}</span>
                    )}
                  </span>
                  <span className="home-latest-time">
                    {formatRelativeTime(run.timestamp)}
                  </span>
                </span>
                <span className="home-latest-message">
                  {run.message.trim() || "Agent 已回复。"}
                </span>
                {run.isProcessing && (
                  <span className="home-latest-status">运行中</span>
                )}
              </button>
            ))}
          </div>
        ) : isLoadingLatestAgents ? (
          <div className="home-latest-grid home-latest-grid-loading" aria-label="正在加载对话">
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
            <div className="home-latest-empty-title">暂无对话记录</div>
            <div className="home-latest-empty-subtitle">
              发起一个对话后，这里会显示最新回复。
            </div>
          </div>
        )}
      </div>
      <div className="home-actions">
        <button
<<<<<<< HEAD
          className="home-button secondary"
          onClick={onOpenProject}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            <FolderOpen size={16} />
          </span>
          打开项目
        </button>
        <button
          className="home-button secondary"
=======
          className="home-button primary"
>>>>>>> origin/main
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            +
          </span>
<<<<<<< HEAD
          添加工作区
=======
          Add Workspaces
        </button>
        <button
          className="home-button secondary"
          onClick={onOpenSettings}
          data-tauri-drag-region="false"
        >
          <span className="home-icon" aria-hidden>
            <Settings size={18} />
          </span>
          Settings
>>>>>>> origin/main
        </button>
      </div>
      <div className="home-usage">
        <div className="home-section-header">
          <div className="home-section-title">使用概览</div>
          <div className="home-section-meta-row">
            {updatedLabel && <div className="home-section-meta">{updatedLabel}</div>}
            <button
              type="button"
              className={
                isLoadingLocalUsage
                  ? "home-usage-refresh is-loading"
                  : "home-usage-refresh"
              }
              onClick={onRefreshLocalUsage}
              disabled={isLoadingLocalUsage}
              aria-label="刷新用量"
              title="刷新用量"
            >
              <RefreshCw
                className={
                  isLoadingLocalUsage
                    ? "home-usage-refresh-icon spinning"
                    : "home-usage-refresh-icon"
                }
                aria-hidden
              />
            </button>
          </div>
        </div>
        <div className="home-usage-controls">
          <div className="home-usage-control-group">
            <span className="home-usage-control-label">工作区</span>
            <div className="home-usage-select-wrap">
              <select
                className="home-usage-select"
                aria-label="选择工作区"
                value={usageWorkspaceId ?? ""}
                onChange={(event) =>
                  onUsageWorkspaceChange(event.target.value || null)
                }
                disabled={usageWorkspaceOptions.length === 0}
              >
                <option value="">全部工作区</option>
                {usageWorkspaceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="home-usage-control-group">
            <span className="home-usage-control-label">视图</span>
            <div className="home-usage-toggle" role="group" aria-label="用量视图">
              <button
                type="button"
                className={
                  usageMetric === "tokens"
                    ? "home-usage-toggle-button is-active"
                    : "home-usage-toggle-button"
                }
                onClick={() => onUsageMetricChange("tokens")}
                aria-pressed={usageMetric === "tokens"}
              >
                令牌
              </button>
              <button
                type="button"
                className={
                  usageMetric === "time"
                    ? "home-usage-toggle-button is-active"
                    : "home-usage-toggle-button"
                }
                onClick={() => onUsageMetricChange("time")}
                aria-pressed={usageMetric === "time"}
              >
                时长
              </button>
            </div>
          </div>
        </div>
        {showUsageSkeleton ? (
          <div className="home-usage-skeleton">
            <div className="home-usage-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="home-usage-card" key={index}>
                  <span className="home-latest-skeleton home-usage-skeleton-label" />
                  <span className="home-latest-skeleton home-usage-skeleton-value" />
                </div>
              ))}
            </div>
            <div className="home-usage-chart-card">
              <span className="home-latest-skeleton home-usage-skeleton-chart" />
            </div>
          </div>
        ) : showUsageEmpty ? (
          <div className="home-usage-empty">
            <div className="home-usage-empty-title">暂无使用数据</div>
            <div className="home-usage-empty-subtitle">
              运行一次 Codex 会话后，这里会开始统计本地用量。
            </div>
            {localUsageError && (
              <div className="home-usage-error">{localUsageError}</div>
            )}
          </div>
        ) : (
          <>
            <div className="home-usage-grid">
              {usageMetric === "tokens" ? (
                <>
                  <div className="home-usage-card">
                    <div className="home-usage-label">近 7 天</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatCompactNumber(usageTotals?.last7DaysTokens)}
                      </span>
                      <span className="home-usage-suffix">令牌</span>
                    </div>
                    <div className="home-usage-caption">
                      日均 {formatCompactNumber(usageTotals?.averageDailyTokens)}
                    </div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">近 30 天</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatCompactNumber(usageTotals?.last30DaysTokens)}
                      </span>
                      <span className="home-usage-suffix">令牌</span>
                    </div>
                    <div className="home-usage-caption">
                      总计 {formatCount(usageTotals?.last30DaysTokens)}
                    </div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">缓存命中率</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {usageTotals
                          ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%`
                          : "--"}
                      </span>
                    </div>
                    <div className="home-usage-caption">近 7 天</div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">峰值日期</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatDayLabel(usageTotals?.peakDay)}
                      </span>
                    </div>
                    <div className="home-usage-caption">
                      {formatCompactNumber(usageTotals?.peakDayTokens)} 令牌
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="home-usage-card">
                    <div className="home-usage-label">近 7 天</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatDurationCompact(last7AgentMs)}
                      </span>
                      <span className="home-usage-suffix">Agent 时长</span>
                    </div>
                    <div className="home-usage-caption">
                      日均 {formatDurationCompact(averageDailyAgentMs)}
                    </div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">近 30 天</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatDurationCompact(last30AgentMs)}
                      </span>
                      <span className="home-usage-suffix">Agent 时长</span>
                    </div>
                    <div className="home-usage-caption">
                      总计 {formatDuration(last30AgentMs)}
                    </div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">运行次数</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatCount(last7AgentRuns)}
                      </span>
                      <span className="home-usage-suffix">次</span>
                    </div>
                    <div className="home-usage-caption">近 7 天</div>
                  </div>
                  <div className="home-usage-card">
                    <div className="home-usage-label">峰值日期</div>
                    <div className="home-usage-value">
                      <span className="home-usage-number">
                        {formatDayLabel(peakAgentDayLabel)}
                      </span>
                    </div>
                    <div className="home-usage-caption">
                      {formatDurationCompact(peakAgentTimeMs)} Agent 时长
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="home-usage-chart-card">
              <div className="home-usage-chart">
                {last7Days.map((day) => {
                  const value =
                    usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0;
                  const height = Math.max(
                    6,
                    Math.round((value / maxUsageValue) * 100),
                  );
                  const tooltip =
                    usageMetric === "tokens"
                      ? `${formatDayLabel(day.day)} · ${formatCount(day.totalTokens)} 令牌`
                      : `${formatDayLabel(day.day)} · ${formatDuration(day.agentTimeMs ?? 0)} Agent 时长`;
                  return (
                    <div
                      className="home-usage-bar"
                      key={day.day}
                      data-value={tooltip}
                    >
                      <span
                        className="home-usage-bar-fill"
                        ref={(node) => {
                          if (node) {
                            node.style.setProperty(
                              "--home-usage-bar-fill-height",
                              `${height}%`,
                            );
                          }
                        }}
                      />
                      <span className="home-usage-bar-label">
                        {formatDayLabel(day.day)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="home-usage-models">
              <div className="home-usage-models-label">
                主要模型
                {usageMetric === "time" && (
                  <span className="home-usage-models-hint">令牌</span>
                )}
              </div>
              <div className="home-usage-models-list">
                {localUsageSnapshot?.topModels?.length ? (
                  localUsageSnapshot.topModels.map((model) => {
                    const modelId = model.model.toLowerCase();
                    const isCodex = modelId.includes("codex") || modelId.includes("gpt-5");
                    const isClaude = modelId.includes("claude");
                    const isGemini = modelId.includes("gemini");
                    const providerPrefix = isCodex ? "🔵" : isClaude ? "🟠" : isGemini ? "🟢" : "";
                    return (
                      <span
                        className="home-usage-model-chip"
                        key={model.model}
                        title={`${model.model}: ${formatCount(model.tokens)} 令牌 (${isCodex ? "Codex" : isClaude ? "Claude/Antigravity" : isGemini ? "Gemini/Antigravity" : "其他"})`}
                      >
                        {providerPrefix} {model.model}
                        <span className="home-usage-model-share">
                          {model.sharePercent.toFixed(1)}%
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="home-usage-model-empty">暂无模型数据</span>
                )}
              </div>
              {localUsageError && (
                <div className="home-usage-error">{localUsageError}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
