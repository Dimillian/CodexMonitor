import { DebugPanel } from "../../../debug/components/DebugPanel";
import { PlanPanel } from "../../../plan/components/PlanPanel";
import { TerminalDock } from "../../../terminal/components/TerminalDock";
import { TerminalPanel } from "../../../terminal/components/TerminalPanel";
import type {
  LayoutNodesResult,
  LayoutSecondarySurface,
} from "./types";

export type SecondaryLayoutNodesOptions = LayoutSecondarySurface;

type SecondaryLayoutNodes = Pick<
  LayoutNodesResult,
  | "planPanelNode"
  | "debugPanelNode"
  | "debugPanelFullNode"
  | "terminalDockNode"
  | "compactEmptyOpenCodeNode"
  | "compactEmptyGitNode"
  | "compactGitBackNode"
>;

function buildTerminalPanelNode(terminalState: SecondaryLayoutNodesOptions["terminalState"]) {
  if (!terminalState) {
    return null;
  }

  return (
    <TerminalPanel
      containerRef={terminalState.containerRef}
      status={terminalState.status}
      message={terminalState.message}
    />
  );
}

function buildDebugPanels(debugPanelProps: SecondaryLayoutNodesOptions["debugPanelProps"]) {
  const debugPanelNode = <DebugPanel {...debugPanelProps} />;
  const debugPanelFullNode = (
    <DebugPanel
      {...debugPanelProps}
      isOpen
      variant="full"
    />
  );

  return { debugPanelNode, debugPanelFullNode };
}

function buildCompactEmptyNode({
  title,
  description,
  onGoProjects,
}: {
  title: string;
  description: string;
  onGoProjects: () => void;
}) {
  return (
    <div className="compact-empty">
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="ghost" onClick={onGoProjects}>
        Go to Projects
      </button>
    </div>
  );
}

function buildCompactGitBackNode(
  compactNavProps: SecondaryLayoutNodesOptions["compactNavProps"],
) {
  const compactGitDiffActive =
    compactNavProps.centerMode === "diff" &&
    Boolean(compactNavProps.selectedDiffPath);

  return (
    <div className="compact-git-back">
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? "" : " active"}`}
        onClick={compactNavProps.onBackFromDiff}
      >
        Files
      </button>
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? " active" : ""}`}
        onClick={compactNavProps.onShowSelectedDiff}
        disabled={!compactNavProps.hasActiveGitDiffs}
      >
        Diff
      </button>
    </div>
  );
}

export function buildSecondaryNodes(options: SecondaryLayoutNodesOptions): SecondaryLayoutNodes {
  const planPanelNode = <PlanPanel {...options.planPanelProps} />;
  const terminalPanelNode = buildTerminalPanelNode(options.terminalState);

  const terminalDockNode = (
    <TerminalDock
      {...options.terminalDockProps}
      terminalNode={terminalPanelNode}
    />
  );

  const { debugPanelNode, debugPanelFullNode } = buildDebugPanels(options.debugPanelProps);

  const compactEmptyOpenCodeNode = buildCompactEmptyNode({
    title: "No workspace selected",
    description: "Choose a project to start chatting.",
    onGoProjects: options.compactNavProps.onGoProjects,
  });

  const compactEmptyGitNode = buildCompactEmptyNode({
    title: "No workspace selected",
    description: "Select a project to inspect diffs.",
    onGoProjects: options.compactNavProps.onGoProjects,
  });

  const compactGitBackNode = buildCompactGitBackNode(options.compactNavProps);

  return {
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyOpenCodeNode,
    compactEmptyGitNode,
    compactGitBackNode,
  };
}
