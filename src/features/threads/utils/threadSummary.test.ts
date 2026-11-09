import { describe, expect, it } from "vitest";
import { buildThreadSummaryFromThread } from "./threadSummary";

const baseThread = {
  id: "thread-1",
  name: "Server-provided name",
  preview: "First message preview",
  source: "vscode",
};

describe("buildThreadSummaryFromThread", () => {
  it("prefers the server-provided thread name over the message preview", () => {
    const summary = buildThreadSummaryFromThread({
      workspaceId: "workspace-1",
      thread: baseThread,
      fallbackIndex: 0,
    });

    expect(summary?.name).toBe("Server-provided name");
  });

  it("keeps an explicit local rename ahead of the server-provided name", () => {
    const summary = buildThreadSummaryFromThread({
      workspaceId: "workspace-1",
      thread: baseThread,
      fallbackIndex: 0,
      getCustomName: () => "Local rename",
    });

    expect(summary?.name).toBe("Local rename");
  });

  it("falls back to the message preview when the server has no name", () => {
    const summary = buildThreadSummaryFromThread({
      workspaceId: "workspace-1",
      thread: { ...baseThread, name: null },
      fallbackIndex: 0,
    });

    expect(summary?.name).toBe("First message preview");
  });

  it("supports title as a compatibility fallback", () => {
    const summary = buildThreadSummaryFromThread({
      workspaceId: "workspace-1",
      thread: { ...baseThread, name: null, title: "Legacy title" },
      fallbackIndex: 0,
    });

    expect(summary?.name).toBe("Legacy title");
  });
});
