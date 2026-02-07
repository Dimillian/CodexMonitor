export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 5) {
    return "刚刚";
  }
  if (absSeconds < 60) {
    const value = Math.max(1, Math.round(absSeconds));
    return diffSeconds < 0 ? `${value}秒前` : `${value}秒后`;
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return diffSeconds < 0 ? `${value}分钟前` : `${value}分钟后`;
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
    return "刚刚";
  }
  const value = Math.round(diffSeconds / range.seconds);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  return formatter.format(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  if (absSeconds < 60) {
    return "刚刚";
  }
  if (absSeconds < 60 * 60) {
    return `${Math.max(1, Math.round(absSeconds / 60))}分钟`;
  }
  if (absSeconds < 60 * 60 * 24) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60)))}小时`;
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24)))}天`;
  }
  if (absSeconds < 60 * 60 * 24 * 30) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 7)))}周`;
  }
  if (absSeconds < 60 * 60 * 24 * 365) {
    return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 30)))}月`;
  }
  return `${Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 365)))}年`;
}
