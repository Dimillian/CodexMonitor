import type { Dispatch, SetStateAction } from "react";
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
  worktreesFolderDraft: string;
  worktreesFolderSaved: string | null;
  worktreesFolderDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
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
  worktreesFolderDraft,
  worktreesFolderSaved,
  worktreesFolderDirty,
  onSetEnvironmentWorkspaceId,
  onSetEnvironmentDraftScript,
  onSetWorktreesFolderDraft,
  onSaveEnvironmentSetup,
}: SettingsEnvironmentsSectionProps) {
  const hasAnyChanges = environmentDirty || worktreesFolderDirty;

  return (
    <SettingsSection
      title="Environments"
      subtitle="Configure per-project setup scripts and worktree locations."
    >
      {mainWorkspaces.length === 0 ? (
        <div className="settings-empty">No projects yet.</div>
      ) : (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-environment-project">
              Project
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
            <div className="settings-field-label">Setup script</div>
            <div className="settings-help">
              Runs once in a dedicated terminal after each new worktree is created.
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
                      title: "Copy failed",
                      message:
                        "Clipboard access is unavailable in this environment. Copy the script manually instead.",
                    });
                    return;
                  }

                  void clipboard.writeText(environmentDraftScript).catch(() => {
                    pushErrorToast({
                      title: "Copy failed",
                      message:
                        "Could not write to the clipboard. Copy the script manually instead.",
                    });
                  });
                }}
                disabled={environmentSaving || environmentDraftScript.length === 0}
              >
                Copy
              </button>
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => onSetEnvironmentDraftScript(environmentSavedScript ?? "")}
                disabled={environmentSaving || !environmentDirty}
              >
                Reset
              </button>
              <button
                type="button"
                className="primary settings-button-compact"
                onClick={() => {
                  void onSaveEnvironmentSetup();
                }}
                disabled={environmentSaving || !hasAnyChanges}
              >
                {environmentSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-worktrees-folder">
              Worktrees folder
            </label>
            <div className="settings-help">
              Custom location for worktrees. Leave empty to use the default location.
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
                      title: "Select worktrees folder",
                    });
                    if (selected && typeof selected === "string") {
                      onSetWorktreesFolderDraft(selected);
                    }
                  } catch (error) {
                    pushErrorToast({
                      title: "Failed to open folder picker",
                      message: error instanceof Error ? error.message : String(error),
                    });
                  }
                }}
                disabled={environmentSaving}
              >
                Browse
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
