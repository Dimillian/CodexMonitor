import { useEffect, useMemo, useRef } from "react";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  OpenCodeDoctorResult,
  OpenCodeUpdateResult,
  ModelOption,
} from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { FileEditorCard } from "@/features/shared/components/FileEditorCard";

type SettingsOpenCodeSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ModelOption[];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
  opencodePathDraft: string;
  opencodeArgsDraft: string;
  opencodeDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: OpenCodeDoctorResult | null;
  };
  opencodeUpdateState: {
    status: "idle" | "running" | "done";
    result: OpenCodeUpdateResult | null;
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
  onSetOpenCodePathDraft: Dispatch<SetStateAction<string>>;
  onSetOpenCodeArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseOpenCode: () => Promise<void>;
  onSaveOpenCodeSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunOpenCodeUpdate: () => Promise<void>;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
};

const DEFAULT_REASONING_EFFORT = "medium";

const normalizeEffortValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

function coerceSavedModelSlug(value: string | null, models: ModelOption[]): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const bySlug = models.find((model) => model.model === trimmed);
  if (bySlug) {
    return bySlug.model;
  }
  const byId = models.find((model) => model.id === trimmed);
  return byId ? byId.model : null;
}

const getReasoningSupport = (model: ModelOption | null): boolean => {
  if (!model) {
    return false;
  }
  return model.supportedReasoningEfforts.length > 0 || model.defaultReasoningEffort !== null;
};

const getReasoningOptions = (model: ModelOption | null): string[] => {
  if (!model) {
    return [];
  }
  const supported = model.supportedReasoningEfforts
    .map((effort) => normalizeEffortValue(effort.reasoningEffort))
    .filter((effort): effort is string => Boolean(effort));
  if (supported.length > 0) {
    return Array.from(new Set(supported));
  }
  const fallback = normalizeEffortValue(model.defaultReasoningEffort);
  return fallback ? [fallback] : [];
};

