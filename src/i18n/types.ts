export type SupportedLocale = "en" | "zh-CN";

export type UiLanguagePreference = "system" | SupportedLocale;

export type TranslationParamValue = string | number | boolean | null | undefined;

export type TranslationParams = Record<string, TranslationParamValue>;

export type TranslationDictionary = Record<string, string>;
