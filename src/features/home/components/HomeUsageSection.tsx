import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccountSnapshot,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../../types";
import {
  formatCount,
  formatDayLabel,
  formatDuration,
  formatWeekRange,
} from "../homeFormatters";
import type { HomeStatCard, UsageMetric, UsageWorkspaceOption } from "../homeTypes";
import { buildHomeUsageViewModel } from "../homeUsageViewModel";

type HomeUsageSectionProps = {
  accountInfo: AccountSnapshot | null;
  accountRateLimits: RateLimitSnapshot | null;
  isLoadingLocalUsage: boolean;
  localUsageError: string | null;
  localUsageSnapshot: LocalUsageSnapshot | null;
  onRefreshLocalUsage: () => void;
  onUsageMetricChange: (metric: UsageMetric) => void;
  onUsageWorkspaceChange: (workspaceId: string | null) => void;
  usageMetric: UsageMetric;
  usageShowRemaining: boolean;
  usageWorkspaceId: string | null;
  usageWorkspaceOptions: UsageWorkspaceOption[];
};

function HomeUsageCard({ card }: { card: HomeStatCard }) {
  return (
    <div className={card.compact ? "home-usage-card is-compact" : "home-usage-card"}>
      <div className="home-usage-label">{card.label}</div>
      <div className="home-usage-value">
        <span className="home-usage-number">{card.value}</span>
        {card.suffix && <span className="home-usage-suffix">{card.suffix}</span>}
      </div>
      <div className="home-usage-caption">{card.caption}</div>
    </div>
  );
}

