import { i18n } from "../i18n";

export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 5) {
    return i18n.t("common:timeNow");
  }
  if (absSeconds < 60) {
    const value = Math.max(1, Math.round(absSeconds));
    return diffSeconds < 0 ? i18n.t("common:timeSAgo", { value }) : i18n.t("common:timeInS", { value });
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return diffSeconds < 0 ? i18n.t("common:timeMAgo", { value }) : i18n.t("common:timeInM", { value });
  }
  const ranges: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];
  const range =
    ranges.find((entry) => absSeconds >= entry.seconds) ||
    ranges[ranges.length - 1];
  if (!range) {
    return i18n.t("common:timeNow");
  }
  const value = Math.round(diffSeconds / range.seconds);
  const formatter = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  return formatter.format(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  if (absSeconds < 60) {
    return i18n.t("common:timeShortNow");
  }
  if (absSeconds < 60 * 60) {
    return i18n.t("common:timeShortM", { value: Math.max(1, Math.round(absSeconds / 60)) });
  }
  if (absSeconds < 60 * 60 * 24) {
    return i18n.t("common:timeShortH", { value: Math.max(1, Math.round(absSeconds / (60 * 60))) });
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    return i18n.t("common:timeShortD", { value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24))) });
  }
  if (absSeconds < 60 * 60 * 24 * 30) {
    return i18n.t("common:timeShortW", { value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 7))) });
  }
  if (absSeconds < 60 * 60 * 24 * 365) {
    return i18n.t("common:timeShortMo", { value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 30))) });
  }
  return i18n.t("common:timeShortY", { value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 365))) });
}
