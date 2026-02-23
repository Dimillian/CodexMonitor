import { lazy, memo, Suspense } from "react";
import type { ComponentType } from "react";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import type { SettingsViewProps } from "../../settings/components/SettingsView";
import { useRenameThreadPrompt } from "../../threads/hooks/useRenameThreadPrompt";
import { useClonePrompt } from "../../workspaces/hooks/useClonePrompt";
import { useWorktreePrompt } from "../../workspaces/hooks/useWorktreePrompt";
import { useWorkspaceFromUrlPrompt } from "../../workspaces/hooks/useWorkspaceFromUrlPrompt";
import { WorkspacePathsPrompt } from "../../workspaces/components/WorkspacePathsPrompt";
import type { WorkspacePathsPromptState } from "../hooks/useWorkspaceDialogs";
import type { BranchSwitcherState } from "../../git/hooks/useBranchSwitcher";
import { useGitBranches } from "../../git/hooks/useGitBranches";
import { useRemoteDirectoryPicker } from "../hooks/useRemoteDirectoryPicker";

const RenameThreadPrompt = lazy(() =>
  import("../../threads/components/RenameThreadPrompt").then((module) => ({
    default: module.RenameThreadPrompt,
  })),
);
const WorktreePrompt = lazy(() =>
  import("../../workspaces/components/WorktreePrompt").then((module) => ({
    default: module.WorktreePrompt,
  })),
);
const ClonePrompt = lazy(() =>
  import("../../workspaces/components/ClonePrompt").then((module) => ({
    default: module.ClonePrompt,
  })),
);
const WorkspaceFromUrlPrompt = lazy(() =>
  import("../../workspaces/components/WorkspaceFromUrlPrompt").then((module) => ({
    default: module.WorkspaceFromUrlPrompt,
  })),
);
const RemoteDirectoryPickerPrompt = lazy(() =>
  import("../../workspaces/components/RemoteDirectoryPickerPrompt").then((module) => ({
    default: module.RemoteDirectoryPickerPrompt,
  })),
);
const BranchSwitcherPrompt = lazy(() =>
  import("../../git/components/BranchSwitcherPrompt").then((module) => ({
    default: module.BranchSwitcherPrompt,
  })),
);
const InitGitRepoPrompt = lazy(() =>
  import("../../git/components/InitGitRepoPrompt").then((module) => ({
    default: module.InitGitRepoPrompt,
  })),
);

type RenamePromptState = ReturnType<typeof useRenameThreadPrompt>["renamePrompt"];

type WorktreePromptState = ReturnType<typeof useWorktreePrompt>["worktreePrompt"];

type ClonePromptState = ReturnType<typeof useClonePrompt>["clonePrompt"];
type WorkspaceFromUrlPromptState = ReturnType<
  typeof useWorkspaceFromUrlPrompt
>["workspaceFromUrlPrompt"];
type RemoteDirectoryPickerState = ReturnType<
  typeof useRemoteDirectoryPicker
>["remoteDirectoryPicker"];

