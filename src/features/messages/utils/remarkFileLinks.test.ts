import { describe, expect, it } from "vitest";
import { remarkFileLinks } from "./messageFileLinks";

type TestNode = {
  type: string;
  value?: string;
  url?: string;
  children?: TestNode[];
};

function runRemarkFileLinks(tree: TestNode) {
  remarkFileLinks()(tree);
  return tree;
}

function textParagraph(value: string): TestNode {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value }],
      },
    ],
  };
}

describe("remarkFileLinks", () => {
  it("does not turn natural-language slash phrases into file links", () => {
    const tree = runRemarkFileLinks(
      textParagraph("Keep the current app/daemon behavior and the existing Git/Plan experience."),
    );
    expect(tree.children?.[0]?.children?.map((child) => child.type)).toEqual(["text"]);
  });

  it("turns clear file paths into links", () => {
    const tree = runRemarkFileLinks(
      textParagraph("See docs/setup.md and /Users/example/project/src/index.ts for details."),
    );
    expect(tree.children?.[0]?.children?.filter((child) => child.type === "link")).toHaveLength(2);
  });

  it("keeps workspace route anchors out of linkification", () => {
    const tree = runRemarkFileLinks(
      textParagraph("See /workspace/settings#L12 for app settings."),
    );
    expect(tree.children?.[0]?.children?.map((child) => child.type)).toEqual(["text"]);
  });

  it("leaves inline code untouched", () => {
    const tree = runRemarkFileLinks({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "inlineCode", value: "/workspace/reviews#L9" }],
        },
      ],
    });
    expect(tree.children?.[0]?.children?.[0]?.type).toBe("inlineCode");
  });

  it("does not turn file URLs into local file links", () => {
    const tree = runRemarkFileLinks(
      textParagraph("Download file:///C:/repo/src/App.tsx instead of opening a local file link."),
    );
    expect(tree.children?.[0]?.children?.map((child) => child.type)).toEqual(["text"]);
  });

  it("does not split custom URIs that embed Windows file paths", () => {
    const tree = runRemarkFileLinks(
      textParagraph("Open vscode://file/C:/repo/src/App.tsx:12 in VS Code."),
    );
    expect(tree.children?.[0]?.children?.map((child) => child.type)).toEqual(["text"]);
  });
});
