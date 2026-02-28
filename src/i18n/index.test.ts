import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import { hasTranslationKey, resolveEffectiveLocale } from "./index";

describe("i18n dictionaries", () => {
  it("keeps en and zh-CN keys aligned", () => {
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zhCN).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});

describe("resolveEffectiveLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses explicit supported preference", () => {
    expect(resolveEffectiveLocale("en")).toBe("en");
    expect(resolveEffectiveLocale("zh-CN")).toBe("zh-CN");
  });

  it("maps system zh locales to zh-CN", () => {
    vi.stubGlobal("navigator", { language: "zh-SG" });
    expect(resolveEffectiveLocale("system")).toBe("zh-CN");
  });

  it("falls back to en for non-zh system locales", () => {
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(resolveEffectiveLocale("system")).toBe("en");
  });
});

describe("hasTranslationKey", () => {
  it("returns true when key exists in locale dictionaries", () => {
    expect(hasTranslationKey("settings.nav.server", "en")).toBe(true);
    expect(hasTranslationKey("settings.nav.server", "zh-CN")).toBe(true);
  });

  it("returns false for unknown keys", () => {
    expect(hasTranslationKey("settings.unknown.key", "en")).toBe(false);
    expect(hasTranslationKey("settings.unknown.key", "zh-CN")).toBe(false);
  });
});
