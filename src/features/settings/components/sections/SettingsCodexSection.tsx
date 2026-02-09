import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  WorkspaceInfo,
} from "../../../../types";
import { FileEditorCard } from "../../../shared/components/FileEditorCard";

type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  codexPathDraft: string;
  codexArgsDraft: string;
  codexDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  };
  codexUpdateState: {
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  };
  globalAgentsMeta: string;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  globalConfigMeta: string;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  projects: WorkspaceInfo[];
  codexBinOverrideDrafts: Record<string, string>;
  codexHomeOverrideDrafts: Record<string, string>;
  codexArgsOverrideDrafts: Record<string, string>;
  onSetCodexPathDraft: Dispatch<SetStateAction<string>>;
  onSetCodexArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onSetCodexBinOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onSetCodexHomeOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onSetCodexArgsOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunCodexUpdate: () => Promise<void>;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceInfo["settings"]>,
  ) => Promise<void>;
};

const normalizeOverrideValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export function SettingsCodexSection({
  appSettings,
  onUpdateAppSettings,
  codexPathDraft,
  codexArgsDraft,
  codexDirty,
  isSavingSettings,
  doctorState,
  codexUpdateState,
  globalAgentsMeta,
  globalAgentsError,
  globalAgentsContent,
  globalAgentsLoading,
  globalAgentsRefreshDisabled,
  globalAgentsSaveDisabled,
  globalAgentsSaveLabel,
  globalConfigMeta,
  globalConfigError,
  globalConfigContent,
  globalConfigLoading,
  globalConfigRefreshDisabled,
  globalConfigSaveDisabled,
  globalConfigSaveLabel,
  projects,
  codexBinOverrideDrafts,
  codexHomeOverrideDrafts,
  codexArgsOverrideDrafts,
  onSetCodexPathDraft,
  onSetCodexArgsDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onSetCodexBinOverrideDrafts,
  onSetCodexHomeOverrideDrafts,
  onSetCodexArgsOverrideDrafts,
  onBrowseCodex,
  onSaveCodexSettings,
  onRunDoctor,
  onRunCodexUpdate,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
  onUpdateWorkspaceCodexBin,
  onUpdateWorkspaceSettings,
}: SettingsCodexSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="settings-section">
      <div className="settings-section-title">{t('settings.sections.codex')}</div>
      <div className="settings-section-subtitle">
        {t('settings.features.codex_config')}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          {t('settings.features.default_codex_path')}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-path"
            className="settings-input"
            value={codexPathDraft}
            placeholder="codex"
            onChange={(event) => onSetCodexPathDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void onBrowseCodex();
            }}
          >
            {t('settings.features.browse')}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexPathDraft("")}
          >
            {t('settings.features.use_path')}
          </button>
        </div>
        <div className="settings-help">{t('settings.features.default_codex_path_description')}</div>
        <label className="settings-field-label" htmlFor="codex-args">
          {t('settings.features.default_codex_args')}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-args"
            className="settings-input"
            value={codexArgsDraft}
            placeholder="--profile personal"
            onChange={(event) => onSetCodexArgsDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexArgsDraft("")}
          >
            {t('settings.features.clear')}
          </button>
        </div>
        <div className="settings-help">
          {t('settings.features.default_codex_args_description')}
        </div>
        <div className="settings-field-actions">
          {codexDirty && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onSaveCodexSettings();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? t('common.saving') : t('settings.features.save')}
            </button>
          )}
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunDoctor();
            }}
            disabled={doctorState.status === "running"}
          >
            <Stethoscope aria-hidden />
            {doctorState.status === "running" ? t('common.loading') : t('settings.features.run_diagnosis')}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunCodexUpdate();
            }}
            disabled={codexUpdateState.status === "running"}
            title={t('common.update')}
          >
            <Stethoscope aria-hidden />
            {codexUpdateState.status === "running" ? t('common.loading') : t('common.update')}
          </button>
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok ? t('settings.features.codex_ok') : t('settings.features.codex_issue')}
            </div>
            <div className="settings-doctor-body">
              <div>{t('settings.features.version')} {doctorState.result.version ?? t('settings.features.unknown')}</div>
              <div>{t('settings.features.app_server')} {doctorState.result.appServerOk ? t('settings.features.ok') : t('settings.features.failed')}</div>
              <div>
                {t('settings.features.node_js')}{" "}
                {doctorState.result.nodeOk
                  ? `${t('settings.features.ok')} (${doctorState.result.nodeVersion ?? t('settings.features.unknown')})`
                  : t('settings.features.missing')}
              </div>
              {doctorState.result.details && <div>{doctorState.result.details}</div>}
              {doctorState.result.nodeDetails && <div>{doctorState.result.nodeDetails}</div>}
              {doctorState.result.path && (
                <div className="settings-doctor-path">PATH: {doctorState.result.path}</div>
              )}
            </div>
          </div>
        )}

        {codexUpdateState.result && (
          <div
            className={`settings-doctor ${codexUpdateState.result.ok ? "ok" : "error"}`}
          >
            <div className="settings-doctor-title">
              {codexUpdateState.result.ok
                ? codexUpdateState.result.upgraded
                  ? t('common.update')
                  : t('git_diff.no_changes_to_commit')
                : t('errors.api_error')}
            </div>
            <div className="settings-doctor-body">
              <div>Method: {codexUpdateState.result.method}</div>
              {codexUpdateState.result.package && (
                <div>Package: {codexUpdateState.result.package}</div>
              )}
              <div>
                {t('settings.features.version')}{" "}
                {codexUpdateState.result.afterVersion ??
                  codexUpdateState.result.beforeVersion ??
                  t('settings.features.unknown')}
              </div>
              {codexUpdateState.result.details && <div>{codexUpdateState.result.details}</div>}
              {codexUpdateState.result.output && (
                <details>
                  <summary>output</summary>
                  <pre>{codexUpdateState.result.output}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="default-access">
          {t('settings.features.default_access_mode')}
        </label>
        <select
          id="default-access"
          className="settings-select"
          value={appSettings.defaultAccessMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              defaultAccessMode: event.target.value as AppSettings["defaultAccessMode"],
            })
          }
        >
          <option value="read-only">{t('settings.features.read_only')}</option>
          <option value="current">{t('settings.features.on_demand')}</option>
          <option value="full-access">{t('settings.features.full_access')}</option>
        </select>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="review-delivery">
          {t('settings.features.review_mode')}
        </label>
        <select
          id="review-delivery"
          className="settings-select"
          value={appSettings.reviewDeliveryMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              reviewDeliveryMode: event.target.value as AppSettings["reviewDeliveryMode"],
            })
          }
        >
          <option value="inline">{t('settings.features.inline')}</option>
          <option value="detached">{t('settings.features.detached')}</option>
        </select>
        <div className="settings-help">
          {t('settings.features.review_mode_description')}
        </div>
      </div>

      <FileEditorCard
        title={t('settings.features.global_agents_md')}
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder={t('settings.features.global_agents_md_placeholder')}
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            {t('settings.features.global_agents_md_description')}
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <FileEditorCard
        title={t('settings.features.global_config_toml')}
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder={t('settings.features.global_config_toml_placeholder')}
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            {t('settings.features.global_config_toml_description')}
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <div className="settings-field">
        <div className="settings-field-label">{t('settings.features.workspace_overrides')}</div>
        <div className="settings-overrides">
          {projects.map((workspace) => (
            <div key={workspace.id} className="settings-override-row">
              <div className="settings-override-info">
                <div className="settings-project-name">{workspace.name}</div>
                <div className="settings-project-path">{workspace.path}</div>
              </div>
              <div className="settings-override-actions">
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexBinOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t('settings.features.codex_executable_override')}
                    onChange={(event) =>
                      onSetCodexBinOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexBinOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.codex_bin ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceCodexBin(workspace.id, nextValue);
                    }}
                    aria-label={`${t('settings.features.codex_executable_override')} for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      onSetCodexBinOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceCodexBin(workspace.id, null);
                    }}
                  >
                    {t('settings.features.clear')}
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexHomeOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t('settings.features.codex_home_override')}
                    onChange={(event) =>
                      onSetCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexHomeOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.settings.codexHome ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexHome: nextValue,
                      });
                    }}
                    aria-label={`${t('settings.features.codex_home_override')} for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      onSetCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexHome: null,
                      });
                    }}
                  >
                    {t('settings.features.clear')}
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexArgsOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t('settings.features.codex_args_override')}
                    onChange={(event) =>
                      onSetCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexArgsOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.settings.codexArgs ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexArgs: nextValue,
                      });
                    }}
                    aria-label={`${t('settings.features.codex_args_override')} for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      onSetCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexArgs: null,
                      });
                    }}
                  >
                    {t('settings.features.clear')}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="settings-empty">{t('sidebar.no_workspaces')}</div>}
        </div>
      </div>
    </section>
  );
}
