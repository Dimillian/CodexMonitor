import type { RateLimitSnapshot } from "../../../types";
import { formatRelativeTime } from "../../../utils/time";

type Translate = (key: string, options?: Record<string, unknown>) => string;

type UsageLabels = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
};

const clampPercent = (value: number) =>
  Math.min(Math.max(Math.round(value), 0), 100);

const defaultTranslate: Translate = (key, options) => {
  switch (key) {
    case "home.account.resets":
      return `Resets ${String(options?.time ?? "")}`.trim();
    case "home.account.unlimited":
      return "Unlimited";
    case "sidebar.availableCredits":
      return `Available credits: ${String(options?.value ?? "")}`.trim();
    default:
      return key;
  }
};

function formatResetLabel(t: Translate, resetsAt?: number | null) {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) {
    return null;
  }
  const resetMs = resetsAt > 1_000_000_000_000 ? resetsAt : resetsAt * 1000;
  const relative = formatRelativeTime(resetMs).replace(/^in\s+/i, "");
  return t("home.account.resets", { time: relative });
}

function formatCreditsLabel(
  accountRateLimits: RateLimitSnapshot | null,
  t: Translate,
) {
  const credits = accountRateLimits?.credits ?? null;
  if (!credits?.hasCredits) {
    return null;
  }
  if (credits.unlimited) {
    return t("sidebar.availableCredits", {
      value: t("home.account.unlimited"),
    });
  }
  const balance = credits.balance?.trim() ?? "";
  if (!balance) {
    return null;
  }
  const intValue = Number.parseInt(balance, 10);
  if (Number.isFinite(intValue) && intValue > 0) {
    return t("sidebar.availableCredits", { value: intValue });
  }
  const floatValue = Number.parseFloat(balance);
  if (Number.isFinite(floatValue) && floatValue > 0) {
    const rounded = Math.round(floatValue);
    return rounded > 0 ? t("sidebar.availableCredits", { value: rounded }) : null;
  }
  return null;
}

export function getUsageLabels(
  accountRateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  t: Translate = defaultTranslate,
): UsageLabels {
  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const sessionPercent =
    typeof usagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(usagePercent)
        : clampPercent(usagePercent)
      : null;
  const weeklyPercent =
    typeof globalUsagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(globalUsagePercent)
        : clampPercent(globalUsagePercent)
      : null;

  return {
    sessionPercent,
    weeklyPercent,
    sessionResetLabel: formatResetLabel(t, accountRateLimits?.primary?.resetsAt),
    weeklyResetLabel: formatResetLabel(t, accountRateLimits?.secondary?.resetsAt),
    creditsLabel: formatCreditsLabel(accountRateLimits, t),
    showWeekly: Boolean(accountRateLimits?.secondary),
  };
}
