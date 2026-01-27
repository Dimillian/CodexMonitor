import { memo } from "react";
import type { MouseEvent, ReactNode } from "react";
import { DesktopLayout } from "../../layout/components/DesktopLayout";
import { TabletLayout } from "../../layout/components/TabletLayout";
import { PhoneLayout } from "../../layout/components/PhoneLayout";
type AppLayoutProps = {
  isPhone: boolean;
  isTablet: boolean;
  showHome: boolean;
  showGitDetail: boolean;
  activeTab: "projects" | "codex" | "git" | "log";
  tabletTab: "codex" | "git" | "log";
  centerMode: "chat" | "diff";
  hasActivePlan: boolean;
  activeWorkspace: boolean;
  sidebarNode: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  mainHeaderNode: ReactNode;
  desktopTopbarLeftNode: ReactNode;
  tabletNavNode: ReactNode;
  tabBarNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  planPanelNode: ReactNode;
  debugPanelNode: ReactNode;
  debugPanelFullNode: ReactNode;
  terminalDockNode: ReactNode;
  compactEmptyCodexNode: ReactNode;
  compactEmptyGitNode: ReactNode;
  compactGitBackNode: ReactNode;
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onRightPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onPlanPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
};

export const AppLayout = memo(function AppLayout({
  isPhone,
  isTablet,
  showHome,
  showGitDetail,
  activeTab,
  tabletTab,
  centerMode,
  hasActivePlan,
  activeWorkspace,
  sidebarNode,
  messagesNode,
  composerNode,
  approvalToastsNode,
  updateToastNode,
  errorToastsNode,
  homeNode,
  mainHeaderNode,
  desktopTopbarLeftNode,
  tabletNavNode,
  tabBarNode,
  gitDiffPanelNode,
  gitDiffViewerNode,
  planPanelNode,
  debugPanelNode,
  debugPanelFullNode,
  terminalDockNode,
  compactEmptyCodexNode,
  compactEmptyGitNode,
  compactGitBackNode,
  onSidebarResizeStart,
  onRightPanelResizeStart,
  onPlanPanelResizeStart,
}: AppLayoutProps) {
  if (isPhone) {
    return (
      <PhoneLayout
        approvalToastsNode={approvalToastsNode}
        updateToastNode={updateToastNode}
        errorToastsNode={errorToastsNode}
        tabBarNode={tabBarNode}
        sidebarNode={sidebarNode}
        activeTab={activeTab}
        activeWorkspace={activeWorkspace}
        showGitDetail={showGitDetail}
        compactEmptyCodexNode={compactEmptyCodexNode}
        compactEmptyGitNode={compactEmptyGitNode}
        compactGitBackNode={compactGitBackNode}
        topbarLeftNode={mainHeaderNode}
        messagesNode={messagesNode}
        composerNode={composerNode}
        gitDiffPanelNode={gitDiffPanelNode}
        gitDiffViewerNode={gitDiffViewerNode}
        debugPanelNode={debugPanelFullNode}
      />
    );
  }

  if (isTablet) {
    return (
      <TabletLayout
        tabletNavNode={tabletNavNode}
        approvalToastsNode={approvalToastsNode}
        updateToastNode={updateToastNode}
        errorToastsNode={errorToastsNode}
        homeNode={homeNode}
        showHome={showHome}
        showWorkspace={activeWorkspace && !showHome}
        sidebarNode={sidebarNode}
        tabletTab={tabletTab}
        onSidebarResizeStart={onSidebarResizeStart}
        topbarLeftNode={mainHeaderNode}
        messagesNode={messagesNode}
        composerNode={composerNode}
        gitDiffPanelNode={gitDiffPanelNode}
        gitDiffViewerNode={gitDiffViewerNode}
        debugPanelNode={debugPanelFullNode}
      />
    );
  }

  return (
    <DesktopLayout
      sidebarNode={sidebarNode}
      updateToastNode={updateToastNode}
      approvalToastsNode={approvalToastsNode}
      errorToastsNode={errorToastsNode}
      homeNode={homeNode}
      showHome={showHome}
      showWorkspace={activeWorkspace && !showHome}
      topbarLeftNode={desktopTopbarLeftNode}
      centerMode={centerMode}
      messagesNode={messagesNode}
      gitDiffViewerNode={gitDiffViewerNode}
      gitDiffPanelNode={gitDiffPanelNode}
      planPanelNode={planPanelNode}
      composerNode={composerNode}
      terminalDockNode={terminalDockNode}
      debugPanelNode={debugPanelNode}
      hasActivePlan={hasActivePlan}
      onSidebarResizeStart={onSidebarResizeStart}
      onRightPanelResizeStart={onRightPanelResizeStart}
      onPlanPanelResizeStart={onPlanPanelResizeStart}
    />
  );
});
