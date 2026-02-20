import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { MainTopbar } from "../../app/components/MainTopbar";

type CenterMode = "chat" | "diff";

function shouldRenderDiffViewer({
  splitChatDiffView,
  preloadGitDiffs,
  centerMode,
}: {
  splitChatDiffView: boolean;
  preloadGitDiffs: boolean;
  centerMode: CenterMode;
}) {
  return splitChatDiffView || preloadGitDiffs || centerMode === "diff";
}

function isActiveLayer(centerMode: CenterMode, layer: CenterMode) {
  return centerMode === layer;
}

function layerClassName({
  splitChatDiffView,
  layer,
  isActive,
}: {
  splitChatDiffView: boolean;
  layer: CenterMode;
  isActive: boolean;
}) {
  if (splitChatDiffView) {
    return `content-layer content-layer-split content-layer-${layer}${
      isActive ? " is-active" : ""
    }`;
  }
  return `content-layer ${isActive ? "is-active" : "is-hidden"}`;
}

function setLayerInert(
  layer: HTMLDivElement | null,
  isActive: boolean,
  splitChatDiffView: boolean,
) {
  if (!layer) {
    return;
  }

  if (splitChatDiffView || isActive) {
    layer.removeAttribute("inert");
    return;
  }

  layer.setAttribute("inert", "");
}

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
  splitChatDiffView: boolean;
  messagesNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  planPanelNode: ReactNode;
  composerNode: ReactNode;
  terminalDockNode: ReactNode;
  debugPanelNode: ReactNode;
  hasActivePlan: boolean;
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onChatDiffSplitPositionResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
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
  splitChatDiffView,
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
  onChatDiffSplitPositionResizeStart,
}: DesktopLayoutProps) {
  const diffLayerRef = useRef<HTMLDivElement | null>(null);
  const chatLayerRef = useRef<HTMLDivElement | null>(null);
  const diffLayerActive = isActiveLayer(centerMode, "diff");
  const chatLayerActive = isActiveLayer(centerMode, "chat");
  const showDiffViewer = shouldRenderDiffViewer({
    splitChatDiffView,
    preloadGitDiffs,
    centerMode,
  });

  useEffect(() => {
    const diffLayer = diffLayerRef.current;
    const chatLayer = chatLayerRef.current;
    setLayerInert(diffLayer, diffLayerActive, splitChatDiffView);
    setLayerInert(chatLayer, chatLayerActive, splitChatDiffView);

    if (splitChatDiffView) {
      return;
    }

    const hiddenLayer = diffLayerActive ? chatLayer : diffLayer;
    const activeElement = document.activeElement;
    if (
      hiddenLayer &&
      activeElement instanceof HTMLElement &&
      hiddenLayer.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, [chatLayerActive, diffLayerActive, splitChatDiffView]);

  return (
    <>
      {sidebarNode}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={onSidebarResizeStart}
      />

      <section className="main">
        {updateToastNode}
        {errorToastsNode}
        {showHome && homeNode}

        {showWorkspace && (
          <>
            <MainTopbar leftNode={topbarLeftNode} />
            {approvalToastsNode}
            <div className={`content${splitChatDiffView ? " content-split" : ""}`}>
              {splitChatDiffView ? (
                <>
                  <div
                    className={layerClassName({
                      splitChatDiffView,
                      layer: "chat",
                      isActive: chatLayerActive,
                    })}
                    ref={chatLayerRef}
                  >
                    {messagesNode}
                  </div>
                  <div
                    className="content-split-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize chat/diff split"
                    onMouseDown={onChatDiffSplitPositionResizeStart}
                  />
                  <div
                    className={layerClassName({
                      splitChatDiffView,
                      layer: "diff",
                      isActive: diffLayerActive,
                    })}
                    ref={diffLayerRef}
                  >
                    {showDiffViewer ? gitDiffViewerNode : null}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={layerClassName({
                      splitChatDiffView,
                      layer: "diff",
                      isActive: diffLayerActive,
                    })}
                    aria-hidden={!splitChatDiffView ? !diffLayerActive : undefined}
                    ref={diffLayerRef}
                  >
                    {showDiffViewer ? gitDiffViewerNode : null}
                  </div>
                  <div
                    className={layerClassName({
                      splitChatDiffView,
                      layer: "chat",
                      isActive: chatLayerActive,
                    })}
                    aria-hidden={!splitChatDiffView ? !chatLayerActive : undefined}
                    ref={chatLayerRef}
                  >
                    {messagesNode}
                  </div>
                </>
              )}
            </div>

            <div
              className="right-panel-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right panel"
              onMouseDown={onRightPanelResizeStart}
            />
            <div className={`right-panel ${hasActivePlan ? "" : "plan-collapsed"}`}>
              <div className="right-panel-top">{gitDiffPanelNode}</div>
              <div
                className="right-panel-divider"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize plan panel"
                onMouseDown={onPlanPanelResizeStart}
              />
              <div className="right-panel-bottom">{planPanelNode}</div>
            </div>

            {composerNode}
            {terminalDockNode}
            {debugPanelNode}
          </>
        )}
      </section>
    </>
  );
}
