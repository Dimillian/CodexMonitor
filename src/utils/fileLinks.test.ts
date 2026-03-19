import { describe, expect, it } from "vitest";
import { fromFileUrl, isKnownLocalWorkspaceRoutePath } from "./fileLinks";

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
  it("keeps encoded #L-like path segments as part of the decoded filename", () => {
    expect(fromFileUrl("file:///tmp/%23L12")).toBe("/tmp/#L12");
    expect(fromFileUrl("file:///tmp/report%23L12C3.md")).toBe("/tmp/report#L12C3.md");
  });

  it("uses only the real URL fragment as a line anchor", () => {
    expect(fromFileUrl("file:///tmp/report%23L12.md#L34")).toBe("/tmp/report#L12.md:34");
    expect(fromFileUrl("file:///tmp/report%23L12C3.md#L34C2")).toBe(
      "/tmp/report#L12C3.md:34:2",
    );
  });

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

  it("keeps encoded #L-like path segments when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expect(fromFileUrl("file:///tmp/%23L12")).toBe("/tmp/#L12");
      expect(fromFileUrl("file:///tmp/report%23L12.md#L34")).toBe("/tmp/report#L12.md:34");
    });
  });
});

describe("isKnownLocalWorkspaceRoutePath", () => {
  it("matches only exact mounted settings and reviews routes", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews")).toBe(true);
  });

  it("does not treat deeper mounted paths as reserved routes", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/src/App.tsx")).toBe(
      false,
    );
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/src/App.tsx")).toBe(
      false,
    );
  });
});