type AppModalsProps = {
  renamePrompt: RenamePromptState;
  onRenamePromptChange: (value: string) => void;
  onRenamePromptCancel: () => void;
  onRenamePromptConfirm: () => void;
  initGitRepoPrompt: {
    workspaceName: string;
    branch: string;
    createRemote: boolean;
    repoName: string;
    isPrivate: boolean;
    error: string | null;
  } | null;
  initGitRepoPromptBusy: boolean;
  onInitGitRepoPromptBranchChange: (value: string) => void;
  onInitGitRepoPromptCreateRemoteChange: (value: boolean) => void;
  onInitGitRepoPromptRepoNameChange: (value: string) => void;
  onInitGitRepoPromptPrivateChange: (value: boolean) => void;
  onInitGitRepoPromptCancel: () => void;
  onInitGitRepoPromptConfirm: () => void;
  worktreePrompt: WorktreePromptState;
  onWorktreePromptNameChange: (value: string) => void;
  onWorktreePromptChange: (value: string) => void;
  onWorktreePromptCopyAgentsMdChange: (value: boolean) => void;
  onWorktreeSetupScriptChange: (value: string) => void;
  onWorktreePromptCancel: () => void;
  onWorktreePromptConfirm: () => void;
  clonePrompt: ClonePromptState;
  onClonePromptCopyNameChange: (value: string) => void;
  onClonePromptChooseCopiesFolder: () => void;
  onClonePromptUseSuggestedFolder: () => void;
  onClonePromptClearCopiesFolder: () => void;
  onClonePromptCancel: () => void;
  onClonePromptConfirm: () => void;
  workspacePathsPrompt: WorkspacePathsPromptState;
  onWorkspacePathsPromptChange: (value: string) => void;
  onWorkspacePathsPromptBrowseDirectory: (path: string) => void;
  onWorkspacePathsPromptBrowseParentDirectory: () => void;
  onWorkspacePathsPromptBrowseHomeDirectory: () => void;
  onWorkspacePathsPromptRetryDirectoryListing: () => void;
  onWorkspacePathsPromptToggleHiddenDirectories: () => void;
  onWorkspacePathsPromptUseCurrentDirectory: () => void;
  onWorkspacePathsPromptCancel: () => void;
  onWorkspacePathsPromptConfirm: () => void;
  remoteDirectoryPicker: RemoteDirectoryPickerState;
  onRemoteDirectoryPickerBrowseDirectory: (path: string) => void;
  onRemoteDirectoryPickerBrowseParentDirectory: () => void;
  onRemoteDirectoryPickerBrowseHomeDirectory: () => void;
  onRemoteDirectoryPickerRetryDirectoryListing: () => void;
  onRemoteDirectoryPickerToggleHiddenDirectories: () => void;
  onRemoteDirectoryPickerCancel: () => void;
  onRemoteDirectoryPickerConfirm: () => void;
  workspaceFromUrlPrompt: WorkspaceFromUrlPromptState;
  workspaceFromUrlCanSubmit: boolean;
  onWorkspaceFromUrlPromptUrlChange: (value: string) => void;
  onWorkspaceFromUrlPromptTargetFolderNameChange: (value: string) => void;
  onWorkspaceFromUrlPromptChooseDestinationPath: () => void;
  onWorkspaceFromUrlPromptClearDestinationPath: () => void;
  onWorkspaceFromUrlPromptCancel: () => void;
  onWorkspaceFromUrlPromptConfirm: () => void;
  branchSwitcher: BranchSwitcherState;
  branches: BranchInfo[];
  workspaces: WorkspaceInfo[];
  activeWorkspace: WorkspaceInfo | null;
  currentBranch: string | null;
  onBranchSwitcherSelect: (branch: string, worktree: WorkspaceInfo | null) => void;
  onBranchSwitcherCancel: () => void;
  settingsOpen: boolean;
  settingsSection: SettingsViewProps["initialSection"] | null;
  onCloseSettings: () => void;
  SettingsViewComponent: ComponentType<SettingsViewProps>;
  settingsProps: Omit<SettingsViewProps, "initialSection" | "onClose">;
};

