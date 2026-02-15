import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { MainTopbar } from "../../app/components/MainTopbar";

type DesktopLayoutProps = {
  sidebarNode: ReactNode;
  updateToastNode: ReactNode;
  approvalToastsNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  showHome: boolean;
  showWorkspace: boolean;
  topbarLeftNode: ReactNode;
  centerMode: "chat" | "diff";
  preloadGitDiffs: boolean;
  messagesNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  planPanelNode: ReactNode;
  composerNode: ReactNode;
  terminalDockNode: ReactNode;
  debugPanelNode: ReactNode;
  hasActivePlan: boolean;
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onRightPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onPlanPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
};

export function DesktopLayout({
  sidebarNode,
  updateToastNode,
  approvalToastsNode,
  errorToastsNode,
  homeNode,
  showHome,
  showWorkspace,
  topbarLeftNode,
  centerMode,
  preloadGitDiffs,
  messagesNode,
  gitDiffViewerNode,
  gitDiffPanelNode,
  planPanelNode,
  composerNode,
  terminalDockNode,
  debugPanelNode,
  hasActivePlan,
  onSidebarResizeStart,
  onRightPanelResizeStart,
  onPlanPanelResizeStart,
}: DesktopLayoutProps) {
  const diffLayerRef = useRef<HTMLDivElement | null>(null);
  const chatLayerRef = useRef<HTMLDivElement | null>(null);
  const shouldRenderDiffViewer = preloadGitDiffs || centerMode === "diff";

  useEffect(() => {
    const diffLayer = diffLayerRef.current;
    const chatLayer = chatLayerRef.current;

    if (diffLayer) {
      if (centerMode === "diff") {
        diffLayer.removeAttribute("inert");
      } else {
        diffLayer.setAttribute("inert", "");
      }
    }

    if (chatLayer) {
      if (centerMode === "chat") {
        chatLayer.removeAttribute("inert");
      } else {
        chatLayer.setAttribute("inert", "");
      }
    }

    const hiddenLayer = centerMode === "diff" ? chatLayer : diffLayer;
    const activeElement = document.activeElement;
    if (
      hiddenLayer &&
      activeElement instanceof HTMLElement &&
      hiddenLayer.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, [centerMode]);

  return (
    <>
      {sidebarNode}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏大小"
        onMouseDown={onSidebarResizeStart}
      />

      <main className="main" aria-label="主内容">
        {updateToastNode}
        {errorToastsNode}
        {showHome && homeNode}

        {showWorkspace && (
          <>
            <MainTopbar leftNode={topbarLeftNode} />
            {approvalToastsNode}
            <div className="content">
              <div
                className={`content-layer ${centerMode === "diff" ? "is-active" : "is-hidden"}`}
                aria-hidden={centerMode !== "diff"}
                ref={diffLayerRef}
              >
                {shouldRenderDiffViewer ? gitDiffViewerNode : null}
              </div>
              <div
                className={`content-layer ${centerMode === "chat" ? "is-active" : "is-hidden"}`}
                aria-hidden={centerMode !== "chat"}
                ref={chatLayerRef}
              >
                {messagesNode}
              </div>
            </div>

            <div
              className="right-panel-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整右侧面板大小"
              onMouseDown={onRightPanelResizeStart}
            />
            <div className={`right-panel ${hasActivePlan ? "" : "plan-collapsed"}`}>
              <div className="right-panel-top">{gitDiffPanelNode}</div>
              <div
                className="right-panel-divider"
                role="separator"
                aria-orientation="horizontal"
                aria-label="调整方案面板大小"
                onMouseDown={onPlanPanelResizeStart}
              />
              <div className="right-panel-bottom">{planPanelNode}</div>
            </div>

            {composerNode}
            {terminalDockNode}
            {debugPanelNode}
          </>
        )}
      </main>
    </>
  );
}
