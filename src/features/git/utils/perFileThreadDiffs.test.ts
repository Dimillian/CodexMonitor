import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { buildPerFileThreadDiffs } from "./perFileThreadDiffs";

function fileChangeItem(
  id: string,
  changes: Array<{ path: string; kind?: string; diff?: string }>,
): ConversationItem {
  return {
    id,
    kind: "tool",
    toolType: "fileChange",
    title: "File changes",
    detail: "",
    changes,
  };
}

describe("buildPerFileThreadDiffs", () => {
  it("groups edits by file and preserves oldest-to-newest order per file", () => {
    const items: ConversationItem[] = [
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "add", diff: "diff-a-1" },
        { path: "src/b.ts", kind: "delete", diff: "diff-b-1" },
      ]),
      fileChangeItem("change-2", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-2" },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]?.path).toBe("src/a.ts");
    expect(result.groups[1]?.path).toBe("src/b.ts");

    expect(result.groups[0]?.edits.map((edit) => edit.label)).toEqual([
      "Edit 1",
      "Edit 2",
    ]);
    expect(result.groups[0]?.edits.map((edit) => edit.diff)).toEqual([
      "diff-a-1",
      "diff-a-2",
    ]);
    expect(result.groups[1]?.edits[0]?.label).toBe("Edit 1");

    expect(result.viewerEntries.map((entry) => entry.path)).toEqual([
      "src/a.ts@@item-change-1@@change-0",
      "src/a.ts@@item-change-2@@change-0",
      "src/b.ts@@item-change-1@@change-1",
    ]);
  });

  it("skips entries missing file path or diff text", () => {
    const items: ConversationItem[] = [
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "modify", diff: "   " },
        { path: "", kind: "modify", diff: "diff-empty-path" },
        { path: "src/b.ts", kind: "modify", diff: "diff-b-1" },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.path).toBe("src/b.ts");
    expect(result.viewerEntries).toHaveLength(1);
  });

  it("maps known change kinds to git-like status codes", () => {
    const items: ConversationItem[] = [
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "add", diff: "d1" },
        { path: "src/b.ts", kind: "delete", diff: "d2" },
        { path: "src/c.ts", kind: "rename", diff: "d3" },
        { path: "src/d.ts", kind: "unknown", diff: "d4" },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);
    expect(result.viewerEntries.map((entry) => entry.status)).toEqual([
      "A",
      "D",
      "R",
      "M",
    ]);
  });

  it("computes additions and deletions per edit", () => {
    const items: ConversationItem[] = [
      fileChangeItem("change-1", [
        {
          path: "src/a.ts",
          kind: "modify",
          diff:
            "diff --git a/src/a.ts b/src/a.ts\n" +
            "--- a/src/a.ts\n" +
            "+++ b/src/a.ts\n" +
            "@@ -1,2 +1,2 @@\n" +
            "-const a = 1;\n" +
            "+const a = 2;\n" +
            " line2\n" +
            "+line3\n",
        },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);
    expect(result.groups[0]?.edits[0]?.additions).toBe(2);
    expect(result.groups[0]?.edits[0]?.deletions).toBe(1);
  });

  it("normalizes path variants so edits of the same file stay grouped", () => {
    const items: ConversationItem[] = [
      fileChangeItem("change-1", [
        {
          path: "./src/main.ts",
          kind: "modify",
          diff: "diff --git a/src/main.ts b/src/main.ts\n--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1 +1 @@\n-a\n+b",
        },
      ]),
      fileChangeItem("change-2", [
        {
          path: "b/src/main.ts",
          kind: "modify",
          diff: "diff --git a/src/main.ts b/src/main.ts\n--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1 +1 @@\n-b\n+c",
        },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.path).toBe("src/main.ts");
    expect(result.groups[0]?.edits).toHaveLength(2);
  });

  it("keeps edit ids stable when earlier thread events are inserted", () => {
    const original = buildPerFileThreadDiffs([
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-1" },
      ]),
      fileChangeItem("change-2", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-2" },
      ]),
    ]);

    const withEarlierEvent = buildPerFileThreadDiffs([
      fileChangeItem("change-0", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-0" },
      ]),
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-1" },
      ]),
      fileChangeItem("change-2", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-2" },
      ]),
    ]);

    expect(original.viewerEntries[0]?.path).toBe("src/a.ts@@item-change-1@@change-0");
    expect(original.viewerEntries[1]?.path).toBe("src/a.ts@@item-change-2@@change-0");
    expect(withEarlierEvent.viewerEntries.map((entry) => entry.path)).toContain(
      "src/a.ts@@item-change-1@@change-0",
    );
    expect(withEarlierEvent.viewerEntries.map((entry) => entry.path)).toContain(
      "src/a.ts@@item-change-2@@change-0",
    );
  });

  it("ignores non-fileChange conversation items", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "assistant",
        text: "hello",
      },
      {
        id: "tool-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command",
        detail: "",
        output: "",
      },
      fileChangeItem("change-1", [
        { path: "src/a.ts", kind: "modify", diff: "diff-a-1" },
      ]),
    ];

    const result = buildPerFileThreadDiffs(items);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.path).toBe("src/a.ts");
  });
});
