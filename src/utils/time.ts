import { useTranslation } from "../i18n/hooks/useTranslation";

export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  
  const { t } = useTranslation("common");
  
  if (absSeconds < 5) {
    return t("time.just_now");
  }
  if (absSeconds < 60) {
    const value = Math.max(1, Math.round(absSeconds));
    return diffSeconds < 0 
      ? t("time.seconds_ago", { value }) 
      : t("time.seconds_later", { value });
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return diffSeconds < 0 
      ? t("time.minutes_ago", { value }) 
      : t("time.minutes_later", { value });
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
    return t("time.just_now");
  }
  const value = Math.round(diffSeconds / range.seconds);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  return formatter.format(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  const { t } = useTranslation("common");
  
  if (absSeconds < 60) {
    return t("time.just_now");
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return t("time.minutes_short", { value });
  }
  if (absSeconds < 60 * 60 * 24) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60)));
    return t("time.hours_short", { value });
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60 * 24)));
    return t("time.days_short", { value });
  }
  if (absSeconds < 60 * 60 * 24 * 30) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 7)));
    return t("time.weeks_short", { value });
  }
  if (absSeconds < 60 * 60 * 24 * 365) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 30)));
    return t("time.months_short", { value });
  }
  const value = Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 365)));
  return t("time.years_short", { value });
}
