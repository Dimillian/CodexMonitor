import { describe, expect, it } from "vitest";
import { formatFileLocation, parseFileUrlLocation, toFileUrl } from "./fileLinks";

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

function expectFileUrlLocation(url: string, expected: string | null) {
  const parsed = parseFileUrlLocation(url);
  const formatted = parsed
    ? formatFileLocation(parsed.path, parsed.line, parsed.column)
    : null;
  expect(formatted).toBe(expected);
}

describe("parseFileUrlLocation", () => {
  it("keeps encoded #L-like path segments as part of the decoded filename", () => {
    expectFileUrlLocation("file:///tmp/%23L12", "/tmp/#L12");
    expectFileUrlLocation("file:///tmp/report%23L12C3.md", "/tmp/report#L12C3.md");
  });

  it("uses only the real URL fragment as a line anchor", () => {
    expectFileUrlLocation("file:///tmp/report%23L12.md#L34", "/tmp/report#L12.md:34");
    expectFileUrlLocation("file:///tmp/report%23L12C3.md#L34C2", 
      "/tmp/report#L12C3.md:34:2",
    );
  });

  it("keeps Windows drive paths when decoding a file URL with an unescaped percent", () => {
    expectFileUrlLocation("file:///C:/repo/100%.tsx#L12", "C:/repo/100%.tsx:12");
  });

  it("keeps UNC host paths when decoding a file URL with an unescaped percent", () => {
    expectFileUrlLocation("file://server/share/100%.tsx#L12", "//server/share/100%.tsx:12");
  });

  it("preserves Windows drive info when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expectFileUrlLocation("file:///C:/repo/100%.tsx#L12", "C:/repo/100%.tsx:12");
      expectFileUrlLocation("file://localhost/C:/repo/100%.tsx#L12", 
        "C:/repo/100%.tsx:12",
      );
    });
  });

  it("preserves UNC host info when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expectFileUrlLocation("file://server/share/100%.tsx#L12", 
        "//server/share/100%.tsx:12",
      );
    });
  });

  it("keeps encoded #L-like path segments when the URL constructor fallback is used", () => {
    withThrowingUrlConstructor(() => {
      expectFileUrlLocation("file:///tmp/%23L12", "/tmp/#L12");
      expectFileUrlLocation("file:///tmp/report%23L12.md#L34", "/tmp/report#L12.md:34");
    });
  });

  it("round-trips Windows namespace drive paths through file URLs", () => {
    const fileUrl = toFileUrl("\\\\?\\C:\\repo\\src\\App.tsx", 12, null);
    expect(fileUrl).toBe("file:///%5C%5C%3F%5CC%3A%5Crepo%5Csrc%5CApp.tsx#L12");
    expectFileUrlLocation(fileUrl, "\\\\?\\C:\\repo\\src\\App.tsx:12");
  });

  it("round-trips Windows namespace UNC paths through file URLs", () => {
    const fileUrl = toFileUrl("\\\\?\\UNC\\server\\share\\repo\\App.tsx", 12, null);
    expect(fileUrl).toBe(
      "file:///%5C%5C%3F%5CUNC%5Cserver%5Cshare%5Crepo%5CApp.tsx#L12",
    );
    expectFileUrlLocation(fileUrl, "\\\\?\\UNC\\server\\share\\repo\\App.tsx:12");
  });
});
