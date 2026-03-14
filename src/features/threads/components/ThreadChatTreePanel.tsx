import { useEffect, useMemo, useState } from "react";
import type { ThreadChatTree } from "@/types";
import { PopoverSurface } from "@/features/design-system/components/popover/PopoverPrimitives";
import {
  PanelFrame,
  PanelHeader,
  PanelMeta,
} from "../../design-system/components/panel/PanelPrimitives";
import { buildThreadChatTreeGraph } from "../utils/threadChatTreeGraph";

type ThreadChatTreePanelProps = {
  tree: ThreadChatTree | null;
  isLoading: boolean;
  isSwitching: boolean;
  switchingNodeId: string | null;
  isProcessing: boolean;
  error: string | null;
  onReload: () => void | Promise<unknown>;
  onSetCurrentNode: (nodeId: string) => void | Promise<boolean>;
};

const DEPTH_GAP = 78;
const LANE_GAP = 64;
const GRAPH_PADDING_X = 30;
const GRAPH_PADDING_Y = 22;
const NODE_RADIUS = 7;
const CONNECTOR_CURVE_OFFSET = 26;
const NODE_POPOVER_OFFSET_Y = 20;

function shortId(value: string | null) {
  if (!value) {
    return "unknown";
  }
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
}

function nodeTitle(node: ThreadChatTree["nodes"][number]) {
  return node.summary?.trim() || node.turnId?.trim() || shortId(node.nodeId);
}

function laneX(lane: number) {
  return GRAPH_PADDING_X + lane * LANE_GAP;
}

function depthY(depth: number) {
  return GRAPH_PADDING_Y + depth * DEPTH_GAP;
}

