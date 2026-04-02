import type { AccountSnapshot, LocalUsageDay } from "../../types";

export function formatCompactNumber(value: number | null | undefined, locale?: string) {
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
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCount(value: number | null | undefined, locale?: string) {
  if (value === null || value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDuration(valueMs: number | null | undefined) {
  if (valueMs === null || valueMs === undefined) {
    return "--";
  }
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return `${totalSeconds}s`;
}

export function formatDurationCompact(valueMs: number | null | undefined) {
  if (valueMs === null || valueMs === undefined) {
    return "--";
  }
  const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
  if (totalMinutes >= 60) {
    const hours = totalMinutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  const seconds = Math.max(0, Math.round(valueMs / 1000));
  return `${seconds}s`;
}

export function formatDayLabel(value: string | null | undefined, locale?: string) {
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
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatWeekRange(
  days: LocalUsageDay[],
  locale?: string,
  formatRange?: (start: string, end: string) => string,
  emptyLabel = "No usage data",
) {
  if (days.length === 0) {
    return emptyLabel;
  }
  const first = days[0];
  const last = days[days.length - 1];
  const firstLabel = formatDayLabel(first?.day, locale);
  const lastLabel = formatDayLabel(last?.day, locale);
  return first?.day === last?.day
    ? firstLabel
    : formatRange
      ? formatRange(firstLabel, lastLabel)
      : `${firstLabel} to ${lastLabel}`;
}

export function isUsageDayActive(day: LocalUsageDay) {
  return day.totalTokens > 0 || day.agentTimeMs > 0 || day.agentRuns > 0;
}

export function formatPlanType(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAccountTypeLabel(
  value: AccountSnapshot["type"] | null | undefined,
  labels?: {
    chatgpt: string;
    apikey: string;
    connected: string;
  },
) {
  if (value === "chatgpt") {
    return labels?.chatgpt ?? "ChatGPT account";
  }
  if (value === "apikey") {
    return labels?.apikey ?? "API key";
  }
  return labels?.connected ?? "Connected account";
}

export function formatWindowDuration(
  valueMins: number | null | undefined,
  dayLabel = "days",
  windowLabel = "window",
) {
  if (typeof valueMins !== "number" || !Number.isFinite(valueMins) || valueMins <= 0) {
    return null;
  }
  if (valueMins >= 60 * 24) {
    const days = Math.round(valueMins / (60 * 24));
    return `${days} ${dayLabel} ${windowLabel}`;
  }
  if (valueMins >= 60) {
    return `${Math.round(valueMins / 60)}h ${windowLabel}`;
  }
  return `${Math.round(valueMins)}m ${windowLabel}`;
}

export function buildWindowCaption(
  resetLabel: string | null,
  windowDurationMins: number | null | undefined,
  fallback: string,
  dayLabel = "days",
  windowLabel = "window",
) {
  const parts = [
    resetLabel,
    formatWindowDuration(windowDurationMins, dayLabel, windowLabel),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : fallback;
}

export function formatCreditsBalance(value: string | null | undefined, locale?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return trimmed;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatDayCount(value: number | null | undefined, dayLabel = "days") {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value} ${dayLabel}`;
}
