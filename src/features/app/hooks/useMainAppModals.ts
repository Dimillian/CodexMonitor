import { useMemo } from "react";
import type { ComponentType } from "react";
import type {
  AppSettings,
  BranchInfo,
  CodexDoctorResult,
  CodexUpdateResult,
  ThreadSummary,
  WorkspaceGroup,
  WorkspaceInfo,
  WorkspaceSettings,
} from "@/types";
import { useSettingsModalState } from "@app/hooks/useSettingsModalState";
import type { SettingsSection } from "@app/hooks/useSettingsModalState";
import type { AppModalsProps } from "@app/components/AppModals";
import type { SettingsViewProps } from "@settings/components/SettingsView";
import { useRenameThreadPrompt } from "@threads/hooks/useRenameThreadPrompt";
import { useBranchSwitcher } from "@/features/git/hooks/useBranchSwitcher";
import { useInitGitRepoPrompt } from "@/features/git/hooks/useInitGitRepoPrompt";
import type { InitGitRepoOutcome } from "@/features/git/hooks/useGitActions";
import { useWorktreePrompt } from "@/features/workspaces/hooks/useWorktreePrompt";
import { useClonePrompt } from "@/features/workspaces/hooks/useClonePrompt";

type GroupedWorkspaceInfo = SettingsViewProps["groupedWorkspaces"];

