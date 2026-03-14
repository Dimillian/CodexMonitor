import type { ThreadChatTree, ThreadChatTreeNode } from "@/types";

export type ThreadChatTreeGraphNode = {
  node: ThreadChatTreeNode;
  lane: number;
  depth: number;
  parentNodeId: string | null;
  isCurrent: boolean;
};

export type ThreadChatTreeGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

export type ThreadChatTreeGraphLayout = {
  nodes: ThreadChatTreeGraphNode[];
  edges: ThreadChatTreeGraphEdge[];
  laneCount: number;
  depthCount: number;
};

function byOrder(a: ThreadChatTreeNode, b: ThreadChatTreeNode) {
  const orderDelta = a.order - b.order;
  if (orderDelta !== 0) {
    return orderDelta;
  }
  return a.nodeId.localeCompare(b.nodeId);
}

export function buildThreadChatTreeGraph(
  tree: ThreadChatTree | null,
): ThreadChatTreeGraphLayout {
  const orderedNodes = [...(tree?.nodes ?? [])].sort(byOrder);
  if (orderedNodes.length === 0) {
    return { nodes: [], edges: [], laneCount: 0, depthCount: 0 };
  }

  const nodeById = new Map(orderedNodes.map((node) => [node.nodeId, node]));
  const childrenByParent = new Map<string, ThreadChatTreeNode[]>();
  const roots: ThreadChatTreeNode[] = [];

  orderedNodes.forEach((node) => {
    if (node.parentNodeId && nodeById.has(node.parentNodeId)) {
      const siblings = childrenByParent.get(node.parentNodeId) ?? [];
      siblings.push(node);
      childrenByParent.set(node.parentNodeId, siblings);
      return;
    }
    roots.push(node);
  });

  childrenByParent.forEach((children) => {
    children.sort(byOrder);
  });
  roots.sort(byOrder);

  const subtreeWidthById = new Map<string, number>();

  function subtreeWidth(nodeId: string): number {
    const cached = subtreeWidthById.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    const children = childrenByParent.get(nodeId) ?? [];
    const width =
      children.length === 0
        ? 1
        : children.reduce((total, child) => total + subtreeWidth(child.nodeId), 0);

    subtreeWidthById.set(nodeId, width);
    return width;
  }

  const graphNodeById = new Map<string, ThreadChatTreeGraphNode>();
  const edges: ThreadChatTreeGraphEdge[] = [];
  let maxDepth = 0;
  let laneCursor = 0;

  function assignNode(node: ThreadChatTreeNode, startLane: number, depth: number) {
    const children = childrenByParent.get(node.nodeId) ?? [];
    maxDepth = Math.max(maxDepth, depth);

    let lane = startLane;
    if (children.length > 0) {
      let childLaneStart = startLane;
      const childCenters: number[] = [];
      children.forEach((child) => {
        assignNode(child, childLaneStart, depth + 1);
        const childGraphNode = graphNodeById.get(child.nodeId);
        if (childGraphNode) {
          childCenters.push(childGraphNode.lane);
        }
        childLaneStart += subtreeWidth(child.nodeId);
        edges.push({ fromNodeId: node.nodeId, toNodeId: child.nodeId });
      });
      if (childCenters.length > 0) {
        lane = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      }
    }

    graphNodeById.set(node.nodeId, {
      node,
      lane,
      depth,
      parentNodeId: node.parentNodeId,
      isCurrent: tree?.currentNodeId === node.nodeId,
    });
  }

  roots.forEach((rootNode) => {
    assignNode(rootNode, laneCursor, 0);
    laneCursor += subtreeWidth(rootNode.nodeId);
  });

  const graphNodes = [...graphNodeById.values()].sort((a, b) => {
    const depthDelta = a.depth - b.depth;
    if (depthDelta !== 0) {
      return depthDelta;
    }
    const laneDelta = a.lane - b.lane;
    if (laneDelta !== 0) {
      return laneDelta;
    }
    return byOrder(a.node, b.node);
  });

  return {
    nodes: graphNodes,
    edges,
    laneCount: Math.max(1, laneCursor),
    depthCount: maxDepth + 1,
  };
}
