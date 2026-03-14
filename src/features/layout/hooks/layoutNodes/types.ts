import type { ComponentProps, ReactNode } from "react";
import { ApprovalToasts } from "../../../app/components/ApprovalToasts";
import { MainHeader } from "../../../app/components/MainHeader";
import { Sidebar } from "../../../app/components/Sidebar";
import { TabBar } from "../../../app/components/TabBar";
import { TabletNav } from "../../../app/components/TabletNav";
import { Composer } from "../../../composer/components/Composer";
import { DebugPanel } from "../../../debug/components/DebugPanel";
import { FileTreePanel } from "../../../files/components/FileTreePanel";
import { GitDiffPanel } from "../../../git/components/GitDiffPanel";
import { GitDiffViewer } from "../../../git/components/GitDiffViewer";
import { Home } from "../../../home/components/Home";
import { Messages } from "../../../messages/components/Messages";
import { ErrorToasts } from "../../../notifications/components/ErrorToasts";
import { PlanPanel } from "../../../plan/components/PlanPanel";
import { PromptPanel } from "../../../prompts/components/PromptPanel";
import { TerminalDock } from "../../../terminal/components/TerminalDock";
import type { TerminalSessionState } from "../../../terminal/hooks/useTerminalSession";
import { ThreadChatTreePanel } from "../../../threads/components/ThreadChatTreePanel";
import { UpdateToast } from "../../../update/components/UpdateToast";

export type WorktreeRenameState = {
  name: string;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  isDirty: boolean;
  upstream?: {
    oldBranch: string;
    newBranch: string;
    error: string | null;
    isSubmitting: boolean;
    onConfirm: () => void;
  } | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

export type LayoutPrimarySurface = {
  sidebarProps: ComponentProps<typeof Sidebar>;
  messagesProps: ComponentProps<typeof Messages>;
  composerProps: ComponentProps<typeof Composer> | null;
  approvalToastsProps: ComponentProps<typeof ApprovalToasts>;
  updateToastProps: ComponentProps<typeof UpdateToast>;
  errorToastsProps: ComponentProps<typeof ErrorToasts>;
  homeProps: ComponentProps<typeof Home>;
  mainHeaderProps: ComponentProps<typeof MainHeader> | null;
  desktopTopbarProps: {
    showBackToChat: boolean;
    onExitDiff: () => void;
  };
  tabletNavProps: ComponentProps<typeof TabletNav>;
  tabBarProps: ComponentProps<typeof TabBar>;
};

export type LayoutGitSurface = {
  filePanelMode: ComponentProps<typeof GitDiffPanel>["filePanelMode"];
  fileTreeProps: ComponentProps<typeof FileTreePanel> | null;
  promptPanelProps: ComponentProps<typeof PromptPanel>;
  gitDiffPanelProps: ComponentProps<typeof GitDiffPanel>;
  gitDiffViewerProps: ComponentProps<typeof GitDiffViewer>;
  diffViewProps: {
    centerMode: "chat" | "diff";
    isPhone: boolean;
    splitChatDiffView: boolean;
    gitDiffViewStyle: "split" | "unified";
  };
};

export type LayoutSecondarySurface = {
  chatTreePanelProps: ComponentProps<typeof ThreadChatTreePanel>;
  planPanelProps: ComponentProps<typeof PlanPanel>;
  terminalDockProps: Omit<ComponentProps<typeof TerminalDock>, "terminalNode">;
  terminalState: TerminalSessionState | null;
  debugPanelProps: ComponentProps<typeof DebugPanel>;
  compactNavProps: {
    onGoProjects: () => void;
    centerMode: "chat" | "diff";
    selectedDiffPath: string | null;
    onBackFromDiff: () => void;
    onShowSelectedDiff: () => void;
    hasActiveGitDiffs: boolean;
  };
};

export type LayoutNodesOptions = {
  primary: LayoutPrimarySurface;
  git: LayoutGitSurface;
  secondary: LayoutSecondarySurface;
};

export type LayoutNodesResult = {
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
  chatTreePanelNode: ReactNode;
  planPanelNode: ReactNode;
  debugPanelNode: ReactNode;
  debugPanelFullNode: ReactNode;
  terminalDockNode: ReactNode;
  compactEmptyCodexNode: ReactNode;
  compactEmptyGitNode: ReactNode;
  compactGitBackNode: ReactNode;
};