type UseMainAppModalsArgs = {
  settingsViewComponent: ComponentType<SettingsViewProps>;
  workspaces: WorkspaceInfo[];
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaceInfo;
  ungroupedLabel: string;
  activeWorkspace: WorkspaceInfo | null;
  setActiveWorkspaceId: (id: string) => void;
  branches: BranchInfo[];
  currentBranch: string | null;
  threadRename: {
    threadsByWorkspace: Record<string, ThreadSummary[]>;
    renameThread: (workspaceId: string, threadId: string, name: string) => void;
  };
  git: {
    checkoutBranch: (name: string) => Promise<void>;
    initGitRepo: (branch: string) => Promise<InitGitRepoOutcome>;
    createGitHubRepo: (
      repo: string,
      visibility: "private" | "public",
      branch: string,
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    refreshGitRemote: () => void;
    initGitRepoLoading: boolean;
    createGitHubRepoLoading: boolean;
  };
  workspacePrompts: {
    addWorktreeAgent: (
      workspace: WorkspaceInfo,
      branch: string,
      options?: { displayName?: string | null; copyAgentsMd?: boolean },
    ) => Promise<WorkspaceInfo | null>;
    addCloneAgent: (
      workspace: WorkspaceInfo,
      copyName: string,
      copiesFolder: string,
    ) => Promise<WorkspaceInfo | null>;
    connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
    updateWorkspaceSettings: (
      id: string,
      settings: Partial<WorkspaceSettings>,
    ) => Promise<WorkspaceInfo>;
    selectWorkspace: (workspaceId: string) => void;
    handleWorktreeCreated: (worktree: WorkspaceInfo, parent: WorkspaceInfo) => Promise<void>;
    resolveCloneProjectContext: (
      workspace: WorkspaceInfo,
    ) => { groupId: string | null; copiesFolder: string | null };
    persistProjectCopiesFolder: (groupId: string, copiesFolder: string) => Promise<void>;
    onCompactActivate?: () => void;
    onWorkspacePromptError: (message: string, kind: "worktree" | "clone") => void;
    mobileRemoteWorkspacePathPrompt: AppModalsProps["mobileRemoteWorkspacePathPrompt"];
    updateMobileRemoteWorkspacePathInput: (value: string) => void;
    appendMobileRemoteWorkspacePathFromRecent: (path: string) => void;
    cancelMobileRemoteWorkspacePathPrompt: () => void;
    submitMobileRemoteWorkspacePathPrompt: () => void;
    openWorkspaceFromUrlPrompt: () => void;
    workspaceFromUrl: Pick<
      AppModalsProps,
      | "workspaceFromUrlPrompt"
      | "workspaceFromUrlCanSubmit"
      | "onWorkspaceFromUrlPromptUrlChange"
      | "onWorkspaceFromUrlPromptTargetFolderNameChange"
      | "onWorkspaceFromUrlPromptChooseDestinationPath"
      | "onWorkspaceFromUrlPromptClearDestinationPath"
      | "onWorkspaceFromUrlPromptCancel"
      | "onWorkspaceFromUrlPromptConfirm"
    >;
  };
  settings: {
    handleMoveWorkspace: (id: string, direction: "up" | "down") => void;
    removeWorkspace: (workspaceId: string) => Promise<void>;
    createWorkspaceGroup: (name: string) => Promise<WorkspaceGroup | null>;
    renameWorkspaceGroup: (id: string, name: string) => Promise<boolean | null>;
    moveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
    deleteWorkspaceGroup: (id: string) => Promise<boolean | null>;
    assignWorkspaceGroup: (
      workspaceId: string,
      groupId: string | null,
    ) => Promise<boolean | null>;
    reduceTransparency: boolean;
    setReduceTransparency: (value: boolean) => void;
    appSettings: AppSettings;
    openAppIconById: Record<string, string>;
    queueSaveSettings: (next: AppSettings) => Promise<unknown>;
    handleToggleAutomaticAppUpdateChecks: () => void;
    doctor: (
      codexBin: string | null,
      codexArgs: string | null,
    ) => Promise<CodexDoctorResult>;
    codexUpdate?: (
      codexBin: string | null,
      codexArgs: string | null,
    ) => Promise<CodexUpdateResult>;
    updateWorkspaceSettings: (
      id: string,
      settings: Partial<WorkspaceSettings>,
    ) => Promise<WorkspaceInfo>;
    scaleShortcutTitle: string;
    scaleShortcutText: string;
    handleTestNotificationSound: () => void;
    handleTestSystemNotification: () => void;
    handleMobileConnectSuccess?: () => Promise<void> | void;
    dictationModel: {
      status?: SettingsViewProps["dictationModelStatus"];
      download?: () => void;
      cancel?: () => void;
      remove?: () => void;
    };
  };
};

type UseMainAppModalsResult = {
  appModalsProps: AppModalsProps;
  modalActions: {
    openSettings: (section?: SettingsSection) => void;
    closeSettings: () => void;
    openRenamePrompt: (workspaceId: string, threadId: string) => void;
    openInitGitRepoPrompt: () => void;
    openWorktreePrompt: (workspace: WorkspaceInfo) => void;
    openClonePrompt: (workspace: WorkspaceInfo) => void;
    openWorkspaceFromUrlPrompt: () => void;
    openBranchSwitcher: () => void;
    closeBranchSwitcher: () => void;
  };
};

export function useMainAppModals({
  settingsViewComponent,
  workspaces,
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  activeWorkspace,
  setActiveWorkspaceId,
  branches,
  currentBranch,
  threadRename,
  git,
  workspacePrompts,
  settings,
}: UseMainAppModalsArgs): UseMainAppModalsResult {
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
  } = useSettingsModalState();

  const {
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  } = useRenameThreadPrompt({
    threadsByWorkspace: threadRename.threadsByWorkspace,
    renameThread: threadRename.renameThread,
  });

  const {
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  } = useBranchSwitcher({
    activeWorkspace,
    checkoutBranch: git.checkoutBranch,
    setActiveWorkspaceId,
  });

  const {
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
  } = useInitGitRepoPrompt({
    activeWorkspace,
    initGitRepo: git.initGitRepo,
    createGitHubRepo: git.createGitHubRepo,
    refreshGitRemote: git.refreshGitRemote,
    isBusy: git.initGitRepoLoading || git.createGitHubRepoLoading,
  });

  const {
    worktreePrompt,
    openPrompt: openWorktreePrompt,
    confirmPrompt: confirmWorktreePrompt,
    cancelPrompt: cancelWorktreePrompt,
    updateName: updateWorktreeName,
    updateBranch: updateWorktreeBranch,
    updateCopyAgentsMd: updateWorktreeCopyAgentsMd,
    updateSetupScript: updateWorktreeSetupScript,
  } = useWorktreePrompt({
    addWorktreeAgent: workspacePrompts.addWorktreeAgent,
    updateWorkspaceSettings: workspacePrompts.updateWorkspaceSettings,
    connectWorkspace: workspacePrompts.connectWorkspace,
    onSelectWorkspace: workspacePrompts.selectWorkspace,
    onWorktreeCreated: workspacePrompts.handleWorktreeCreated,
    onCompactActivate: workspacePrompts.onCompactActivate,
    onError: (message) => workspacePrompts.onWorkspacePromptError(message, "worktree"),
  });

  const {
    clonePrompt,
    openPrompt: openClonePrompt,
    confirmPrompt: confirmClonePrompt,
    cancelPrompt: cancelClonePrompt,
    updateCopyName: updateCloneCopyName,
    chooseCopiesFolder: chooseCloneCopiesFolder,
    useSuggestedCopiesFolder: useSuggestedCloneCopiesFolder,
    clearCopiesFolder: clearCloneCopiesFolder,
  } = useClonePrompt({
    addCloneAgent: workspacePrompts.addCloneAgent,
    connectWorkspace: workspacePrompts.connectWorkspace,
    onSelectWorkspace: workspacePrompts.selectWorkspace,
    resolveProjectContext: workspacePrompts.resolveCloneProjectContext,
    persistProjectCopiesFolder: workspacePrompts.persistProjectCopiesFolder,
    onCompactActivate: workspacePrompts.onCompactActivate,
    onError: (message) => workspacePrompts.onWorkspacePromptError(message, "clone"),
  });

  const settingsViewProps = useMemo<Omit<SettingsViewProps, "initialSection" | "onClose">>(
    () => ({
      workspaceGroups,
      groupedWorkspaces,
      ungroupedLabel,
      onMoveWorkspace: settings.handleMoveWorkspace,
      onDeleteWorkspace: (workspaceId) => {
        void settings.removeWorkspace(workspaceId);
      },
      onCreateWorkspaceGroup: settings.createWorkspaceGroup,
      onRenameWorkspaceGroup: settings.renameWorkspaceGroup,
      onMoveWorkspaceGroup: settings.moveWorkspaceGroup,
      onDeleteWorkspaceGroup: settings.deleteWorkspaceGroup,
      onAssignWorkspaceGroup: settings.assignWorkspaceGroup,
      reduceTransparency: settings.reduceTransparency,
      onToggleTransparency: settings.setReduceTransparency,
      appSettings: settings.appSettings,
      openAppIconById: settings.openAppIconById,
      onUpdateAppSettings: async (next) => {
        await Promise.resolve(settings.queueSaveSettings(next));
      },
      onToggleAutomaticAppUpdateChecks:
        settings.handleToggleAutomaticAppUpdateChecks,
      onRunDoctor: settings.doctor,
      onRunCodexUpdate: settings.codexUpdate,
      onUpdateWorkspaceSettings: async (id, nextSettings) => {
        await settings.updateWorkspaceSettings(id, nextSettings);
      },
      scaleShortcutTitle: settings.scaleShortcutTitle,
      scaleShortcutText: settings.scaleShortcutText,
      onTestNotificationSound: settings.handleTestNotificationSound,
      onTestSystemNotification: settings.handleTestSystemNotification,
      onMobileConnectSuccess: settings.handleMobileConnectSuccess,
      dictationModelStatus: settings.dictationModel.status,
      onDownloadDictationModel: settings.dictationModel.download,
      onCancelDictationDownload: settings.dictationModel.cancel,
      onRemoveDictationModel: settings.dictationModel.remove,
    }),
    [
      groupedWorkspaces,
      settings,
      ungroupedLabel,
      workspaceGroups,
    ],
  );

  const appModalsProps = useMemo<AppModalsProps>(
    () => ({
      renamePrompt,
      onRenamePromptChange: handleRenamePromptChange,
      onRenamePromptCancel: handleRenamePromptCancel,
      onRenamePromptConfirm: handleRenamePromptConfirm,
      initGitRepoPrompt,
      initGitRepoPromptBusy: git.initGitRepoLoading || git.createGitHubRepoLoading,
      onInitGitRepoPromptBranchChange: handleInitGitRepoPromptBranchChange,
      onInitGitRepoPromptCreateRemoteChange: handleInitGitRepoPromptCreateRemoteChange,
      onInitGitRepoPromptRepoNameChange: handleInitGitRepoPromptRepoNameChange,
      onInitGitRepoPromptPrivateChange: handleInitGitRepoPromptPrivateChange,
      onInitGitRepoPromptCancel: handleInitGitRepoPromptCancel,
      onInitGitRepoPromptConfirm: handleInitGitRepoPromptConfirm,
      worktreePrompt,
      onWorktreePromptNameChange: updateWorktreeName,
      onWorktreePromptChange: updateWorktreeBranch,
      onWorktreePromptCopyAgentsMdChange: updateWorktreeCopyAgentsMd,
      onWorktreeSetupScriptChange: updateWorktreeSetupScript,
      onWorktreePromptCancel: cancelWorktreePrompt,
      onWorktreePromptConfirm: confirmWorktreePrompt,
      clonePrompt,
      onClonePromptCopyNameChange: updateCloneCopyName,
      onClonePromptChooseCopiesFolder: chooseCloneCopiesFolder,
      onClonePromptUseSuggestedFolder: useSuggestedCloneCopiesFolder,
      onClonePromptClearCopiesFolder: clearCloneCopiesFolder,
      onClonePromptCancel: cancelClonePrompt,
      onClonePromptConfirm: confirmClonePrompt,
      ...workspacePrompts.workspaceFromUrl,
      mobileRemoteWorkspacePathPrompt: workspacePrompts.mobileRemoteWorkspacePathPrompt,
      onMobileRemoteWorkspacePathPromptChange:
        workspacePrompts.updateMobileRemoteWorkspacePathInput,
      onMobileRemoteWorkspacePathPromptRecentPathSelect:
        workspacePrompts.appendMobileRemoteWorkspacePathFromRecent,
      onMobileRemoteWorkspacePathPromptCancel:
        workspacePrompts.cancelMobileRemoteWorkspacePathPrompt,
      onMobileRemoteWorkspacePathPromptConfirm:
        workspacePrompts.submitMobileRemoteWorkspacePathPrompt,
      branchSwitcher,
      branches,
      workspaces,
      activeWorkspace,
      currentBranch,
      onBranchSwitcherSelect: handleBranchSelect,
      onBranchSwitcherCancel: closeBranchSwitcher,
      settingsOpen,
      settingsSection: settingsSection ?? undefined,
      onCloseSettings: closeSettings,
      SettingsViewComponent: settingsViewComponent,
      settingsProps: settingsViewProps,
    }),
    [
      activeWorkspace,
      branchSwitcher,
      branches,
      cancelClonePrompt,
      cancelWorktreePrompt,
      chooseCloneCopiesFolder,
      clearCloneCopiesFolder,
      clonePrompt,
      closeBranchSwitcher,
      closeSettings,
      confirmClonePrompt,
      confirmWorktreePrompt,
      currentBranch,
      git.createGitHubRepoLoading,
      git.initGitRepoLoading,
      handleBranchSelect,
      handleInitGitRepoPromptBranchChange,
      handleInitGitRepoPromptCancel,
      handleInitGitRepoPromptConfirm,
      handleInitGitRepoPromptCreateRemoteChange,
      handleInitGitRepoPromptPrivateChange,
      handleInitGitRepoPromptRepoNameChange,
      handleRenamePromptCancel,
      handleRenamePromptChange,
      handleRenamePromptConfirm,
      initGitRepoPrompt,
      renamePrompt,
      settingsOpen,
      settingsSection,
      settingsViewComponent,
      settingsViewProps,
      updateCloneCopyName,
      workspacePrompts,
      updateWorktreeBranch,
      updateWorktreeCopyAgentsMd,
      updateWorktreeName,
      updateWorktreeSetupScript,
      useSuggestedCloneCopiesFolder,
      workspaces,
      worktreePrompt,
    ],
  );

  return {
    appModalsProps,
    modalActions: {
      openSettings,
      closeSettings,
      openRenamePrompt,
      openInitGitRepoPrompt,
      openWorktreePrompt,
      openClonePrompt,
      openWorkspaceFromUrlPrompt: workspacePrompts.openWorkspaceFromUrlPrompt,
      openBranchSwitcher,
      closeBranchSwitcher,
    },
  };
}
