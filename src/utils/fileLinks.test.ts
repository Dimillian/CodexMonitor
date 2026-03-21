import { describe, expect, it } from "vitest";
import { fromFileUrl, isKnownLocalWorkspaceRoutePath, toFileUrl } from "./fileLinks";

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

  it("round-trips Windows namespace drive paths through file URLs", () => {
    const fileUrl = toFileUrl("\\\\?\\C:\\repo\\src\\App.tsx", 12, null);
    expect(fileUrl).toBe("file:///%5C%5C%3F%5CC%3A%5Crepo%5Csrc%5CApp.tsx#L12");
    expect(fromFileUrl(fileUrl)).toBe("\\\\?\\C:\\repo\\src\\App.tsx:12");
  });

  it("round-trips Windows namespace UNC paths through file URLs", () => {
    const fileUrl = toFileUrl("\\\\?\\UNC\\server\\share\\repo\\App.tsx", 12, null);
    expect(fileUrl).toBe(
      "file:///%5C%5C%3F%5CUNC%5Cserver%5Cshare%5Crepo%5CApp.tsx#L12",
    );
    expect(fromFileUrl(fileUrl)).toBe("\\\\?\\UNC\\server\\share\\repo\\App.tsx:12");
  });
});

describe("isKnownLocalWorkspaceRoutePath", () => {
  it("matches exact mounted settings and reviews routes", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews")).toBe(true);
  });

  it("keeps explicit nested settings and reviews app routes out of file resolution", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/profile")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/overview")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/profile")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/overview")).toBe(true);
  });

  it("still allows file-like descendants under reserved workspace names", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/src/App.tsx")).toBe(
      false,
    );
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/src/App.tsx")).toBe(
      false,
    );
  });

  it("treats extensionless descendants under reserved workspace names as mounted files", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/LICENSE")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/bin/tool")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/Makefile")).toBe(
      false,
    );
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/bin/tool")).toBe(
      false,
    );
  });
});
