import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import zh from "./locales/zh";

const LOCALE_STORAGE_KEY = "app_locale";

export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isValidLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function getPersistedLocale(): SupportedLocale {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (stored && isValidLocale(stored)) {
      return stored;
    }
  } catch {
    // ignore localStorage errors
  }
  return "en";
}

export function persistLocale(locale: SupportedLocale): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // ignore localStorage errors
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: getPersistedLocale(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    saveMissing: true,
    missingKeyHandler: (lngs, _ns, key) => {
      console.warn(`[i18n] Missing translation key: "${key}" for locale: ${lngs.join(", ")}`);
    },
  });

export default i18n;
