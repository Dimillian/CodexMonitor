import i18next from '../config';

/**
 * 数字格式化工具 - 支持国际化
 */

/**
 * 格式化数字
 * @param number 要格式化的数字
 * @param options 格式化选项
 * @returns 格式化后的数字字符串
 */
export function formatNumber(
  number: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const locale = i18next.language;

  try {
    const formatter = new Intl.NumberFormat(locale, options);
    return formatter.format(number);
  } catch (error) {
    console.warn('Number formatting failed:', error);
    return number.toString();
  }
}

/**
 * 格式化整数
 * @param number 要格式化的整数
 * @param options 格式化选项
 * @returns 格式化后的整数字符串
 */
export function formatInteger(
  number: number,
  options: Omit<Intl.NumberFormatOptions, 'style'> = {}
): string {
  return formatNumber(number, {
    ...options,
    maximumFractionDigits: 0,
  });
}

/**
 * 格式化小数
 * @param number 要格式化的小数
 * @param minimumFractionDigits 最小小数位数
 * @param maximumFractionDigits 最大小数位数
 * @param options 格式化选项
 * @returns 格式化后的小数字符串
 */
export function formatDecimal(
  number: number,
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 2,
  options: Omit<Intl.NumberFormatOptions, 'style' | 'minimumFractionDigits' | 'maximumFractionDigits'> = {}
): string {
  return formatNumber(number, {
    ...options,
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

/**
 * 格式化货币
 * @param number 要格式化的金额
 * @param currency 货币代码 (默认: 'USD')
 * @param options 格式化选项
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(
  number: number,
  currency: string = 'USD',
  options: Omit<Intl.NumberFormatOptions, 'style' | 'currency'> = {}
): string {
  return formatNumber(number, {
    ...options,
    style: 'currency',
    currency,
  });
}

/**
 * 格式化百分比
 * @param number 要格式化的百分比数值 (例如: 0.1234 表示 12.34%)
 * @param minimumFractionDigits 最小小数位数
 * @param maximumFractionDigits 最大小数位数
 * @param options 格式化选项
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(
  number: number,
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 2,
  options: Omit<Intl.NumberFormatOptions, 'style' | 'minimumFractionDigits' | 'maximumFractionDigits'> = {}
): string {
  return formatNumber(number, {
    ...options,
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

/**
 * 格式化字节大小
 * @param bytes 字节数
 * @param options 格式化选项
 * @returns 格式化后的字节大小字符串
 */
export function formatBytes(
  bytes: number,
  options: {
    decimalPlaces?: number;
    unit?: 'B' | 'KB' | 'MB' | 'GB' | 'TB';
  } = {}
): string {
  const { decimalPlaces = 2, unit } = options;
  void i18next.language; // locale for formatBytes

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;

  if (unit) {
    const unitIndex = units.indexOf(unit);
    const size = bytes / Math.pow(k, unitIndex);
    return `${formatNumber(size, {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    })} ${unit}`;
  }

  const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${formatNumber(size, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })} ${units[i]}`;
}

/**
 * 格式化数字为紧凑格式 (例如: 1.2K, 1.5M, 2.3B)
 * @param number 要格式化的数字
 * @param options 格式化选项
 * @returns 格式化后的紧凑数字字符串
 */
export function formatCompactNumber(
  number: number,
  options: Omit<Intl.NumberFormatOptions, 'notation'> = {}
): string {
  return formatNumber(number, {
    ...options,
    notation: 'compact',
  });
}

/**
 * 格式化排名/序号
 * @param number 数字
 * @param options 格式化选项
 * @returns 格式化后的序号字符串
 */
export function formatOrdinal(number: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = number % 100;
  return number + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * 格式化数字为科学计数法
 * @param number 要格式化的数字
 * @param minimumSignificantDigits 最小有效数字位数
 * @param maximumSignificantDigits 最大有效数字位数
 * @param options 格式化选项
 * @returns 格式化后的科学计数法字符串
 */
export function formatScientific(
  number: number,
  minimumSignificantDigits: number = 3,
  maximumSignificantDigits: number = 3,
  options: Omit<Intl.NumberFormatOptions, 'notation' | 'minimumSignificantDigits' | 'maximumSignificantDigits'> = {}
): string {
  return formatNumber(number, {
    ...options,
    notation: 'scientific',
    minimumSignificantDigits,
    maximumSignificantDigits,
  });
}
