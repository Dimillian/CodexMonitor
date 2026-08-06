export type AppLanguage = "en" | "zh-CN";

export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ["en", "zh-CN"] as const;

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}
