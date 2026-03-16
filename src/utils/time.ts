import i18n from "@/i18n";

export function formatRelativeTime(timestamp: number, locale?: string | string[]) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 5) {
    return i18n.t("time.now");
  }
  if (absSeconds < 60) {
    const value = Math.max(1, Math.round(absSeconds));
    return diffSeconds < 0
      ? i18n.t("time.secondsAgo", { count: value })
      : `${i18n.t("time.in")} ${i18n.t("time.seconds", { count: value })}`;
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return diffSeconds < 0
      ? i18n.t("time.minutesAgo", { count: value })
      : `${i18n.t("time.in")} ${i18n.t("time.minutes", { count: value })}`;
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
    return i18n.t("time.now");
  }
  const value = Math.round(diffSeconds / range.seconds);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return formatter.format(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number, locale?: string | string[]) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  if (absSeconds < 60) {
    return i18n.t("time.now");
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    // Use Intl.RelativeTimeFormat for short format with locale
    try {
      const formatter = new Intl.RelativeTimeFormat(locale ?? i18n.language, {
        numeric: "auto",
        style: "narrow",
      });
      return formatter.format(-value, "minute");
    } catch {
      // Fallback to simple format
      return i18n.t("time.minutesAgo", { count: value });
    }
  }
  if (absSeconds < 60 * 60 * 24) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60)));
    try {
      const formatter = new Intl.RelativeTimeFormat(locale ?? i18n.language, {
        numeric: "auto",
        style: "narrow",
      });
      return formatter.format(-value, "hour");
    } catch {
      return i18n.t("time.hoursAgo", { count: value });
    }
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    const value = Math.max(1, Math.round(absSeconds / (60 * 60 * 24)));
    try {
      const formatter = new Intl.RelativeTimeFormat(locale ?? i18n.language, {
        numeric: "auto",
        style: "narrow",
      });
      return formatter.format(-value, "day");
    } catch {
      return i18n.t("time.daysAgo", { count: value });
    }
  }
  // For longer periods, use standard format
  return formatRelativeTime(timestamp, locale ?? i18n.language);
}
