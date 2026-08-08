export type AppLanguage = "en" | "zh-CN";

export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ["en", "zh-CN"] as const;

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

/**
 * Resolve the initial app language from the host environment before any
 * persisted preference is available. Returns "zh-CN" for any Chinese
 * browser/OS locale, "en" otherwise (including non-browser runtimes).
 */
export function detectInitialLanguage(): AppLanguage {
  if (typeof navigator === "undefined" || typeof navigator.language !== "string") {
    return "en";
  }
  const normalized = navigator.language.toLowerCase().replace("_", "-");
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }
  return "en";
}
