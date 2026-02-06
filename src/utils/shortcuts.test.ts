// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { formatShortcut, matchesShortcut, toMenuAccelerator } from "./shortcuts";

function withNavigatorPlatform(platform: string, fn: () => void) {
  const originalUserAgentData = Object.getOwnPropertyDescriptor(navigator, "userAgentData");

  Object.defineProperty(navigator, "userAgentData", {
    value: { platform },
    configurable: true,
  });

  try {
    fn();
  } finally {
    if (originalUserAgentData) {
      Object.defineProperty(navigator, "userAgentData", originalUserAgentData);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).userAgentData;
    }
  }
}

describe("shortcuts", () => {
  it("maps cmd+ctrl to Ctrl+Alt on non-mac platforms", () => {
    withNavigatorPlatform("Win32", () => {
      expect(formatShortcut("cmd+ctrl+a")).toBe("Ctrl+Alt+A");
      expect(toMenuAccelerator("cmd+ctrl+a")).toBe("Ctrl+Alt+A");

      const ctrlOnly = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
      expect(matchesShortcut(ctrlOnly, "cmd+ctrl+a")).toBe(false);

      const ctrlAlt = new KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        altKey: true,
      });
      expect(matchesShortcut(ctrlAlt, "cmd+ctrl+a")).toBe(true);
    });
  });

  it("keeps cmd as CmdOrCtrl on non-mac platforms", () => {
    withNavigatorPlatform("Win32", () => {
      const ctrlEvent = new KeyboardEvent("keydown", { key: "n", ctrlKey: true });
      expect(matchesShortcut(ctrlEvent, "cmd+n")).toBe(true);
    });
  });

  it("requires both cmd and ctrl on macOS", () => {
    withNavigatorPlatform("MacIntel", () => {
      expect(formatShortcut("cmd+ctrl+a")).toBe("⌘⌃A");
      expect(toMenuAccelerator("cmd+ctrl+a")).toBe("Cmd+Ctrl+A");

      const cmdCtrl = new KeyboardEvent("keydown", {
        key: "a",
        metaKey: true,
        ctrlKey: true,
      });
      expect(matchesShortcut(cmdCtrl, "cmd+ctrl+a")).toBe(true);

      const ctrlOnly = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
      expect(matchesShortcut(ctrlOnly, "cmd+ctrl+a")).toBe(false);
    });
  });
});
