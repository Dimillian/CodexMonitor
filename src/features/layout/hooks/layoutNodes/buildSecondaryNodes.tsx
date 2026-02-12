import { DebugPanel } from "../../../debug/components/DebugPanel";
import { PlanPanel } from "../../../plan/components/PlanPanel";
import { TerminalDock } from "../../../terminal/components/TerminalDock";
import { TerminalPanel } from "../../../terminal/components/TerminalPanel";
import type { LayoutNodesOptions, LayoutNodesResult } from "./types";

type SecondaryLayoutNodes = Pick<
  LayoutNodesResult,
  | "planPanelNode"
  | "debugPanelNode"
  | "debugPanelFullNode"
  | "terminalDockNode"
  | "compactEmptyCodexNode"
  | "compactEmptyGitNode"
  | "compactGitBackNode"
>;

export function buildSecondaryNodes(options: LayoutNodesOptions): SecondaryLayoutNodes {
  const planPanelNode = <PlanPanel plan={options.plan} isProcessing={options.isProcessing} />;

  const terminalPanelNode = options.terminalState ? (
    <TerminalPanel
      containerRef={options.terminalState.containerRef}
      status={options.terminalState.status}
      message={options.terminalState.message}
    />
  ) : null;

  const terminalDockNode = (
    <TerminalDock
      isOpen={options.terminalOpen}
      terminals={options.terminalTabs}
      activeTerminalId={options.activeTerminalId}
      onSelectTerminal={options.onSelectTerminal}
      onNewTerminal={options.onNewTerminal}
      onCloseTerminal={options.onCloseTerminal}
      onResizeStart={options.onResizeTerminal}
      terminalNode={terminalPanelNode}
    />
  );

  const debugPanelNode = (
    <DebugPanel
      entries={options.debugEntries}
      isOpen={options.debugOpen}
      onClear={options.onClearDebug}
      onCopy={options.onCopyDebug}
      onResizeStart={options.onResizeDebug}
    />
  );

  const debugPanelFullNode = (
    <DebugPanel
      entries={options.debugEntries}
      isOpen
      onClear={options.onClearDebug}
      onCopy={options.onCopyDebug}
      variant="full"
    />
  );

  const compactEmptyCodexNode = (
    <div className="compact-empty">
      <h3>No workspace selected</h3>
      <p>Choose a project to start chatting.</p>
      <button className="ghost" onClick={options.onGoProjects}>
        Go to Projects
      </button>
    </div>
  );

  const compactEmptyGitNode = (
    <div className="compact-empty">
      <h3>No workspace selected</h3>
      <p>Select a project to inspect diffs.</p>
      <button className="ghost" onClick={options.onGoProjects}>
        Go to Projects
      </button>
    </div>
  );

  const compactGitDiffActive =
    options.centerMode === "diff" && Boolean(options.selectedDiffPath);
  const compactGitBackNode = (
    <div className="compact-git-back">
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? "" : " active"}`}
        onClick={options.onBackFromDiff}
      >
        Files
      </button>
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? " active" : ""}`}
        onClick={options.onShowSelectedDiff}
        disabled={!options.hasActiveGitDiffs}
      >
        Diff
      </button>
    </div>
  );

  return {
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyCodexNode,
    compactEmptyGitNode,
    compactGitBackNode,
  };
}
