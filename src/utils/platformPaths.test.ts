import { describe, expect, it } from "vitest";
import { isMobilePlatform } from "./platformPaths";

const globalScope = globalThis as typeof globalThis & { navigator?: Navigator };

function withNavigatorValues(
  values: Partial<Pick<Navigator, "platform" | "userAgent" | "maxTouchPoints">>,
  run: () => void,
) {
  const hadNavigator = typeof globalScope.navigator !== "undefined";
  if (!hadNavigator) {
    Object.defineProperty(globalScope, "navigator", {
      configurable: true,
      writable: true,
      value: {},
    });
  }

  const activeNavigator = globalScope.navigator as Navigator;
  const originalPlatform = Object.getOwnPropertyDescriptor(activeNavigator, "platform");
  const originalUserAgent = Object.getOwnPropertyDescriptor(activeNavigator, "userAgent");
  const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(
    activeNavigator,
    "maxTouchPoints",
  );
  Object.defineProperty(activeNavigator, "platform", {
    configurable: true,
    value: values.platform ?? activeNavigator.platform ?? "",
  });
  Object.defineProperty(activeNavigator, "userAgent", {
    configurable: true,
    value: values.userAgent ?? activeNavigator.userAgent ?? "",
  });
  Object.defineProperty(activeNavigator, "maxTouchPoints", {
    configurable: true,
    value: values.maxTouchPoints ?? activeNavigator.maxTouchPoints ?? 0,
  });
  try {
    run();
  } finally {
    if (originalPlatform) {
      Object.defineProperty(activeNavigator, "platform", originalPlatform);
    } else {
      delete (activeNavigator as { platform?: string }).platform;
    }
    if (originalUserAgent) {
      Object.defineProperty(activeNavigator, "userAgent", originalUserAgent);
    } else {
      delete (activeNavigator as { userAgent?: string }).userAgent;
    }
    if (originalMaxTouchPoints) {
      Object.defineProperty(activeNavigator, "maxTouchPoints", originalMaxTouchPoints);
    } else {
      delete (activeNavigator as { maxTouchPoints?: number }).maxTouchPoints;
    }
    if (!hadNavigator) {
      Reflect.deleteProperty(globalScope, "navigator");
    }
  }
}

describe("isMobilePlatform", () => {
  it("returns true for iPhone-like user agents", () => {
    withNavigatorValues(
      {
        platform: "iPhone",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      () => {
        expect(isMobilePlatform()).toBe(true);
      },
    );
  });

  it("returns false for desktop platforms", () => {
    withNavigatorValues(
      {
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_0) AppleWebKit/537.36",
      },
      () => {
        expect(isMobilePlatform()).toBe(false);
      },
    );
  });

  it("returns true for iPad desktop user agents with touch support", () => {
    withNavigatorValues(
      {
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      },
      () => {
        expect(isMobilePlatform()).toBe(true);
      },
    );
  });
});
