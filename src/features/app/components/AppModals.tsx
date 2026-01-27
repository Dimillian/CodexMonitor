import { lazy, memo, Suspense } from "react";
import type { ComponentType } from "react";
import type { SettingsViewProps } from "../../settings/components/SettingsView";
import { useRenameThreadPrompt } from "../../threads/hooks/useRenameThreadPrompt";
import { useClonePrompt } from "../../workspaces/hooks/useClonePrompt";
import { useWorktreePrompt } from "../../workspaces/hooks/useWorktreePrompt";

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

type RenamePromptState = ReturnType<typeof useRenameThreadPrompt>["renamePrompt"];

type WorktreePromptState = ReturnType<typeof useWorktreePrompt>["worktreePrompt"];

type ClonePromptState = ReturnType<typeof useClonePrompt>["clonePrompt"];

type AppModalsProps = {
  renamePrompt: RenamePromptState;
  onRenamePromptChange: (value: string) => void;
  onRenamePromptCancel: () => void;
  onRenamePromptConfirm: () => void;
  worktreePrompt: WorktreePromptState;
  onWorktreePromptChange: (value: string) => void;
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
  worktreePrompt,
  onWorktreePromptChange,
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
  settingsOpen,
  settingsSection,
  onCloseSettings,
  SettingsViewComponent,
  settingsProps,
}: AppModalsProps) {
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
      {worktreePrompt && (
        <Suspense fallback={null}>
          <WorktreePrompt
            workspaceName={worktreePrompt.workspace.name}
            branch={worktreePrompt.branch}
            setupScript={worktreePrompt.setupScript}
            scriptError={worktreePrompt.scriptError}
            error={worktreePrompt.error}
            isBusy={worktreePrompt.isSubmitting}
            isSavingScript={worktreePrompt.isSavingScript}
            onChange={onWorktreePromptChange}
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
