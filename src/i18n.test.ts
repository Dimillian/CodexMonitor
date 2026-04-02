import { describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";
import { localeMessages } from "@/locales";

const en = localeMessages.en;
const localeEntries = Object.entries(localeMessages) as Array<
  [keyof typeof localeMessages, (typeof localeMessages)[keyof typeof localeMessages]]
>;
const interpolationPattern = /\{\{\s*[^}]+\s*\}\}/g;

function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => {
    return (value as Record<string, unknown>)[part];
  }, locale);
}

describe("i18n translation files", () => {
  const enKeys = collectKeys(en).sort();

  it.each(localeEntries)("%s has the same keys as English", (_, locale) => {
    expect(collectKeys(locale).sort()).toEqual(enKeys);
  });

  it.each(localeEntries)(
    "preserves interpolation placeholders in %s",
    (code, locale) => {
      for (const key of enKeys) {
        const baseValue = String(getNestedValue(en, key) ?? "");
        const localeValue = String(getNestedValue(locale, key) ?? "");
        expect(
          localeValue.match(interpolationPattern) ?? [],
          `${code} key "${key}" should preserve interpolation placeholders`,
        ).toEqual(baseValue.match(interpolationPattern) ?? []);
      }
    },
  );

  it.each(localeEntries)("no empty translation values in %s", (code, locale) => {
    const localeKeys = collectKeys(locale);
    for (const key of localeKeys) {
      const value = getNestedValue(locale, key);
      expect(value, `${code} key "${key}" should not be empty`).toBeTruthy();
    }
  });

  it.each(localeEntries)("defines a label for every supported language in %s", (code, locale) => {
    const languageSection = locale.language as Record<string, string>;
    for (const languageCode of SUPPORTED_LANGUAGES) {
      expect(
        languageSection[languageCode],
        `${code} should define language.${languageCode}`,
      ).toBeTruthy();
    }
  });

  it.each(SUPPORTED_LANGUAGES)('registers a "common" bundle for %s', (code) => {
    expect(i18n.hasResourceBundle(code, "common")).toBe(true);
    expect(i18n.getResource(code, "common", "language.label")).toBeTruthy();
  });

  it.each(SUPPORTED_LANGUAGES.filter((code) => code !== "en"))(
    "registers a dedicated translated system default label for %s",
    (code) => {
      expect(i18n.getResource(code, "common", "language.systemDefault")).toBe(
        localeMessages[code].language.systemDefault,
      );
    },
  );
});
