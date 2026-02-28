import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceInfo } from "@/types";
import { pushErrorToast } from "@services/toasts";
import { useI18n } from "@/i18n/useI18n";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsEnvironmentsSectionProps = {
  mainWorkspaces: WorkspaceInfo[];
  environmentWorkspace: WorkspaceInfo | null;
  environmentSaving: boolean;
  environmentError: string | null;
  environmentDraftScript: string;
  environmentSavedScript: string | null;
  environmentDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
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
  onSetEnvironmentWorkspaceId,
  onSetEnvironmentDraftScript,
  onSaveEnvironmentSetup,
}: SettingsEnvironmentsSectionProps) {
  const { t } = useI18n();
  return (
    <SettingsSection
      title={t("settings.environments.sectionTitle")}
      subtitle={t("settings.environments.sectionSubtitle")}
    >
      {mainWorkspaces.length === 0 ? (
        <div className="settings-empty">{t("settings.environments.emptyNoProjects")}</div>
      ) : (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-environment-project">
              {t("settings.environments.project.label")}
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
            <div className="settings-field-label">{t("settings.environments.setupScript.label")}</div>
            <div className="settings-help">
              {t("settings.environments.setupScript.help")}
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
                      title: t("settings.environments.clipboard.copyFailedTitle"),
                      message: t("settings.environments.clipboard.unavailable"),
                    });
                    return;
                  }

                  void clipboard.writeText(environmentDraftScript).catch(() => {
                    pushErrorToast({
                      title: t("settings.environments.clipboard.copyFailedTitle"),
                      message: t("settings.environments.clipboard.writeFailed"),
                    });
                  });
                }}
                disabled={environmentSaving || environmentDraftScript.length === 0}
              >
                {t("settings.environments.actions.copy")}
              </button>
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => onSetEnvironmentDraftScript(environmentSavedScript ?? "")}
                disabled={environmentSaving || !environmentDirty}
              >
                {t("settings.environments.actions.reset")}
              </button>
              <button
                type="button"
                className="primary settings-button-compact"
                onClick={() => {
                  void onSaveEnvironmentSetup();
                }}
                disabled={environmentSaving || !environmentDirty}
              >
                {environmentSaving
                  ? t("settings.environments.actions.saving")
                  : t("settings.environments.actions.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
