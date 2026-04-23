import { describe, expect, it } from "vitest";
import {
  normalizeLanguagePreference,
  resolveLocale,
  translate,
} from "./index";

describe("i18n", () => {
  it("normalizes unsupported language preferences to system", () => {
    expect(normalizeLanguagePreference("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguagePreference("fr")).toBe("system");
    expect(normalizeLanguagePreference(null)).toBe("system");
  });

  it("resolves system language to a supported locale", () => {
    expect(resolveLocale("system", ["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["en-US"])).toBe("en");
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
  });

  it("translates and interpolates values", () => {
    expect(translate("zh-CN", "settings.title")).toBe("设置");
    expect(
      translate("en", "settings.display.scrollback.range", {
        min: 1,
        max: 10,
      }),
    ).toBe("Range: 1-10. Counts messages, tool calls, and other conversation items.");
  });
});
