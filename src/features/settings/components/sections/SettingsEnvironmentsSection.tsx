import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "@/i18n";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import type { WorkspaceInfo } from "@/types";
import { pushErrorToast } from "@services/toasts";

type SettingsEnvironmentsSectionProps = {
  mainWorkspaces: WorkspaceInfo[];
  environmentWorkspace: WorkspaceInfo | null;
  environmentSaving: boolean;
  environmentError: string | null;
  environmentDraftScript: string;
  environmentSavedScript: string | null;
  environmentDirty: boolean;
  globalWorktreesFolderDraft: string;
  globalWorktreesFolderSaved: string | null;
  globalWorktreesFolderDirty: boolean;
  worktreesFolderDraft: string;
  worktreesFolderSaved: string | null;
  worktreesFolderDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
  onSetGlobalWorktreesFolderDraft: Dispatch<SetStateAction<string>>;
  onSetWorktreesFolderDraft: Dispatch<SetStateAction<string>>;
  onSaveEnvironmentSetup: () => Promise<void>;
};

export function SettingsEnvironmentsSection({
  mainWorkspaces,
  environmentWorkspace,
  environmentSaving,
  environmentError,
  environmentDraftScript,
  environmentSavedScript,
  environmentDirty,
  globalWorktreesFolderDraft,
  globalWorktreesFolderSaved: _globalWorktreesFolderSaved,
  globalWorktreesFolderDirty,
  worktreesFolderDraft,
  worktreesFolderSaved: _worktreesFolderSaved,
  worktreesFolderDirty,
  onSetEnvironmentWorkspaceId,
  onSetEnvironmentDraftScript,
  onSetGlobalWorktreesFolderDraft,
  onSetWorktreesFolderDraft,
  onSaveEnvironmentSetup,
}: SettingsEnvironmentsSectionProps) {
  const { tx } = useI18n();
  const hasAnyChanges =
    environmentDirty || globalWorktreesFolderDirty || worktreesFolderDirty;
  const hasProjects = mainWorkspaces.length > 0;

  return (
    <SettingsSection
      title={tx("Environments")}
      subtitle={tx("Configure per-project setup scripts and worktree locations.")}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="settings-global-worktrees-folder">
          {tx("Global worktrees root")}
        </label>
        <div className="settings-help">
          {tx("Default location for new worktrees when a project does not override it. Each project gets its own subfolder under this root.")}
        </div>
        <div className="settings-field-row">
          <input
            id="settings-global-worktrees-folder"
            type="text"
            className="settings-input"
            value={globalWorktreesFolderDraft}
            onChange={(event) => onSetGlobalWorktreesFolderDraft(event.target.value)}
            placeholder="/path/to/worktrees-root"
            disabled={environmentSaving}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={async () => {
              try {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({
                  directory: true,
                  multiple: false,
                  title: tx("Select global worktrees root"),
                });
                if (selected && typeof selected === "string") {
                  onSetGlobalWorktreesFolderDraft(selected);
                }
              } catch (error) {
                pushErrorToast({
                  title: tx("Failed to open folder picker"),
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            }}
            disabled={environmentSaving}
          >
            {tx("Browse")}
          </button>
        </div>
        {!hasProjects ? (
          <div className="settings-field-actions">
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => onSetGlobalWorktreesFolderDraft(_globalWorktreesFolderSaved ?? "")}
              disabled={environmentSaving || !globalWorktreesFolderDirty}
            >
              {tx("Reset")}
            </button>
            <button
              type="button"
              className="primary settings-button-compact"
              onClick={() => {
                void onSaveEnvironmentSetup();
              }}
              disabled={environmentSaving || !globalWorktreesFolderDirty}
            >
              {environmentSaving ? tx("Saving...") : tx("Save")}
            </button>
          </div>
        ) : null}
        {!hasProjects && environmentError ? (
          <div className="settings-agents-error">{environmentError}</div>
        ) : null}
      </div>

      {!hasProjects ? (
        <div className="settings-empty">{tx("No projects yet.")}</div>
      ) : (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-environment-project">
              {tx("Project")}
            </label>
            <select
              id="settings-environment-project"
              className="settings-select"
              value={environmentWorkspace?.id ?? ""}
              onChange={(event) => onSetEnvironmentWorkspaceId(event.target.value)}
              disabled={environmentSaving}
            >
              {mainWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            {environmentWorkspace ? (
              <div className="settings-help">{environmentWorkspace.path}</div>
            ) : null}
          </div>

          <div className="settings-field">
            <div className="settings-field-label">{tx("Setup script")}</div>
            <div className="settings-help">
              {tx("Runs once in a dedicated terminal after each new worktree is created.")}
            </div>
            {environmentError ? (
              <div className="settings-agents-error">{environmentError}</div>
            ) : null}
            <textarea
              className="settings-agents-textarea"
              value={environmentDraftScript}
              onChange={(event) => onSetEnvironmentDraftScript(event.target.value)}
              placeholder="pnpm install"
              spellCheck={false}
              disabled={environmentSaving}
            />
            <div className="settings-field-actions">
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => {
                  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
                  if (!clipboard?.writeText) {
                    pushErrorToast({
                      title: tx("Copy failed"),
                      message: tx("Clipboard access is unavailable in this environment. Copy the script manually instead."),
                    });
                    return;
                  }

                  void clipboard.writeText(environmentDraftScript).catch(() => {
                    pushErrorToast({
                      title: tx("Copy failed"),
                      message: tx("Could not write to the clipboard. Copy the script manually instead."),
                    });
                  });
                }}
                disabled={environmentSaving || environmentDraftScript.length === 0}
              >
                {tx("Copy")}
              </button>
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => onSetEnvironmentDraftScript(environmentSavedScript ?? "")}
                disabled={environmentSaving || !environmentDirty}
              >
                {tx("Reset")}
              </button>
              <button
                type="button"
                className="primary settings-button-compact"
                onClick={() => {
                  void onSaveEnvironmentSetup();
                }}
                disabled={environmentSaving || !hasAnyChanges}
              >
                {environmentSaving ? tx("Saving...") : tx("Save")}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-worktrees-folder">
              {tx("Worktrees folder")}
            </label>
            <div className="settings-help">
              {tx("Custom location for this project's worktrees. Leave empty to use the global root or the built-in default.")}
            </div>
            <div className="settings-field-row">
              <input
                id="settings-worktrees-folder"
                type="text"
                className="settings-input"
                value={worktreesFolderDraft}
                onChange={(event) => onSetWorktreesFolderDraft(event.target.value)}
                placeholder="/path/to/worktrees"
                disabled={environmentSaving}
              />
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={async () => {
                  try {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: tx("Select worktrees folder"),
                    });
                    if (selected && typeof selected === "string") {
                      onSetWorktreesFolderDraft(selected);
                    }
                  } catch (error) {
                    pushErrorToast({
                      title: tx("Failed to open folder picker"),
                      message: error instanceof Error ? error.message : String(error),
                    });
                  }
                }}
                disabled={environmentSaving}
              >
                {tx("Browse")}
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
