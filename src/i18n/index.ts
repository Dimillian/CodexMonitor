import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import type {
  SupportedLocale,
  TranslationDictionary,
  TranslationParams,
  UiLanguagePreference,
} from "./types";

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const dictionaries: Record<SupportedLocale, TranslationDictionary> = {
  en,
  "zh-CN": zhCN,
};

export function hasTranslationKey(
  key: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
): boolean {
  return dictionaries[locale][key] !== undefined || dictionaries.en[key] !== undefined;
}

export function resolveEffectiveLocale(
  languagePreference: UiLanguagePreference | string | null | undefined,
): SupportedLocale {
  if (languagePreference === "en" || languagePreference === "zh-CN") {
    return languagePreference;
  }
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  const normalized = String(navigator.language ?? "").toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }
  return DEFAULT_LOCALE;
}

export function formatTranslation(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
