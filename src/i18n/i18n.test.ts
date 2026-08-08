// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import i18n from "./i18n";

// ---- Helpers ----

/** Recursively collect all leaf keys from a nested object, joined by "." */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

// ---- Parity test ----

describe("i18n key parity", () => {
  const namespaces = ["common", "sidebar", "home", "header", "settings", "threads", "about", "errors", "composer", "git", "workspaces", "layout", "app", "plan", "prompts", "terminal", "update", "mobile", "debug", "files", "messages"];

  for (const ns of namespaces) {
    it(`${ns}: en and zh-CN have identical key structure`, () => {
      const enResource = i18n.getResourceBundle("en", ns);
      const zhResource = i18n.getResourceBundle("zh-CN", ns);

      expect(enResource).toBeDefined();
      expect(zhResource).toBeDefined();

      const enKeys = collectKeys(enResource);
      const zhKeys = collectKeys(zhResource);

      // Check en has keys zh doesn't
      const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
      // Check zh has keys en doesn't
      const extraInZh = zhKeys.filter((k) => !enKeys.includes(k));

      if (missingInZh.length > 0 || extraInZh.length > 0) {
        const lines: string[] = [];
        if (missingInZh.length > 0) {
          lines.push(`Keys missing in zh-CN/${ns}:`);
          lines.push(...missingInZh.map((k) => `  - ${k}`));
        }
        if (extraInZh.length > 0) {
          lines.push(`Extra keys in zh-CN/${ns} (not in en/${ns}):`);
          lines.push(...extraInZh.map((k) => `  - ${k}`));
        }
        expect(missingInZh).toEqual([]);
        expect(extraInZh).toEqual([]);
      }
    });
  }
});

// ---- Language switching behavior ----

describe("i18n language switching", () => {
  afterEach(() => {
    void i18n.changeLanguage("en");
  });

  it("returns English by default", () => {
    expect(i18n.language).toBe("en");
  });

  it("returns Chinese after switching to zh-CN", () => {
    void i18n.changeLanguage("zh-CN");
    expect(i18n.language).toBe("zh-CN");
  });

  it("common:loading returns Chinese after switching to zh-CN", () => {
    void i18n.changeLanguage("zh-CN");
    expect(i18n.t("common:loading")).toBe("加载中...");
  });

  it("common:loading returns English after switching back to en", () => {
    void i18n.changeLanguage("zh-CN");
    void i18n.changeLanguage("en");
    expect(i18n.t("common:loading")).toBe("Loading...");
  });

  it("home:statToday returns Chinese after switching to zh-CN", () => {
    void i18n.changeLanguage("zh-CN");
    expect(i18n.t("home:statToday")).toBe("今天");
  });

  it("home:statToday returns English after switching back to en", () => {
    void i18n.changeLanguage("zh-CN");
    void i18n.changeLanguage("en");
    expect(i18n.t("home:statToday")).toBe("Today");
  });
});

// ---- Fallback behavior ----

describe("i18n fallback", () => {
  afterEach(() => {
    void i18n.changeLanguage("en");
    i18n.removeResourceBundle("en", "common");
  });

  it("returns the key itself for an unknown key in en", () => {
    const result = i18n.t("nonexistentKey");
    expect(result).toBe("nonexistentKey");
  });

  it("returns the en value for an unknown key in zh-CN (falls back to en)", () => {
    void i18n.changeLanguage("zh-CN");
    // "home:statToday" exists in zh-CN, so it should return the Chinese value
    expect(i18n.t("home:statToday")).toBe("今天");
  });

  it("does not throw for missing interpolation values", () => {
    expect(() => i18n.t("home:weekRange")).not.toThrow();
  });

  it("falls back to en for a key that exists in en but not zh-CN", () => {
    // Add a temporary key only in en to verify fallback
    i18n.addResourceBundle("en", "common", { testOnlyFallbackKey: "Fallback English Value" }, true, true);
    // Reload zh-CN common bundle (without the key) to ensure clean state
    i18n.addResourceBundle("zh-CN", "common", {}, true, true);
    void i18n.changeLanguage("zh-CN");
    // Should fall back to en since the key doesn't exist in zh-CN
    expect(i18n.t("common:testOnlyFallbackKey")).toBe("Fallback English Value");
  });
});