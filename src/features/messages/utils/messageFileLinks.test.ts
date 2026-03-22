import { describe, expect, it } from "vitest";
import { formatFileLocation } from "../../../utils/fileLinks";
import { resolveMessageFileHref } from "./messageFileLinks";

function expectResolvedHref(url: string, expected: string | null) {
  const resolved = resolveMessageFileHref(url);
  const formatted = resolved
    ? formatFileLocation(resolved.path, resolved.line, resolved.column)
    : null;
  expect(formatted).toBe(expected);
}

describe("resolveMessageFileHref", () => {
  it("ignores non-line file URL fragments", () => {
    expectResolvedHref("file:///tmp/report.md#overview", "/tmp/report.md");
  });

  it("preserves line anchors for file URLs", () => {
    expectResolvedHref("file:///tmp/report.md#L12", "/tmp/report.md:12");
  });

  it("preserves Windows drive paths with unescaped percent characters", () => {
    expectResolvedHref("file:///C:/repo/100%.tsx#L12", "C:/repo/100%.tsx:12");
  });

  it("preserves UNC host paths with unescaped percent characters", () => {
    expectResolvedHref("file://server/share/100%.tsx#L12", "//server/share/100%.tsx:12");
  });

  it("keeps encoded #L-like filenames intact for file URLs", () => {
    expectResolvedHref("file:///tmp/report%23L12.md", "/tmp/report#L12.md");
    expectResolvedHref("file:///tmp/%23L12", "/tmp/#L12");
  });

  it("keeps encoded #L-like filename endings intact for markdown hrefs", () => {
    expectResolvedHref("./report.md%23L12", "./report.md#L12");
    expectResolvedHref("./report.md%23L12C3", "./report.md#L12C3");
  });
});
