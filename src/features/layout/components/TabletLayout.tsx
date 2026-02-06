import type { MouseEvent, ReactNode } from "react";
import { MainTopbar } from "../../app/components/MainTopbar";

type TabletLayoutProps = {
  tabletNavNode: ReactNode;
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  showHome: boolean;
  showWorkspace: boolean;
  sidebarNode: ReactNode;
  tabletTab: "projects" | "codex" | "git" | "log";
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  topbarLeftNode: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  debugPanelNode: ReactNode;
};

export function TabletLayout({
  tabletNavNode,
  approvalToastsNode,
  updateToastNode,
  errorToastsNode,
  homeNode,
  showHome,
  showWorkspace,
  sidebarNode,
  tabletTab,
  onSidebarResizeStart,
  topbarLeftNode,
  messagesNode,
  composerNode,
  gitDiffPanelNode,
  gitDiffViewerNode,
  debugPanelNode,
}: TabletLayoutProps) {
  return (
    <>
      {tabletNavNode}
      <div className="tablet-projects">{sidebarNode}</div>
      <div
        className="projects-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize projects"
        onMouseDown={onSidebarResizeStart}
      />
      <section className="tablet-main">
        {approvalToastsNode}
        {updateToastNode}
        {errorToastsNode}
        {showHome && homeNode}
        {showWorkspace && (
          <>
            <MainTopbar leftNode={topbarLeftNode} className="tablet-topbar" />
            {tabletTab === "codex" && (
              <>
                <div className="content tablet-content">{messagesNode}</div>
                {composerNode}
              </>
            )}
            {tabletTab === "git" && (
              <div className="tablet-git">
                {gitDiffPanelNode}
                <div className="tablet-git-viewer">{gitDiffViewerNode}</div>
              </div>
            )}
            {tabletTab === "log" && debugPanelNode}
          </>
        )}
      </section>
    </>
  );
}
