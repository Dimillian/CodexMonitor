import { createContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  dictionaries,
  formatTranslation,
  hasTranslationKey,
  resolveEffectiveLocale,
} from "./index";
import type { SupportedLocale, TranslationParams, UiLanguagePreference } from "./types";

export type I18nValue = {
  locale: SupportedLocale;
  languagePreference: UiLanguagePreference;
  t: (key: string, params?: TranslationParams) => string;
  hasKey: (key: string) => boolean;
};

function fallbackTranslate(key: string, params?: TranslationParams): string {
  const english = dictionaries.en[key] ?? key;
  return formatTranslation(english, params);
}

export const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  languagePreference: "system",
  t: fallbackTranslate,
  hasKey: (key) => hasTranslationKey(key, DEFAULT_LOCALE),
});

type I18nProviderProps = {
  children: ReactNode;
  languagePreference?: UiLanguagePreference | null;
};

export function I18nProvider({ children, languagePreference }: I18nProviderProps) {
  const resolvedPreference: UiLanguagePreference = (() => {
    if (languagePreference === "en" || languagePreference === "zh-CN") {
      return languagePreference;
    }
    return "system";
  })();

  const locale = resolveEffectiveLocale(resolvedPreference);
  const value = useMemo<I18nValue>(() => {
    return {
      locale,
      languagePreference: resolvedPreference,
      t: (key, params) => {
        const localized = dictionaries[locale][key];
        const english = dictionaries.en[key];
        const template = localized ?? english ?? key;
        if (import.meta.env.DEV && !localized && !english) {
          console.warn(`[i18n] Missing translation key: ${key}`);
        }
        return formatTranslation(template, params);
      },
      hasKey: (key) => hasTranslationKey(key, locale),
    };
  }, [locale, resolvedPreference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
