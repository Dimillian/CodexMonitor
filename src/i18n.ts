import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { localeMessages } from "@/locales";

export const SUPPORTED_LANGUAGES = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "ja",
  "ko",
  "pt",
  "ru",
  "zh",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
const LANGUAGE_STORAGE_KEY = "i18nextLng";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ar: { common: localeMessages.ar },
      de: { common: localeMessages.de },
      en: { common: localeMessages.en },
      es: { common: localeMessages.es },
      fr: { common: localeMessages.fr },
      hi: { common: localeMessages.hi },
      ja: { common: localeMessages.ja },
      ko: { common: localeMessages.ko },
      pt: { common: localeMessages.pt },
      ru: { common: localeMessages.ru },
      zh: { common: localeMessages.zh },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

/**
 * Apply a persisted language override from AppSettings.
 * Called once after settings are loaded; if the user has never picked a
 * language the detector's result (system locale) stays in effect.
 */
export function applyLanguageFromSettings(lang: string | null): void {
  if (!lang) {
    return;
  }
  const supported = SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
  if (supported && i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }
}

export function resetLanguageToSystem(): void {
  try {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // Ignore storage access failures and fall back to i18next detection.
  }

  const detected = i18n.services.languageDetector?.detect();
  const nextLanguage = Array.isArray(detected) ? detected[0] : detected;
  void i18n.changeLanguage(nextLanguage || undefined);
}

export default i18n;
