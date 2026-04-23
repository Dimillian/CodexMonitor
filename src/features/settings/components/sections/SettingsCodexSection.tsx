import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/i18n";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  ModelOption,
} from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { FileEditorCard } from "@/features/shared/components/FileEditorCard";

type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ModelOption[];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
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
  onSetCodexPathDraft: Dispatch<SetStateAction<string>>;
  onSetCodexArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunCodexUpdate: () => Promise<void>;
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

export function SettingsCodexSection({
  appSettings,
  onUpdateAppSettings,
  defaultModels,
  defaultModelsLoading,
  defaultModelsError,
  defaultModelsConnectedWorkspaceCount,
  onRefreshDefaultModels,
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
  onSetCodexPathDraft,
  onSetCodexArgsDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onBrowseCodex,
  onSaveCodexSettings,
  onRunDoctor,
  onRunCodexUpdate,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
}: SettingsCodexSectionProps) {
  const { tx } = useI18n();
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
      title={tx("Codex")}
      subtitle={tx("Configure the Codex CLI used by CodexMonitor and validate the install.")}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          {tx("Default Codex path")}
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
            {tx("Browse")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexPathDraft("")}
          >
            {tx("Use PATH")}
          </button>
        </div>
        <div className="settings-help">{tx("Leave empty to use the system PATH resolution.")}</div>
        <label className="settings-field-label" htmlFor="codex-args">
          {tx("Default Codex args")}
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
            {tx("Clear")}
          </button>
        </div>
        <div className="settings-help">
          {tx("Extra flags passed before")} <code>app-server</code>.{" "}
          {tx("Use quotes for values with spaces.")}
        </div>
        <div className="settings-help">
          {tx("These settings apply to the shared Codex app-server used across all connected workspaces.")}
        </div>
        <div className="settings-help">
          {tx("Per-thread override processing ignores unsupported flags:")} <code>-m</code>/
          <code>--model</code>, <code>-a</code>/<code>--ask-for-approval</code>,{" "}
          <code>-s</code>/<code>--sandbox</code>, <code>--full-auto</code>,{" "}
          <code>--dangerously-bypass-approvals-and-sandbox</code>, <code>--oss</code>,{" "}
          <code>--local-provider</code>, and <code>--no-alt-screen</code>.
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
              {isSavingSettings ? tx("Saving...") : tx("Save")}
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
            {doctorState.status === "running" ? tx("Running...") : tx("Run doctor")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunCodexUpdate();
            }}
            disabled={codexUpdateState.status === "running"}
            title={tx("Update Codex")}
          >
            <Stethoscope aria-hidden />
            {codexUpdateState.status === "running" ? tx("Updating...") : tx("Update")}
          </button>
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok ? tx("Codex looks good") : tx("Codex issue detected")}
            </div>
            <div className="settings-doctor-body">
              <div>{tx("Version:")} {doctorState.result.version ?? tx("unknown")}</div>
              <div>{tx("App-server:")} {doctorState.result.appServerOk ? tx("ok") : tx("failed")}</div>
              <div>
                {tx("Node:")}{" "}
                {doctorState.result.nodeOk
                  ? tx("ok ({version})", { version: doctorState.result.nodeVersion ?? tx("unknown") })
                  : tx("missing")}
              </div>
              {doctorState.result.details && <div>{doctorState.result.details}</div>}
              {doctorState.result.nodeDetails && <div>{doctorState.result.nodeDetails}</div>}
              {doctorState.result.path && (
                <div className="settings-doctor-path">{tx("PATH:")} {doctorState.result.path}</div>
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
                  ? tx("Codex updated")
                  : tx("Codex already up-to-date")
                : tx("Codex update failed")}
            </div>
            <div className="settings-doctor-body">
              <div>{tx("Method:")} {codexUpdateState.result.method}</div>
              {codexUpdateState.result.package && (
                <div>{tx("Package:")} {codexUpdateState.result.package}</div>
              )}
              <div>
                {tx("Version:")}{" "}
                {codexUpdateState.result.afterVersion ??
                  codexUpdateState.result.beforeVersion ??
                  tx("unknown")}
              </div>
              {codexUpdateState.result.details && <div>{codexUpdateState.result.details}</div>}
              {codexUpdateState.result.output && (
                <details>
                  <summary>{tx("output")}</summary>
                  <pre>{codexUpdateState.result.output}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-divider" />
      <div className="settings-field-label settings-field-label--section">
        {tx("Default parameters")}
      </div>

      <SettingsToggleRow
        title={
          <label htmlFor="default-model">
            {tx("Model")}
          </label>
        }
        subtitle={
          defaultModelsConnectedWorkspaceCount === 0
            ? tx("Add a workspace to load available models.")
            : defaultModelsLoading
              ? tx("Loading models from the first workspace…")
              : defaultModelsError
                ? tx("Couldn’t load models: {error}", { error: defaultModelsError })
                : tx("Sourced from the first workspace and used when there is no thread-specific override.")
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
            aria-label={tx("Model")}
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
            {tx("Refresh")}
          </button>
        </div>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-effort">
            {tx("Reasoning effort")}
          </label>
        }
        subtitle={
          reasoningSupported
            ? tx("Available options depend on the selected model.")
            : tx("The selected model does not expose reasoning effort options.")
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
          aria-label={tx("Reasoning effort")}
          disabled={!reasoningSupported}
        >
          {!reasoningSupported && <option value="">{tx("not supported")}</option>}
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
            {tx("Access mode")}
          </label>
        }
        subtitle={tx("Used when there is no thread-specific override.")}
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
          <option value="read-only">{tx("Read only")}</option>
          <option value="current">{tx("On-request")}</option>
          <option value="full-access">{tx("Full access")}</option>
        </select>
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="review-delivery">
          {tx("Review mode")}
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
          <option value="inline">{tx("Inline (same thread)")}</option>
          <option value="detached">{tx("Detached (new review thread)")}</option>
        </select>
        <div className="settings-help">
          {tx("Choose whether")} <code>/review</code>{" "}
          {tx("runs in the current thread or a detached review thread.")}
        </div>
      </div>

      <FileEditorCard
        title={tx("Global AGENTS.md")}
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder={tx("Add global instructions for Codex agents…")}
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            {tx("Stored at")} <code>~/.codex/AGENTS.md</code>.
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
        title={tx("Global config.toml")}
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder={tx("Edit the global Codex config.toml…")}
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            {tx("Stored at")} <code>~/.codex/config.toml</code>.
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