export const AppModals = memo(function AppModals({
  renamePrompt,
  onRenamePromptChange,
  onRenamePromptCancel,
  onRenamePromptConfirm,
  initGitRepoPrompt,
  initGitRepoPromptBusy,
  onInitGitRepoPromptBranchChange,
  onInitGitRepoPromptCreateRemoteChange,
  onInitGitRepoPromptRepoNameChange,
  onInitGitRepoPromptPrivateChange,
  onInitGitRepoPromptCancel,
  onInitGitRepoPromptConfirm,
  worktreePrompt,
  onWorktreePromptNameChange,
  onWorktreePromptChange,
  onWorktreePromptCopyAgentsMdChange,
  onWorktreeSetupScriptChange,
  onWorktreePromptCancel,
  onWorktreePromptConfirm,
  clonePrompt,
  onClonePromptCopyNameChange,
  onClonePromptChooseCopiesFolder,
  onClonePromptUseSuggestedFolder,
  onClonePromptClearCopiesFolder,
  onClonePromptCancel,
  onClonePromptConfirm,
  workspacePathsPrompt,
  onWorkspacePathsPromptChange,
  onWorkspacePathsPromptBrowseDirectory,
  onWorkspacePathsPromptBrowseParentDirectory,
  onWorkspacePathsPromptBrowseHomeDirectory,
  onWorkspacePathsPromptRetryDirectoryListing,
  onWorkspacePathsPromptToggleHiddenDirectories,
  onWorkspacePathsPromptUseCurrentDirectory,
  onWorkspacePathsPromptCancel,
  onWorkspacePathsPromptConfirm,
  remoteDirectoryPicker,
  onRemoteDirectoryPickerBrowseDirectory,
  onRemoteDirectoryPickerBrowseParentDirectory,
  onRemoteDirectoryPickerBrowseHomeDirectory,
  onRemoteDirectoryPickerRetryDirectoryListing,
  onRemoteDirectoryPickerToggleHiddenDirectories,
  onRemoteDirectoryPickerCancel,
  onRemoteDirectoryPickerConfirm,
  workspaceFromUrlPrompt,
  workspaceFromUrlCanSubmit,
  onWorkspaceFromUrlPromptUrlChange,
  onWorkspaceFromUrlPromptTargetFolderNameChange,
  onWorkspaceFromUrlPromptChooseDestinationPath,
  onWorkspaceFromUrlPromptClearDestinationPath,
  onWorkspaceFromUrlPromptCancel,
  onWorkspaceFromUrlPromptConfirm,
  branchSwitcher,
  branches,
  workspaces,
  activeWorkspace,
  currentBranch,
  onBranchSwitcherSelect,
  onBranchSwitcherCancel,
  settingsOpen,
  settingsSection,
  onCloseSettings,
  SettingsViewComponent,
  settingsProps,
}: AppModalsProps) {
  const { branches: worktreeBranches } = useGitBranches({
    activeWorkspace: worktreePrompt?.workspace ?? null,
  });

  return (
    <>
      {renamePrompt && (
        <Suspense fallback={null}>
          <RenameThreadPrompt
            currentName={renamePrompt.originalName}
            name={renamePrompt.name}
            onChange={onRenamePromptChange}
            onCancel={onRenamePromptCancel}
            onConfirm={onRenamePromptConfirm}
          />
        </Suspense>
      )}
      {initGitRepoPrompt && (
        <Suspense fallback={null}>
          <InitGitRepoPrompt
            workspaceName={initGitRepoPrompt.workspaceName}
            branch={initGitRepoPrompt.branch}
            createRemote={initGitRepoPrompt.createRemote}
            repoName={initGitRepoPrompt.repoName}
            isPrivate={initGitRepoPrompt.isPrivate}
            error={initGitRepoPrompt.error}
            isBusy={initGitRepoPromptBusy}
            onBranchChange={onInitGitRepoPromptBranchChange}
            onCreateRemoteChange={onInitGitRepoPromptCreateRemoteChange}
            onRepoNameChange={onInitGitRepoPromptRepoNameChange}
            onPrivateChange={onInitGitRepoPromptPrivateChange}
            onCancel={onInitGitRepoPromptCancel}
            onConfirm={onInitGitRepoPromptConfirm}
          />
        </Suspense>
      )}
      {worktreePrompt && (
        <Suspense fallback={null}>
          <WorktreePrompt
            workspaceName={worktreePrompt.workspace.name}
            name={worktreePrompt.name}
            branch={worktreePrompt.branch}
            branchWasEdited={worktreePrompt.branchWasEdited}
            branchSuggestions={worktreeBranches}
            copyAgentsMd={worktreePrompt.copyAgentsMd}
            setupScript={worktreePrompt.setupScript}
            scriptError={worktreePrompt.scriptError}
            error={worktreePrompt.error}
            isBusy={worktreePrompt.isSubmitting}
            isSavingScript={worktreePrompt.isSavingScript}
            onNameChange={onWorktreePromptNameChange}
            onChange={onWorktreePromptChange}
            onCopyAgentsMdChange={onWorktreePromptCopyAgentsMdChange}
            onSetupScriptChange={onWorktreeSetupScriptChange}
            onCancel={onWorktreePromptCancel}
            onConfirm={onWorktreePromptConfirm}
          />
        </Suspense>
      )}
      {clonePrompt && (
        <Suspense fallback={null}>
          <ClonePrompt
            workspaceName={clonePrompt.workspace.name}
            copyName={clonePrompt.copyName}
            copiesFolder={clonePrompt.copiesFolder}
            suggestedCopiesFolder={clonePrompt.suggestedCopiesFolder}
            error={clonePrompt.error}
            isBusy={clonePrompt.isSubmitting}
            onCopyNameChange={onClonePromptCopyNameChange}
            onChooseCopiesFolder={onClonePromptChooseCopiesFolder}
            onUseSuggestedCopiesFolder={onClonePromptUseSuggestedFolder}
            onClearCopiesFolder={onClonePromptClearCopiesFolder}
            onCancel={onClonePromptCancel}
            onConfirm={onClonePromptConfirm}
          />
        </Suspense>
      )}
      {workspacePathsPrompt && (
        <WorkspacePathsPrompt
          value={workspacePathsPrompt.value}
          error={workspacePathsPrompt.error}
          browser={workspacePathsPrompt.browser}
          onChange={onWorkspacePathsPromptChange}
          onBrowseDirectory={onWorkspacePathsPromptBrowseDirectory}
          onBrowseParentDirectory={onWorkspacePathsPromptBrowseParentDirectory}
          onBrowseHomeDirectory={onWorkspacePathsPromptBrowseHomeDirectory}
          onRetryDirectoryListing={onWorkspacePathsPromptRetryDirectoryListing}
          onToggleHiddenDirectories={onWorkspacePathsPromptToggleHiddenDirectories}
          onUseCurrentDirectory={onWorkspacePathsPromptUseCurrentDirectory}
          onCancel={onWorkspacePathsPromptCancel}
          onConfirm={onWorkspacePathsPromptConfirm}
        />
      )}
      {workspaceFromUrlPrompt && (
        <Suspense fallback={null}>
          <WorkspaceFromUrlPrompt
            url={workspaceFromUrlPrompt.url}
            destinationPath={workspaceFromUrlPrompt.destinationPath}
            targetFolderName={workspaceFromUrlPrompt.targetFolderName}
            error={workspaceFromUrlPrompt.error}
            isBusy={workspaceFromUrlPrompt.isSubmitting}
            canSubmit={workspaceFromUrlCanSubmit}
            onUrlChange={onWorkspaceFromUrlPromptUrlChange}
            onTargetFolderNameChange={onWorkspaceFromUrlPromptTargetFolderNameChange}
            onChooseDestinationPath={onWorkspaceFromUrlPromptChooseDestinationPath}
            onClearDestinationPath={onWorkspaceFromUrlPromptClearDestinationPath}
            onCancel={onWorkspaceFromUrlPromptCancel}
            onConfirm={onWorkspaceFromUrlPromptConfirm}
          />
        </Suspense>
      )}
      {remoteDirectoryPicker && (
        <Suspense fallback={null}>
          <RemoteDirectoryPickerPrompt
            title={remoteDirectoryPicker.title}
            confirmLabel={remoteDirectoryPicker.confirmLabel}
            currentPath={remoteDirectoryPicker.currentPath}
            parentPath={remoteDirectoryPicker.parentPath}
            entries={remoteDirectoryPicker.entries}
            includeHidden={remoteDirectoryPicker.includeHidden}
            isLoading={remoteDirectoryPicker.isLoading}
            loadError={remoteDirectoryPicker.loadError}
            truncated={remoteDirectoryPicker.truncated}
            entryCount={remoteDirectoryPicker.entryCount}
            onBrowseDirectory={onRemoteDirectoryPickerBrowseDirectory}
            onBrowseParentDirectory={onRemoteDirectoryPickerBrowseParentDirectory}
            onBrowseHomeDirectory={onRemoteDirectoryPickerBrowseHomeDirectory}
            onRetryDirectoryListing={onRemoteDirectoryPickerRetryDirectoryListing}
            onToggleHiddenDirectories={onRemoteDirectoryPickerToggleHiddenDirectories}
            onCancel={onRemoteDirectoryPickerCancel}
            onConfirm={onRemoteDirectoryPickerConfirm}
          />
        </Suspense>
      )}
      {branchSwitcher && (
        <Suspense fallback={null}>
          <BranchSwitcherPrompt
            branches={branches}
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            currentBranch={currentBranch}
            onSelect={onBranchSwitcherSelect}
            onCancel={onBranchSwitcherCancel}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsViewComponent
            {...settingsProps}
            onClose={onCloseSettings}
            initialSection={settingsSection ?? undefined}
          />
        </Suspense>
      )}
    </>
  );
});
