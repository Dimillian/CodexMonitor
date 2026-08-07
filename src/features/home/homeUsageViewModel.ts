import type {
  AccountSnapshot,
  LocalUsageDay,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../types";
import { formatRelativeTime } from "../../utils/time";
import { getUsageLabels } from "../app/utils/usageLabels";
import { i18n } from "../../i18n";

const t = i18n.t.bind(i18n);
import {
  buildWindowCaption,
  formatAccountTypeLabel,
  formatCompactNumber,
  formatCount,
  formatCreditsBalance,
  formatDayCount,
  formatDayLabel,
  formatDuration,
  formatDurationCompact,
  formatPlanType,
  isUsageDayActive,
} from "./homeFormatters";
import type { HomeStatCard, UsageMetric } from "./homeTypes";

type HomeUsageViewModel = {
  accountCards: HomeStatCard[];
  accountMeta: string | null;
  updatedLabel: string | null;
  usageCards: HomeStatCard[];
  usageDays: LocalUsageDay[];
  usageInsights: HomeStatCard[];
};

export function buildHomeUsageViewModel({
  accountInfo,
  accountRateLimits,
  localUsageSnapshot,
  usageMetric,
  usageShowRemaining,
}: {
  accountInfo: AccountSnapshot | null;
  accountRateLimits: RateLimitSnapshot | null;
  localUsageSnapshot: LocalUsageSnapshot | null;
  usageMetric: UsageMetric;
  usageShowRemaining: boolean;
}): HomeUsageViewModel {
  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const latestUsageDay = usageDays[usageDays.length - 1] ?? null;
  const last7Days = usageDays.slice(-7);
  const last7Tokens = last7Days.reduce((total, day) => total + day.totalTokens, 0);
  const last7Input = last7Days.reduce((total, day) => total + day.inputTokens, 0);
  const last7Cached = last7Days.reduce(
    (total, day) => total + day.cachedInputTokens,
    0,
  );
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
  const last30AgentRuns = usageDays.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const averageTokensPerRun =
    last7AgentRuns > 0 ? Math.round(last7Tokens / last7AgentRuns) : null;
  const averageRunDurationMs =
    last7AgentRuns > 0 ? Math.round(last7AgentMs / last7AgentRuns) : null;
  const last7ActiveDays = last7Days.filter(isUsageDayActive).length;
  const last30ActiveDays = usageDays.filter(isUsageDayActive).length;
  const averageActiveDayAgentMs =
    last7ActiveDays > 0 ? Math.round(last7AgentMs / last7ActiveDays) : null;
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

  let longestStreak = 0;
  let runningStreak = 0;
  for (const day of usageDays) {
    if (isUsageDayActive(day)) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  const usageCards: HomeStatCard[] =
    usageMetric === "tokens"
      ? [
          {
            label: t("home:statToday"),
            value: formatCompactNumber(latestUsageDay?.totalTokens ?? 0),
            suffix: t("home:statTokens"),
            caption: latestUsageDay
              ? `${formatDayLabel(latestUsageDay.day)} · ${formatCount(
                  latestUsageDay.inputTokens,
                )} in / ${formatCount(latestUsageDay.outputTokens)} out`
              : t("home:statLatestAvailableDay"),
          },
          {
            label: t("home:statLast7Days"),
            value: formatCompactNumber(usageTotals?.last7DaysTokens ?? last7Tokens),
            suffix: t("home:statTokens"),
            caption: t("home:statAvgPerDay", { value: formatCompactNumber(usageTotals?.averageDailyTokens) }),
          },
          {
            label: t("home:statLast30Days"),
            value: formatCompactNumber(usageTotals?.last30DaysTokens ?? last7Tokens),
            suffix: t("home:statTokens"),
            caption: t("home:statTotalValue", { value: formatCount(usageTotals?.last30DaysTokens ?? last7Tokens) }),
          },
          {
            label: t("home:statCacheHitRate"),
            value: usageTotals
              ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%`
              : "--",
            caption: t("home:statLast7Days"),
          },
          {
            label: t("home:statCachedTokens"),
            value: formatCompactNumber(last7Cached),
            suffix: t("home:statSaved"),
            caption:
              last7Input > 0
                ? t("home:statPercentOfPrompt", { percent: ((last7Cached / last7Input) * 100).toFixed(1) })
                : t("home:statLast7Days"),
          },
          {
            label: t("home:statAvgPerRun"),
            value:
              averageTokensPerRun === null
                ? "--"
                : formatCompactNumber(averageTokensPerRun),
            suffix: t("home:statTokens"),
            caption:
              last7AgentRuns > 0
                ? t("home:statRunsInLast7Days", { count: last7AgentRuns })
                : t("home:statNoRunsYetCaption"),
          },
          {
            label: t("home:statPeakDay"),
            value: formatDayLabel(usageTotals?.peakDay),
            caption: `${formatCompactNumber(usageTotals?.peakDayTokens)} ${t("home:statTokens")}`,
          },
        ]
      : [
          {
            label: t("home:statLast7Days"),
            value: formatDurationCompact(last7AgentMs),
            suffix: t("home:statAgentTime"),
            caption: t("home:statAvgPerDay", { value: formatDurationCompact(averageDailyAgentMs) }),
          },
          {
            label: t("home:statLast30Days"),
            value: formatDurationCompact(last30AgentMs),
            suffix: t("home:statAgentTime"),
            caption: t("home:statTotalValue", { value: formatDuration(last30AgentMs) }),
          },
          {
            label: t("home:statRuns"),
            value: formatCount(last7AgentRuns),
            suffix: t("home:statRunsSuffix"),
            caption: `${t("home:statLast30Days")}: ${formatCount(last30AgentRuns)} ${t("home:statRuns")}`,
          },
          {
            label: t("home:statAvgPerRun"),
            value: formatDurationCompact(averageRunDurationMs),
            caption:
              last7AgentRuns > 0
                ? t("home:statAcrossRuns", { count: last7AgentRuns })
                : t("home:statNoRunsYetCaption"),
          },
          {
            label: t("home:statAvgPerActiveDay"),
            value: formatDurationCompact(averageActiveDayAgentMs),
            caption:
              last7ActiveDays > 0
                ? t("home:statActiveDaysInLast7", { count: last7ActiveDays })
                : t("home:statNoActiveDaysYetCaption"),
          },
          {
            label: t("home:statPeakDay"),
            value: formatDayLabel(peakAgentDay?.day ?? null),
            caption: t("home:statAgentTimeValue", { value: formatDurationCompact(peakAgentDay?.agentTimeMs ?? 0) }),
          },
        ];

  const usageInsights = [
    {
      label: t("home:statLongestStreak"),
      value: longestStreak > 0 ? formatDayCount(longestStreak) : "--",
      caption:
        longestStreak > 0
          ? t("home:statAcrossCurrentRange")
          : t("home:statNoActiveStreakYet"),
      compact: true,
    },
    {
      label: t("home:statActiveDays"),
      value: last7Days.length > 0 ? `${last7ActiveDays} / ${last7Days.length}` : "--",
      caption:
        usageDays.length > 0
          ? t("home:statInCurrentRange", { countActive: last30ActiveDays, countTotal: usageDays.length })
          : t("home:statNoActivityYetCaption"),
      compact: true,
    },
  ] satisfies HomeStatCard[];

  const usagePercentLabels = getUsageLabels(accountRateLimits, usageShowRemaining);
  const planLabel = formatPlanType(accountRateLimits?.planType ?? accountInfo?.planType);
  const creditsBalance = formatCreditsBalance(accountRateLimits?.credits?.balance);
  const accountCards: HomeStatCard[] = [];

  if (usagePercentLabels.sessionPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? t("home:statSessionLeft") : t("home:statSessionUsage"),
      value: `${usagePercentLabels.sessionPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.sessionResetLabel,
        accountRateLimits?.primary?.windowDurationMins,
        t("home:statCurrentWindow"),
      ),
    });
  }

  if (usagePercentLabels.showWeekly && usagePercentLabels.weeklyPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? t("home:statWeeklyLeft") : t("home:statWeeklyUsage"),
      value: `${usagePercentLabels.weeklyPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.weeklyResetLabel,
        accountRateLimits?.secondary?.windowDurationMins,
        t("home:statLongerWindow"),
      ),
    });
  }

  if (accountRateLimits?.credits?.hasCredits) {
    accountCards.push(
      accountRateLimits.credits.unlimited
        ? {
            label: t("home:statCredits"),
            value: t("home:statUnlimited"),
            caption: t("home:statAvailableBalance"),
          }
        : {
            label: t("home:statCredits"),
            value: creditsBalance ?? "--",
            suffix: creditsBalance ? t("home:statCreditsSuffix") : null,
            caption: t("home:statAvailableBalance"),
          },
    );
  }

  if (planLabel) {
    accountCards.push({
      label: t("home:statPlan"),
      value: planLabel,
      caption: formatAccountTypeLabel(accountInfo?.type),
    });
  }

  return {
    accountCards,
    accountMeta: accountInfo?.email ?? null,
    updatedLabel: localUsageSnapshot
      ? t("home:updatedLabel", { time: formatRelativeTime(localUsageSnapshot.updatedAt) })
      : null,
    usageCards,
    usageDays,
    usageInsights,
  };
}