export function HomeUsageSection({
  accountInfo,
  accountRateLimits,
  isLoadingLocalUsage,
  localUsageError,
  localUsageSnapshot,
  onRefreshLocalUsage,
  onUsageMetricChange,
  onUsageWorkspaceChange,
  usageMetric,
  usageShowRemaining,
  usageWorkspaceId,
  usageWorkspaceOptions,
}: HomeUsageSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || undefined;
  const [chartWeekOffset, setChartWeekOffset] = useState(0);
  const {
    accountCards,
    accountMeta,
    updatedLabel,
    usageCards,
    usageDays,
    usageInsights,
  } = buildHomeUsageViewModel({
    accountInfo,
    accountRateLimits,
    localUsageSnapshot,
    locale,
    t,
    usageMetric,
    usageShowRemaining,
  });

  const maxHistoricalWeekOffset = Math.max(0, Math.ceil(usageDays.length / 7) - 1);
  useEffect(() => {
    setChartWeekOffset((previous) => Math.min(previous, maxHistoricalWeekOffset));
  }, [maxHistoricalWeekOffset]);

  const chartWeekEnd = Math.max(0, usageDays.length - chartWeekOffset * 7);
  const chartWeekStart = Math.max(0, chartWeekEnd - 7);
  const chartDays = usageDays.slice(chartWeekStart, chartWeekEnd);
  const maxUsageValue = Math.max(
    1,
    ...chartDays.map((day) =>
      usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0,
    ),
  );
  const canShowOlderWeek = chartWeekOffset < maxHistoricalWeekOffset;
  const canShowNewerWeek = chartWeekOffset > 0;
  const chartRangeLabel = formatWeekRange(
    chartDays,
    locale,
    (start, end) => t("home.weekRange", { start, end }),
    t("home.noUsageData"),
  );
  const chartRangeAriaLabel =
    chartDays.length > 0
      ? t("home.usageWeekAriaLabel", {
          start: chartDays[0]?.day,
          end: chartDays[chartDays.length - 1]?.day,
        })
      : t("home.usageWeekEmptyAriaLabel");
  const showUsageSkeleton = isLoadingLocalUsage && !localUsageSnapshot;
  const showUsageEmpty = !isLoadingLocalUsage && !localUsageSnapshot;

  return (
    <div className="home-usage">
      <div className="home-section-header">
        <div className="home-section-title">{t("home.usageSnapshot")}</div>
        <div className="home-section-meta-row">
          {updatedLabel && <div className="home-section-meta">{updatedLabel}</div>}
          <button
            type="button"
            className={isLoadingLocalUsage ? "home-usage-refresh is-loading" : "home-usage-refresh"}
            onClick={onRefreshLocalUsage}
            disabled={isLoadingLocalUsage}
            aria-label={t("home.refreshUsage")}
            title={t("home.refreshUsage")}
          >
            <RefreshCw
              className={isLoadingLocalUsage ? "home-usage-refresh-icon spinning" : "home-usage-refresh-icon"}
              aria-hidden
            />
          </button>
        </div>
      </div>
      <div className="home-usage-controls">
        <div className="home-usage-control-group">
          <span className="home-usage-control-label">{t("home.workspaceLabel")}</span>
          <div className="home-usage-select-wrap">
            <select
              className="home-usage-select"
              value={usageWorkspaceId ?? ""}
              onChange={(event) => onUsageWorkspaceChange(event.target.value || null)}
              disabled={usageWorkspaceOptions.length === 0}
            >
              <option value="">{t("home.allWorkspaces")}</option>
              {usageWorkspaceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="home-usage-control-group">
          <span className="home-usage-control-label">{t("home.viewLabel")}</span>
          <div className="home-usage-toggle" role="group" aria-label={t("home.usageView")}>
            <button
              type="button"
              className={usageMetric === "tokens" ? "home-usage-toggle-button is-active" : "home-usage-toggle-button"}
              onClick={() => onUsageMetricChange("tokens")}
              aria-pressed={usageMetric === "tokens"}
            >
              {t("home.tokens")}
            </button>
            <button
              type="button"
              className={usageMetric === "time" ? "home-usage-toggle-button is-active" : "home-usage-toggle-button"}
              onClick={() => onUsageMetricChange("time")}
              aria-pressed={usageMetric === "time"}
            >
              {t("home.time")}
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
          <div className="home-usage-empty-title">{t("home.noUsageDataYet")}</div>
          <div className="home-usage-empty-subtitle">{t("home.noUsageDataSubtitle")}</div>
          {localUsageError && <div className="home-usage-error">{localUsageError}</div>}
        </div>
      ) : (
        <>
          <div className="home-usage-grid">
            {usageCards.map((card) => (
              <HomeUsageCard card={card} key={card.label} />
            ))}
          </div>
          <div className="home-usage-chart-card">
            <div className="home-usage-chart-nav">
              <div className="home-usage-chart-range" aria-label={chartRangeAriaLabel} aria-live="polite">
                {chartRangeLabel}
              </div>
              <div className="home-usage-chart-actions">
                {canShowOlderWeek && (
                  <button
                    type="button"
                    className="home-usage-chart-button"
                    onClick={() => setChartWeekOffset((current) => current + 1)}
                    aria-label={t("home.showPreviousWeek")}
                    title={t("home.showPreviousWeek")}
                  >
                    <ChevronLeft aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="home-usage-chart-button"
                  onClick={() => setChartWeekOffset((current) => Math.max(0, current - 1))}
                  aria-label={t("home.showNextWeek")}
                  title={t("home.showNextWeek")}
                  disabled={!canShowNewerWeek}
                >
                  <ChevronRight aria-hidden />
                </button>
              </div>
            </div>
            <div className="home-usage-chart">
              {chartDays.map((day) => {
                const value = usageMetric === "tokens" ? day.totalTokens : day.agentTimeMs ?? 0;
                const height = Math.max(6, Math.round((value / maxUsageValue) * 100));
                const tooltip =
                  usageMetric === "tokens"
                    ? t("home.chartTooltip.tokens", {
                        day: formatDayLabel(day.day, locale),
                        value: formatCount(day.totalTokens, locale),
                      })
                    : t("home.chartTooltip.time", {
                        day: formatDayLabel(day.day, locale),
                        value: formatDuration(day.agentTimeMs ?? 0),
                      });
                return (
                  <div className="home-usage-bar" key={day.day} data-value={tooltip}>
                    <span className="home-usage-bar-fill" style={{ height: `${height}%` }} />
                    <span className="home-usage-bar-label">{formatDayLabel(day.day, locale)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="home-usage-insights">
            {usageInsights.map((card) => (
              <HomeUsageCard card={card} key={card.label} />
            ))}
          </div>
          <div className="home-usage-models">
            <div className="home-usage-models-label">
              {t("home.topModels")}
              {usageMetric === "time" && (
                <span className="home-usage-models-hint">{t("home.tokens")}</span>
              )}
            </div>
            <div className="home-usage-models-list">
              {localUsageSnapshot?.topModels?.length ? (
                localUsageSnapshot.topModels.map((model) => (
                  <span
                    className="home-usage-model-chip"
                    key={model.model}
                    title={t("home.topModelTitle", {
                      model: model.model,
                      tokens: formatCount(model.tokens, locale),
                    })}
                  >
                    {model.model}
                    <span className="home-usage-model-share">{model.sharePercent.toFixed(1)}%</span>
                  </span>
                ))
              ) : (
                <span className="home-usage-model-empty">{t("home.noModelsYet")}</span>
              )}
            </div>
            {localUsageError && <div className="home-usage-error">{localUsageError}</div>}
          </div>
        </>
      )}
      {accountCards.length > 0 && (
        <div className="home-account">
          <div className="home-section-header">
            <div className="home-section-title">{t("home.accountLimits")}</div>
            {accountMeta && (
              <div className="home-section-meta-row">
                <div className="home-section-meta">{accountMeta}</div>
              </div>
            )}
          </div>
          <div className="home-usage-grid home-account-grid">
            {accountCards.map((card) => (
              <HomeUsageCard card={card} key={card.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