export function SettingsOpenCodeSection({
  appSettings,
  onUpdateAppSettings,
  defaultModels,
  defaultModelsLoading,
  defaultModelsError,
  defaultModelsConnectedWorkspaceCount,
  onRefreshDefaultModels,
  opencodePathDraft,
  opencodeArgsDraft,
  opencodeDirty,
  isSavingSettings,
  doctorState,
  opencodeUpdateState,
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
  onSetOpenCodePathDraft,
  onSetOpenCodeArgsDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onBrowseOpenCode,
  onSaveOpenCodeSettings,
  onRunDoctor,
  onRunOpenCodeUpdate,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
}: SettingsOpenCodeSectionProps) {
  const latestModelSlug = defaultModels[0]?.model ?? null;
  const savedModelSlug = useMemo(
    () => coerceSavedModelSlug(appSettings.lastComposerModelId, defaultModels),
    [appSettings.lastComposerModelId, defaultModels],
  );
  const selectedModelSlug = savedModelSlug ?? latestModelSlug ?? "";
  const selectedModel = useMemo(
    () => defaultModels.find((model) => model.model === selectedModelSlug) ?? null,
    [defaultModels, selectedModelSlug],
  );
  const reasoningSupported = useMemo(
    () => getReasoningSupport(selectedModel),
    [selectedModel],
  );
  const reasoningOptions = useMemo(
    () => getReasoningOptions(selectedModel),
    [selectedModel],
  );
  const savedEffort = useMemo(
    () => normalizeEffortValue(appSettings.lastComposerReasoningEffort),
    [appSettings.lastComposerReasoningEffort],
  );
  const selectedEffort = useMemo(() => {
    if (!reasoningSupported) {
      return "";
    }
    if (savedEffort && reasoningOptions.includes(savedEffort)) {
      return savedEffort;
    }
    if (reasoningOptions.includes(DEFAULT_REASONING_EFFORT)) {
      return DEFAULT_REASONING_EFFORT;
    }
    const fallback = normalizeEffortValue(selectedModel?.defaultReasoningEffort);
    if (fallback && reasoningOptions.includes(fallback)) {
      return fallback;
    }
    return reasoningOptions[0] ?? "";
  }, [reasoningOptions, reasoningSupported, savedEffort, selectedModel]);

  const didNormalizeDefaultsRef = useRef(false);
  useEffect(() => {
    if (didNormalizeDefaultsRef.current) {
      return;
    }
    if (!defaultModels.length) {
      return;
    }
    const savedRawModel = (appSettings.lastComposerModelId ?? "").trim();
    const savedRawEffort = (appSettings.lastComposerReasoningEffort ?? "").trim();
    const shouldNormalizeModel = savedRawModel.length === 0 || savedModelSlug === null;
    const shouldNormalizeEffort =
      reasoningSupported &&
      (savedRawEffort.length === 0 ||
        savedEffort === null ||
        !reasoningOptions.includes(savedEffort));
    if (!shouldNormalizeModel && !shouldNormalizeEffort) {
      didNormalizeDefaultsRef.current = true;
      return;
    }

    const next: AppSettings = {
      ...appSettings,
      lastComposerModelId: shouldNormalizeModel ? selectedModelSlug : appSettings.lastComposerModelId,
      lastComposerReasoningEffort: shouldNormalizeEffort
        ? selectedEffort
        : appSettings.lastComposerReasoningEffort,
    };
    didNormalizeDefaultsRef.current = true;
    void onUpdateAppSettings(next);
  }, [
    appSettings,
    defaultModels.length,
    onUpdateAppSettings,
    reasoningOptions,
    reasoningSupported,
    savedEffort,
    savedModelSlug,
    selectedModelSlug,
    selectedEffort,
  ]);

  return (
    <SettingsSection
      title="OpenCode"
      subtitle="Configure the OpenCode CLI used by OpenCodeMonitor and validate the install."
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="opencode-path">
          Default OpenCode path
        </label>
        <div className="settings-field-row">
          <input
            id="opencode-path"
            className="settings-input"
            value={opencodePathDraft}
            placeholder="opencode"
            onChange={(event) => onSetOpenCodePathDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void onBrowseOpenCode();
            }}
          >
            Browse
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetOpenCodePathDraft("")}
          >
            Use PATH
          </button>
        </div>
        <div className="settings-help">Leave empty to use the system PATH resolution.</div>
        <label className="settings-field-label" htmlFor="opencode-args">
          Default OpenCode args
        </label>
        <div className="settings-field-row">
          <input
            id="opencode-args"
            className="settings-input"
            value={opencodeArgsDraft}
            placeholder="--profile personal"
            onChange={(event) => onSetOpenCodeArgsDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => onSetOpenCodeArgsDraft("")}
          >
            Clear
          </button>
        </div>
        <div className="settings-help">
          Extra flags passed before <code>app-server</code>. Use quotes for values with spaces.
        </div>
        <div className="settings-help">
          These settings apply to the shared OpenCode app-server used across all connected workspaces.
        </div>
        <div className="settings-help">
          Per-thread override processing ignores unsupported flags: <code>-m</code>/
          <code>--model</code>, <code>-a</code>/<code>--ask-for-approval</code>,{" "}
          <code>-s</code>/<code>--sandbox</code>, <code>--full-auto</code>,{" "}
          <code>--dangerously-bypass-approvals-and-sandbox</code>, <code>--oss</code>,{" "}
          <code>--local-provider</code>, and <code>--no-alt-screen</code>.
        </div>
        <div className="settings-field-actions">
          {opencodeDirty && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onSaveOpenCodeSettings();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "Saving..." : "Save"}
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
            {doctorState.status === "running" ? "Running..." : "Run doctor"}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunOpenCodeUpdate();
            }}
            disabled={opencodeUpdateState.status === "running"}
            title="Update OpenCode"
          >
            <Stethoscope aria-hidden />
            {opencodeUpdateState.status === "running" ? "Updating..." : "Update"}
          </button>
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok ? "OpenCode looks good" : "OpenCode issue detected"}
            </div>
            <div className="settings-doctor-body">
              <div>Version: {doctorState.result.version ?? "unknown"}</div>
              <div>App-server: {doctorState.result.appServerOk ? "ok" : "failed"}</div>
              <div>
                Node:{" "}
                {doctorState.result.nodeOk
                  ? `ok (${doctorState.result.nodeVersion ?? "unknown"})`
                  : "missing"}
              </div>
              {doctorState.result.details && <div>{doctorState.result.details}</div>}
              {doctorState.result.nodeDetails && <div>{doctorState.result.nodeDetails}</div>}
              {doctorState.result.path && (
                <div className="settings-doctor-path">PATH: {doctorState.result.path}</div>
              )}
            </div>
          </div>
        )}

        {opencodeUpdateState.result && (
          <div
            className={`settings-doctor ${opencodeUpdateState.result.ok ? "ok" : "error"}`}
          >
            <div className="settings-doctor-title">
              {opencodeUpdateState.result.ok
                ? opencodeUpdateState.result.upgraded
                  ? "OpenCode updated"
                  : "OpenCode already up-to-date"
                : "OpenCode update failed"}
            </div>
            <div className="settings-doctor-body">
              <div>Method: {opencodeUpdateState.result.method}</div>
              {opencodeUpdateState.result.package && (
                <div>Package: {opencodeUpdateState.result.package}</div>
              )}
              <div>
                Version:{" "}
                {opencodeUpdateState.result.afterVersion ??
                  opencodeUpdateState.result.beforeVersion ??
                  "unknown"}
              </div>
              {opencodeUpdateState.result.details && <div>{opencodeUpdateState.result.details}</div>}
              {opencodeUpdateState.result.output && (
                <details>
                  <summary>output</summary>
                  <pre>{opencodeUpdateState.result.output}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-divider" />
      <div className="settings-field-label settings-field-label--section">
        Default parameters
      </div>

      <SettingsToggleRow
        title={
          <label htmlFor="default-model">
            Model
          </label>
        }
        subtitle={
          defaultModelsConnectedWorkspaceCount === 0
            ? "Add a workspace to load available models."
            : defaultModelsLoading
              ? "Loading models from the first workspace…"
              : defaultModelsError
                ? `Couldn’t load models: ${defaultModelsError}`
                : "Sourced from the first workspace and used when there is no thread-specific override."
        }
      >
        <div className="settings-field-row">
          <select
            id="default-model"
            className="settings-select"
            value={selectedModelSlug}
            disabled={!defaultModels.length || defaultModelsLoading}
            onChange={(event) =>
              void onUpdateAppSettings({
                ...appSettings,
                lastComposerModelId: event.target.value,
              })
            }
            aria-label="Model"
          >
            {defaultModels.map((model) => (
              <option key={model.model} value={model.model}>
                {model.displayName?.trim() || model.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={onRefreshDefaultModels}
            disabled={defaultModelsLoading || defaultModelsConnectedWorkspaceCount === 0}
          >
            Refresh
          </button>
        </div>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-effort">
            Reasoning effort
          </label>
        }
        subtitle={
          reasoningSupported
            ? "Available options depend on the selected model."
            : "The selected model does not expose reasoning effort options."
        }
      >
        <select
          id="default-effort"
          className="settings-select"
          value={selectedEffort}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              lastComposerReasoningEffort: event.target.value,
            })
          }
          aria-label="Reasoning effort"
          disabled={!reasoningSupported}
        >
          {!reasoningSupported && <option value="">not supported</option>}
          {reasoningOptions.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-access">
            Access mode
          </label>
        }
        subtitle="Used when there is no thread-specific override."
      >
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
          <option value="read-only">Read only</option>
          <option value="current">On-request</option>
          <option value="full-access">Full access</option>
        </select>
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="review-delivery">
          Review mode
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
          <option value="inline">Inline (same thread)</option>
          <option value="detached">Detached (new review thread)</option>
        </select>
        <div className="settings-help">
          Choose whether <code>/review</code> runs in the current thread or a detached review
          thread.
        </div>
      </div>

      <FileEditorCard
        title="Global AGENTS.md"
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder="Add global instructions for OpenCode agents…"
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            Stored at <code>~/.config/opencode/AGENTS.md</code>.
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
        title="Global config.toml"
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder="Edit the global OpenCode config.toml…"
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            Stored at <code>~/.config/opencode/config.toml</code>.
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
    </SettingsSection>
  );
}
