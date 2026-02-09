import { vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import type { I18nService } from '../services/i18n';
import type { Locale } from '../i18n/config';

/**
 * i18n 测试工具 - 提供 mock 实现以便于测试
 */

/**
 * 创建一个简单的 i18n service mock
 * 它会直接返回翻译键作为翻译结果，这样我们在测试中就不需要实际的翻译文件了
 */
export function createMockI18nService(): I18nService {
  const mock = {
    changeLanguage: vi.fn<(locale: Locale) => Promise<void>>().mockResolvedValue(),
    getCurrentLanguage: vi.fn<() => Locale>().mockReturnValue('en'),
    t: vi.fn<(key: string, options?: any) => string>().mockImplementation((key) => key),
  };

  return mock;
}

/**
 * 创建一个带有预定义翻译的 i18n service mock
 * @param translations 预定义的翻译映射
 */
export function createMockI18nServiceWithTranslations(
  translations: Record<string, string>
): I18nService {
  const mock = {
    changeLanguage: vi.fn<(locale: Locale) => Promise<void>>().mockResolvedValue(),
    getCurrentLanguage: vi.fn<() => Locale>().mockReturnValue('en'),
    t: vi.fn<(key: string, options?: any) => string>().mockImplementation((key) => {
      return translations[key] || key;
    }),
  };

  return mock;
}

/**
 * 简单的 t 函数 mock，直接返回键名
 */
export const mockT = vi.fn<(key: string, options?: any) => string>().mockImplementation((key) => key);

/**
 * 渲染组件时使用的 mock i18n 上下文值
 */
export const mockI18nContextValue = {
  t: mockT,
  i18n: {
    language: 'en',
    changeLanguage: vi.fn(() => Promise.resolve()),
    // 添加强制转换所需的其他属性
    addResourceBundle: vi.fn(),
    removeResourceBundle: vi.fn(),
    hasResourceBundle: vi.fn().mockReturnValue(true),
    getResourceBundle: vi.fn().mockReturnValue({}),
    getFixedT: vi.fn().mockReturnValue(mockT),
    resolveLanguage: vi.fn().mockReturnValue('en'),
    directory: '',
    loadResources: vi.fn(),
    options: {},
    services: {},
    usedLngs: ['en'],
    defaultNS: 'translation',
    format: vi.fn(),
    interpolate: vi.fn(),
    parse: vi.fn(),
    resourceStore: {},
  },
};

/**
 * 用于测试的简单 i18n 提供者组件
 * 包装需要 i18n 上下文的组件
 */
export function MockI18nProvider({
  children,
  locale = 'en',
  translations = {} as Record<string, string>,
}: {
  children: React.ReactNode;
  locale?: Locale;
  translations?: Record<string, string>;
}) {
  const i18nInstance = {
    language: locale,
    changeLanguage: vi.fn(() => Promise.resolve()),
    t: (key: string) => translations[key] || key,
    // 添加强制转换所需的其他属性
    addResourceBundle: vi.fn(),
    removeResourceBundle: vi.fn(),
    hasResourceBundle: vi.fn().mockReturnValue(true),
    getResourceBundle: vi.fn().mockReturnValue({}),
    getFixedT: vi.fn().mockReturnValue((key: string) => translations[key] || key),
    resolveLanguage: vi.fn().mockReturnValue(locale),
    directory: '',
    loadResources: vi.fn(),
    options: {},
    services: {},
    usedLngs: [locale],
    defaultNS: 'translation',
    format: vi.fn(),
    interpolate: vi.fn(),
    parse: vi.fn(),
    resourceStore: {},
    // 添加缺失的 i18n 属性
    init: vi.fn(() => Promise.resolve()),
    use: vi.fn(() => ({ type: 'backend' })),
    modules: {},
    store: {},
    isInitialized: true,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    cloneInstance: vi.fn(),
    createInstance: vi.fn(),
    createTranslator: vi.fn(),
    exists: vi.fn().mockReturnValue(true),
    setDefaultNamespace: vi.fn(),
    getDefaultNamespace: vi.fn().mockReturnValue('translation'),
    languages: [locale],
    namespaces: ['translation'],
    hasLoadedNamespace: vi.fn().mockReturnValue(true),
    loadNamespaces: vi.fn().mockResolvedValue(undefined),
    loadLanguages: vi.fn().mockResolvedValue(undefined),
    toLanguage: vi.fn(),
    getT: vi.fn().mockReturnValue((key: string) => translations[key] || key),
    getDataByLanguage: vi.fn().mockReturnValue({}),
  };

  return <I18nextProvider i18n={i18nInstance as any}>{children}</I18nextProvider>;
}

/**
 * 为测试创建一个简单的 i18n 实例
 */
export function createMockI18nInstance(locale = 'en', translations: Record<string, string> = {}) {
  return {
    language: locale,
    changeLanguage: vi.fn(() => Promise.resolve()),
    t: (key: string) => translations[key] || key,
    addResourceBundle: vi.fn(),
    removeResourceBundle: vi.fn(),
    hasResourceBundle: vi.fn().mockReturnValue(true),
    getResourceBundle: vi.fn().mockReturnValue({}),
    getFixedT: vi.fn().mockReturnValue((key: string) => translations[key] || key),
    resolveLanguage: vi.fn().mockReturnValue(locale),
    directory: '',
    loadResources: vi.fn(),
    options: {},
    services: {},
    usedLngs: [locale],
    defaultNS: 'translation',
    format: vi.fn(),
    interpolate: vi.fn(),
    parse: vi.fn(),
    resourceStore: {},
  };
}
