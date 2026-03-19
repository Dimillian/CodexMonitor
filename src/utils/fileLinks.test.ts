import { describe, expect, it } from "vitest";
import { fromFileUrl } from "./fileLinks";

function withThrowingUrlConstructor(run: () => void) {
  const originalUrl = globalThis.URL;
  const throwingUrl = class {
    constructor() {
      throw new TypeError("Simulated URL constructor failure");
    }
  } as unknown as typeof URL;

  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: throwingUrl,
  });

  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: originalUrl,
    });
  }
}

describe("fromFileUrl", () => {
  it("keeps Windows drive paths when decoding a file URL with an unescaped percent", () => {
    expect(fromFileUrl("file:///C:/repo/100%.tsx#L12")).toBe("C:/repo/100%.tsx:12");
  });

  it("keeps UNC host paths when decoding a file URL with an unescaped percent", () => {
    expect(fromFileUrl("file://server/share/100%.tsx#L12")).toBe(
      "//server/share/100%.tsx:12",
    );
  });

  it("preserves Windows drive info when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expect(fromFileUrl("file:///C:/repo/100%.tsx#L12")).toBe("C:/repo/100%.tsx:12");
      expect(fromFileUrl("file://localhost/C:/repo/100%.tsx#L12")).toBe(
        "C:/repo/100%.tsx:12",
      );
    });
  });

  it("preserves UNC host info when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expect(fromFileUrl("file://server/share/100%.tsx#L12")).toBe(
        "//server/share/100%.tsx:12",
      );
    });
  });
});
