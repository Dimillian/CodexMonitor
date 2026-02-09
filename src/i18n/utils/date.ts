import i18next from '../config';

/**
 * 日期格式化工具 - 支持国际化
 */

// 支持的语言环境对应的日期格式
const dateFormats = {
  en: {
    short: 'MM/DD/YYYY',
    medium: 'MMM DD, YYYY',
    long: 'MMMM DD, YYYY',
    full: 'EEEE, MMMM DD, YYYY',
  },
  zh: {
    short: 'YYYY/MM/DD',
    medium: 'YYYY年MM月DD日',
    long: 'YYYY年MM月DD日',
    full: 'YYYY年MM月DD日 星期E',
  },
};

// 支持的语言环境对应的时间格式
const timeFormats = {
  en: {
    short: 'h:mm A',
    medium: 'h:mm:ss A',
    long: 'h:mm:ss A z',
  },
  zh: {
    short: 'HH:mm',
    medium: 'HH:mm:ss',
    long: 'HH:mm:ss z',
  },
};

// 支持的语言环境对应的相对时间格式
const relativeTimeFormats = {
  en: {
    now: 'just now',
    minute: '1 minute ago',
    minutes: '{{count}} minutes ago',
    hour: '1 hour ago',
    hours: '{{count}} hours ago',
    day: '1 day ago',
    days: '{{count}} days ago',
    week: '1 week ago',
    weeks: '{{count}} weeks ago',
    month: '1 month ago',
    months: '{{count}} months ago',
    year: '1 year ago',
    years: '{{count}} years ago',
  },
  zh: {
    now: '刚刚',
    minute: '1分钟前',
    minutes: '{{count}}分钟前',
    hour: '1小时前',
    hours: '{{count}}小时前',
    day: '1天前',
    days: '{{count}}天前',
    week: '1周前',
    weeks: '{{count}}周前',
    month: '1个月前',
    months: '{{count}}个月前',
    year: '1年前',
    years: '{{count}}年前',
  },
};

/**
 * 格式化日期
 * @param date 日期对象或时间戳
 * @param format 格式类型: 'short', 'medium', 'long', 'full'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date | number, format: 'short' | 'medium' | 'long' | 'full' = 'medium'): string {
  const locale = i18next.language as keyof typeof dateFormats;
  const dateObj = typeof date === 'number' ? new Date(date) : date;

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: format,
    });
    return formatter.format(dateObj);
  } catch (error) {
    console.warn('Date formatting failed:', error);
    return dateObj.toISOString().split('T')[0];
  }
}

/**
 * 格式化时间
 * @param date 日期对象或时间戳
 * @param format 格式类型: 'short', 'medium', 'long'
 * @returns 格式化后的时间字符串
 */
export function formatTime(date: Date | number, format: 'short' | 'medium' | 'long' = 'medium'): string {
  const locale = i18next.language as keyof typeof timeFormats;
  const dateObj = typeof date === 'number' ? new Date(date) : date;

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeStyle: format,
    });
    return formatter.format(dateObj);
  } catch (error) {
    console.warn('Time formatting failed:', error);
    return dateObj.toTimeString().split(' ')[0];
  }
}

/**
 * 格式化日期时间
 * @param date 日期对象或时间戳
 * @param dateFormat 日期格式类型
 * @param timeFormat 时间格式类型
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTime(
  date: Date | number,
  dateFormat: 'short' | 'medium' | 'long' | 'full' = 'medium',
  timeFormat: 'short' | 'medium' | 'long' = 'medium'
): string {
  const locale = i18next.language;
  const dateObj = typeof date === 'number' ? new Date(date) : date;

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: dateFormat,
      timeStyle: timeFormat,
    });
    return formatter.format(dateObj);
  } catch (error) {
    console.warn('DateTime formatting failed:', error);
    return `${dateObj.toISOString().split('T')[0]} ${dateObj.toTimeString().split(' ')[0]}`;
  }
}

/**
 * 格式化相对时间
 * @param date 日期对象或时间戳
 * @returns 相对时间字符串
 */
export function formatRelativeTime(date: Date | number): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  const locale = i18next.language as keyof typeof relativeTimeFormats;
  const formats = relativeTimeFormats[locale] || relativeTimeFormats.en;

  if (diffSeconds < 60) {
    return formats.now;
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? formats.minute : formats.minutes.replace('{{count}}', diffMinutes.toString());
  } else if (diffHours < 24) {
    return diffHours === 1 ? formats.hour : formats.hours.replace('{{count}}', diffHours.toString());
  } else if (diffDays < 7) {
    return diffDays === 1 ? formats.day : formats.days.replace('{{count}}', diffDays.toString());
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? formats.week : formats.weeks.replace('{{count}}', diffWeeks.toString());
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? formats.month : formats.months.replace('{{count}}', diffMonths.toString());
  } else {
    return diffYears === 1 ? formats.year : formats.years.replace('{{count}}', diffYears.toString());
  }
}

/**
 * 格式化相对时间（短格式）
 * @param date 日期对象或时间戳
 * @returns 相对时间字符串（短格式，无"前"、"后"等后缀）
 */
export function formatRelativeTimeShort(date: Date | number): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return relativeTimeFormats[i18next.language as keyof typeof relativeTimeFormats]?.now || '刚刚';
  }

  const diffMinutes = Math.floor(absSeconds / 60);
  if (absSeconds < 60 * 60) {
    return `${diffMinutes}分钟`;
  }

  const diffHours = Math.floor(absSeconds / (60 * 60));
  if (absSeconds < 60 * 60 * 24) {
    return `${diffHours}小时`;
  }

  const diffDays = Math.floor(absSeconds / (60 * 60 * 24));
  if (absSeconds < 60 * 60 * 24 * 7) {
    return `${diffDays}天`;
  }

  const diffWeeks = Math.floor(absSeconds / (60 * 60 * 24 * 7));
  if (absSeconds < 60 * 60 * 24 * 30) {
    return `${diffWeeks}周`;
  }

  const diffMonths = Math.floor(absSeconds / (60 * 60 * 24 * 30));
  if (absSeconds < 60 * 60 * 24 * 365) {
    return `${diffMonths}月`;
  }

  const diffYears = Math.floor(absSeconds / (60 * 60 * 24 * 365));
  return `${diffYears}年`;
}

/**
 * 格式化时长
 * @param milliseconds 毫秒数
 * @returns 格式化后的时长字符串
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const locale = i18next.language;

  if (days > 0) {
    return new Intl.RelativeTimeFormat(locale, { style: 'long' }).format(days, 'day');
  } else if (hours > 0) {
    return new Intl.RelativeTimeFormat(locale, { style: 'long' }).format(hours, 'hour');
  } else if (minutes > 0) {
    return new Intl.RelativeTimeFormat(locale, { style: 'long' }).format(minutes, 'minute');
  } else {
    return new Intl.RelativeTimeFormat(locale, { style: 'long' }).format(seconds, 'second');
  }
}
