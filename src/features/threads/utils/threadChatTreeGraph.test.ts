import { describe, expect, it } from "vitest";
import type { ThreadChatTree } from "@/types";
import { buildThreadChatTreeGraph } from "./threadChatTreeGraph";

describe("buildThreadChatTreeGraph", () => {
  it("fans siblings out horizontally while keeping descendants below their parent branch", () => {
    const tree: ThreadChatTree = {
      currentNodeId: "node-d",
      nodes: [
        { nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 },
        { nodeId: "node-b", parentNodeId: "node-a", summary: "B", turnId: "turn-b", order: 1 },
        { nodeId: "node-c", parentNodeId: "node-a", summary: "C", turnId: "turn-c", order: 2 },
        { nodeId: "node-d", parentNodeId: "node-b", summary: "D", turnId: "turn-d", order: 3 },
      ],
    };

    const layout = buildThreadChatTreeGraph(tree);
    const nodesById = new Map(layout.nodes.map((entry) => [entry.node.nodeId, entry]));

    expect(layout.laneCount).toBe(2);
    expect(layout.depthCount).toBe(3);
    expect(nodesById.get("node-a")).toMatchObject({ depth: 0, isCurrent: false });
    expect(nodesById.get("node-b")).toMatchObject({ depth: 1, parentNodeId: "node-a" });
    expect(nodesById.get("node-c")).toMatchObject({ depth: 1, parentNodeId: "node-a" });
    expect(nodesById.get("node-d")).toMatchObject({
      depth: 2,
      parentNodeId: "node-b",
      isCurrent: true,
    });
    expect((nodesById.get("node-c")?.lane ?? 0) > (nodesById.get("node-b")?.lane ?? 0)).toBe(true);
  });

  it("keeps new branches attached to the ancestor they were forked from", () => {
    const tree: ThreadChatTree = {
      currentNodeId: "node-5",
      nodes: [
        { nodeId: "node-1", parentNodeId: null, summary: "1", turnId: "turn-1", order: 0 },
        { nodeId: "node-2", parentNodeId: "node-1", summary: "2", turnId: "turn-2", order: 1 },
        { nodeId: "node-3", parentNodeId: "node-2", summary: "3", turnId: "turn-3", order: 2 },
        { nodeId: "node-4", parentNodeId: "node-2", summary: "4", turnId: "turn-4", order: 3 },
        { nodeId: "node-5", parentNodeId: "node-1", summary: "5", turnId: "turn-5", order: 4 },
      ],
    };

    const layout = buildThreadChatTreeGraph(tree);
    const nodesById = new Map(layout.nodes.map((entry) => [entry.node.nodeId, entry]));

    expect(nodesById.get("node-2")).toMatchObject({ depth: 1, parentNodeId: "node-1" });
    expect(nodesById.get("node-5")).toMatchObject({
      depth: 1,
      parentNodeId: "node-1",
      isCurrent: true,
    });
    expect(nodesById.get("node-3")).toMatchObject({ depth: 2, parentNodeId: "node-2" });
    expect(nodesById.get("node-4")).toMatchObject({ depth: 2, parentNodeId: "node-2" });
    expect((nodesById.get("node-5")?.lane ?? 0) > (nodesById.get("node-2")?.lane ?? 0)).toBe(true);
    expect((nodesById.get("node-4")?.lane ?? 0) > (nodesById.get("node-3")?.lane ?? 0)).toBe(true);
  });

  it("uses upstream order to sort siblings before layout", () => {
    const tree: ThreadChatTree = {
      currentNodeId: "node-a",
      nodes: [
        { nodeId: "node-c", parentNodeId: "node-a", summary: "C", turnId: "turn-c", order: 2 },
        { nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 },
        { nodeId: "node-b", parentNodeId: "node-a", summary: "B", turnId: "turn-b", order: 1 },
      ],
    };

    const layout = buildThreadChatTreeGraph(tree);

    expect(layout.nodes.map((entry) => entry.node.nodeId)).toEqual([
      "node-a",
      "node-b",
      "node-c",
    ]);
  });
});
