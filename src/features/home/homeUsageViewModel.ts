import type {
  AccountSnapshot,
  LocalUsageDay,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../types";
import { formatRelativeTime } from "../../utils/time";
import { getUsageLabels } from "../app/utils/usageLabels";
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function buildHomeUsageViewModel({
  accountInfo,
  accountRateLimits,
  localUsageSnapshot,
  locale,
  t,
  usageMetric,
  usageShowRemaining,
}: {
  accountInfo: AccountSnapshot | null;
  accountRateLimits: RateLimitSnapshot | null;
  localUsageSnapshot: LocalUsageSnapshot | null;
  locale?: string;
  t: Translate;
  usageMetric: UsageMetric;
  usageShowRemaining: boolean;
}): HomeUsageViewModel {
  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const latestUsageDay = usageDays[usageDays.length - 1] ?? null;
  const last7Days = usageDays.slice(-7);
  const last7Tokens = last7Days.reduce((total, day) => total + day.totalTokens, 0);
  const last7Input = last7Days.reduce((total, day) => total + day.inputTokens, 0);
  const last7Cached = last7Days.reduce((total, day) => total + day.cachedInputTokens, 0);
  const last7AgentMs = last7Days.reduce((total, day) => total + (day.agentTimeMs ?? 0), 0);
  const last30AgentMs = usageDays.reduce((total, day) => total + (day.agentTimeMs ?? 0), 0);
  const averageDailyAgentMs = last7Days.length > 0 ? Math.round(last7AgentMs / last7Days.length) : 0;
  const last7AgentRuns = last7Days.reduce((total, day) => total + (day.agentRuns ?? 0), 0);
  const last30AgentRuns = usageDays.reduce((total, day) => total + (day.agentRuns ?? 0), 0);
  const averageTokensPerRun = last7AgentRuns > 0 ? Math.round(last7Tokens / last7AgentRuns) : null;
  const averageRunDurationMs = last7AgentRuns > 0 ? Math.round(last7AgentMs / last7AgentRuns) : null;
  const last7ActiveDays = last7Days.filter(isUsageDayActive).length;
  const last30ActiveDays = usageDays.filter(isUsageDayActive).length;
  const averageActiveDayAgentMs = last7ActiveDays > 0 ? Math.round(last7AgentMs / last7ActiveDays) : null;
  const peakAgentDay = usageDays.reduce<{ day: string; agentTimeMs: number } | null>((best, day) => {
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
            label: t("home.usageCards.today"),
            value: formatCompactNumber(latestUsageDay?.totalTokens ?? 0, locale),
            suffix: t("home.units.tokens"),
            caption: latestUsageDay
              ? t("home.usageCards.todayCaption", {
                  day: formatDayLabel(latestUsageDay.day, locale),
                  input: formatCount(latestUsageDay.inputTokens, locale),
                  output: formatCount(latestUsageDay.outputTokens, locale),
                })
              : t("home.usageCards.latestAvailableDay"),
          },
          {
            label: t("home.usageCards.last7Days"),
            value: formatCompactNumber(usageTotals?.last7DaysTokens ?? last7Tokens, locale),
            suffix: t("home.units.tokens"),
            caption: t("home.usageCards.averagePerDayCaption", {
              value: formatCompactNumber(usageTotals?.averageDailyTokens, locale),
            }),
          },
          {
            label: t("home.usageCards.last30Days"),
            value: formatCompactNumber(usageTotals?.last30DaysTokens ?? last7Tokens, locale),
            suffix: t("home.units.tokens"),
            caption: t("home.usageCards.totalCaption", {
              value: formatCount(usageTotals?.last30DaysTokens ?? last7Tokens, locale),
            }),
          },
          {
            label: t("home.usageCards.cacheHitRate"),
            value: usageTotals ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%` : "--",
            caption: t("home.usageCards.last7DaysCaption"),
          },
          {
            label: t("home.usageCards.cachedTokens"),
            value: formatCompactNumber(last7Cached, locale),
            suffix: t("home.units.saved"),
            caption:
              last7Input > 0
                ? t("home.usageCards.cachedTokensCaption", {
                    percent: ((last7Cached / last7Input) * 100).toFixed(1),
                  })
                : t("home.usageCards.last7DaysCaption"),
          },
          {
            label: t("home.usageCards.averagePerRun"),
            value: averageTokensPerRun === null ? "--" : formatCompactNumber(averageTokensPerRun, locale),
            suffix: t("home.units.tokens"),
            caption:
              last7AgentRuns > 0
                ? t("home.usageCards.runsInLast7DaysCaption", {
                    count: formatCount(last7AgentRuns, locale),
                  })
                : t("home.usageCards.noRunsYet"),
          },
          {
            label: t("home.usageCards.peakDay"),
            value: formatDayLabel(usageTotals?.peakDay, locale),
            caption: t("home.usageCards.peakDayTokensCaption", {
              value: formatCompactNumber(usageTotals?.peakDayTokens, locale),
            }),
          },
        ]
      : [
          {
            label: t("home.usageCards.last7Days"),
            value: formatDurationCompact(last7AgentMs),
            suffix: t("home.units.agentTime"),
            caption: t("home.usageCards.averageDurationPerDayCaption", {
              value: formatDurationCompact(averageDailyAgentMs),
            }),
          },
          {
            label: t("home.usageCards.last30Days"),
            value: formatDurationCompact(last30AgentMs),
            suffix: t("home.units.agentTime"),
            caption: t("home.usageCards.totalDurationCaption", {
              value: formatDuration(last30AgentMs),
            }),
          },
          {
            label: t("home.usageCards.runs"),
            value: formatCount(last7AgentRuns, locale),
            suffix: t("home.units.runs"),
            caption: t("home.usageCards.last30DaysRunsCaption", {
              count: formatCount(last30AgentRuns, locale),
            }),
          },
          {
            label: t("home.usageCards.averagePerRun"),
            value: formatDurationCompact(averageRunDurationMs),
            caption:
              last7AgentRuns > 0
                ? t("home.usageCards.acrossRunsCaption", {
                    count: formatCount(last7AgentRuns, locale),
                  })
                : t("home.usageCards.noRunsYet"),
          },
          {
            label: t("home.usageCards.averagePerActiveDay"),
            value: formatDurationCompact(averageActiveDayAgentMs),
            caption:
              last7ActiveDays > 0
                ? t("home.usageCards.activeDaysInLast7Caption", {
                    count: formatCount(last7ActiveDays, locale),
                  })
                : t("home.usageCards.noActiveDaysYet"),
          },
          {
            label: t("home.usageCards.peakDay"),
            value: formatDayLabel(peakAgentDay?.day ?? null, locale),
            caption: t("home.usageCards.peakDayAgentTimeCaption", {
              value: formatDurationCompact(peakAgentDay?.agentTimeMs ?? 0),
            }),
          },
        ];

  const usageInsights = [
    {
      label: t("home.usageInsights.longestStreak"),
      value: longestStreak > 0 ? formatDayCount(longestStreak, t("home.units.days")) : "--",
      caption: longestStreak > 0 ? t("home.usageInsights.longestStreakCaption") : t("home.usageInsights.noActiveStreakYet"),
      compact: true,
    },
    {
      label: t("home.usageInsights.activeDays"),
      value: last7Days.length > 0 ? `${last7ActiveDays} / ${last7Days.length}` : "--",
      caption:
        usageDays.length > 0
          ? t("home.usageInsights.activeDaysCaption", {
              activeDays: last30ActiveDays,
              totalDays: usageDays.length,
            })
          : t("home.usageInsights.noActivityYet"),
      compact: true,
    },
  ] satisfies HomeStatCard[];

  const usagePercentLabels = getUsageLabels(accountRateLimits, usageShowRemaining, t);
  const planLabel = formatPlanType(accountRateLimits?.planType ?? accountInfo?.planType);
  const creditsBalance = formatCreditsBalance(accountRateLimits?.credits?.balance, locale);
  const accountCards: HomeStatCard[] = [];

  if (usagePercentLabels.sessionPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? t("home.account.sessionLeft") : t("home.account.sessionUsage"),
      value: `${usagePercentLabels.sessionPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.sessionResetLabel,
        accountRateLimits?.primary?.windowDurationMins,
        t("home.account.currentWindow"),
        t("home.units.days"),
        t("home.account.window"),
      ),
    });
  }

  if (usagePercentLabels.showWeekly && usagePercentLabels.weeklyPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? t("home.account.weeklyLeft") : t("home.account.weeklyUsage"),
      value: `${usagePercentLabels.weeklyPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.weeklyResetLabel,
        accountRateLimits?.secondary?.windowDurationMins,
        t("home.account.longerWindow"),
        t("home.units.days"),
        t("home.account.window"),
      ),
    });
  }

  if (accountRateLimits?.credits?.hasCredits) {
    accountCards.push(
      accountRateLimits.credits.unlimited
        ? {
            label: t("home.account.credits"),
            value: t("home.account.unlimited"),
            caption: t("home.account.availableBalance"),
          }
        : {
            label: t("home.account.credits"),
            value: creditsBalance ?? "--",
            suffix: creditsBalance ? t("home.account.creditsSuffix") : null,
            caption: t("home.account.availableBalance"),
          },
    );
  }

  if (planLabel) {
    accountCards.push({
      label: t("home.account.plan"),
      value: planLabel,
      caption: formatAccountTypeLabel(accountInfo?.type, {
        chatgpt: t("home.account.chatgptAccount"),
        apikey: t("home.account.apiKey"),
        connected: t("home.account.connectedAccount"),
      }),
    });
  }

  return {
    accountCards,
    accountMeta: accountInfo?.email ?? null,
    updatedLabel: localUsageSnapshot
      ? t("home.updated", {
          time: formatRelativeTime(localUsageSnapshot.updatedAt),
        })
      : null,
    usageCards,
    usageDays,
    usageInsights,
  };
}