export function ThreadChatTreePanel({
  tree,
  isLoading,
  isSwitching,
  switchingNodeId,
  isProcessing,
  error,
  onReload,
  onSetCurrentNode,
}: ThreadChatTreePanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const graph = buildThreadChatTreeGraph(tree);
  const graphNodeById = new Map(graph.nodes.map((entry) => [entry.node.nodeId, entry]));
  const selectedEntry = useMemo(
    () =>
      selectedNodeId
        ? graph.nodes.find((entry) => entry.node.nodeId === selectedNodeId) ?? null
        : null,
    [graph.nodes, selectedNodeId],
  );
  const graphWidth =
    graph.laneCount > 0
      ? GRAPH_PADDING_X * 2 + Math.max(0, graph.laneCount - 1) * LANE_GAP
      : GRAPH_PADDING_X * 2;
  const graphHeight =
    graph.depthCount > 0
      ? GRAPH_PADDING_Y * 2 + Math.max(0, graph.depthCount - 1) * DEPTH_GAP
      : GRAPH_PADDING_Y * 2;
  const hasNodes = graph.nodes.length > 0;
  const subtitle = hasNodes
    ? `${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"}`
    : "No branches yet";
  const branchSwitchingDisabled = isProcessing || isLoading || isSwitching;

  useEffect(() => {
    if (selectedNodeId && !graphNodeById.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [graphNodeById, selectedNodeId]);

  useEffect(() => {
    if (switchingNodeId) {
      setSelectedNodeId(switchingNodeId);
    }
  }, [switchingNodeId]);

  async function handleSwitchNode(nodeId: string) {
    const didSwitch = await onSetCurrentNode(nodeId);
    if (didSwitch) {
      setSelectedNodeId(null);
    }
  }

  return (
    <PanelFrame className="chat-tree-panel">
      <PanelHeader className="chat-tree-panel-header">
        <span>Chat Tree</span>
        <PanelMeta className="chat-tree-panel-meta">
          <span>{subtitle}</span>
          <button
            type="button"
            className="chat-tree-panel-refresh"
            onClick={() => {
              void onReload();
            }}
            disabled={isLoading || isSwitching}
          >
            Refresh
          </button>
        </PanelMeta>
      </PanelHeader>
      <div className="chat-tree-panel-body">
        {error ? <div className="chat-tree-panel-error">{error}</div> : null}
        {!hasNodes ? (
          <div className="chat-tree-panel-empty">
            {isLoading
              ? "Loading branch graph..."
              : "This thread has no branch nodes yet."}
          </div>
        ) : (
          <>
            <div className="chat-tree-panel-hint">
              {isProcessing
                ? "Branch switching is disabled while the thread is running."
                : isLoading || isSwitching
                  ? "Branch switching is disabled while the thread is refreshing."
                  : "Tap or click a node to inspect it, then use Switch to change branches."}
            </div>
            <div
              className="chat-tree-graph"
              style={{
                minWidth: `${graphWidth}px`,
                minHeight: `${graphHeight}px`,
              }}
              onClick={() => {
                setSelectedNodeId(null);
              }}
            >
              <svg
                className="chat-tree-graph-svg"
                width={graphWidth}
                height={graphHeight}
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                aria-hidden="true"
              >
                {graph.edges.map((edge) => {
                  const fromNode = graphNodeById.get(edge.fromNodeId);
                  const toNode = graphNodeById.get(edge.toNodeId);
                  if (!fromNode || !toNode) {
                    return null;
                  }

                  const fromX = laneX(fromNode.lane);
                  const fromY = depthY(fromNode.depth);
                  const toX = laneX(toNode.lane);
                  const toY = depthY(toNode.depth);
                  const verticalGap = toY - fromY;
                  const splitY = fromY + Math.min(verticalGap * 0.5, CONNECTOR_CURVE_OFFSET);
                  const path =
                    Math.abs(fromX - toX) < 0.5
                      ? `M ${fromX} ${fromY + NODE_RADIUS} L ${toX} ${toY - NODE_RADIUS}`
                      : `M ${fromX} ${fromY + NODE_RADIUS} C ${fromX} ${splitY} ${toX} ${splitY} ${toX} ${toY - NODE_RADIUS}`;

                  return (
                    <path
                      key={`${edge.fromNodeId}->${edge.toNodeId}`}
                      className="chat-tree-graph-connector"
                      d={path}
                    />
                  );
                })}
              </svg>
              {graph.nodes.map((entry) => (
                <button
                  key={entry.node.nodeId}
                  type="button"
                  className={`chat-tree-graph-node-button${entry.isCurrent ? " is-current" : ""}${
                    switchingNodeId === entry.node.nodeId ? " is-switching" : ""
                  }${selectedNodeId === entry.node.nodeId ? " is-selected" : ""}`}
                  style={{
                    left: `${laneX(entry.lane)}px`,
                    top: `${depthY(entry.depth)}px`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedNodeId((current) =>
                      current === entry.node.nodeId ? null : entry.node.nodeId,
                    );
                  }}
                  aria-label={nodeTitle(entry.node)}
                  aria-pressed={selectedNodeId === entry.node.nodeId}
                >
                  <span className="chat-tree-graph-node-dot" />
                </button>
              ))}
              {selectedEntry ? (
                <PopoverSurface
                  className="chat-tree-node-popover"
                  role="dialog"
                  style={{
                    left: `${laneX(selectedEntry.lane)}px`,
                    top: `${depthY(selectedEntry.depth) + NODE_POPOVER_OFFSET_Y}px`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <div className="chat-tree-node-popover-title">{nodeTitle(selectedEntry.node)}</div>
                  <div className="chat-tree-node-popover-meta">
                    <div>{selectedEntry.isCurrent ? "Current branch" : "Available branch"}</div>
                    <div>Node: {shortId(selectedEntry.node.nodeId)}</div>
                    {selectedEntry.node.turnId ? (
                      <div>Turn: {shortId(selectedEntry.node.turnId)}</div>
                    ) : null}
                  </div>
                  {!selectedEntry.isCurrent ? (
                    <div className="chat-tree-node-popover-actions">
                      <button
                        type="button"
                        className="chat-tree-node-switch"
                        disabled={
                          branchSwitchingDisabled ||
                          switchingNodeId === selectedEntry.node.nodeId
                        }
                        onClick={() => {
                          void handleSwitchNode(selectedEntry.node.nodeId);
                        }}
                      >
                        {switchingNodeId === selectedEntry.node.nodeId
                          ? "Switching..."
                          : "Switch"}
                      </button>
                    </div>
                  ) : (
                    <div className="chat-tree-node-popover-current">Current</div>
                  )}
                </PopoverSurface>
              ) : null}
            </div>
          </>
        )}
      </div>
    </PanelFrame>
  );
}
