import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ModelOption } from "@/types";
import type { SettingsAgentsSectionProps } from "@settings/hooks/useSettingsAgentsSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

const FALLBACK_AGENT_MODELS: ModelOption[] = [
  {
    id: "gpt-5-codex",
    model: "gpt-5-codex",
    displayName: "gpt-5-codex",
    description: "Fallback model while workspace model list is unavailable.",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "" },
      { reasoningEffort: "medium", description: "" },
      { reasoningEffort: "high", description: "" },
    ],
    defaultReasoningEffort: "medium",
    isDefault: true,
  },
];

export function SettingsAgentsSection({
  settings,
  isLoading,
  isUpdatingCore,
  creatingAgent,
  updatingAgentName,
  deletingAgentName,
  readingConfigAgentName,
  writingConfigAgentName,
  error,
  onRefresh,
  onSetMultiAgentEnabled,
  onSetMaxThreads,
  onCreateAgent,
  onUpdateAgent,
  onDeleteAgent,
  onReadAgentConfig,
  onWriteAgentConfig,
  modelOptions,
  modelOptionsLoading,
  modelOptionsError,
}: SettingsAgentsSectionProps) {
  const [openPathError, setOpenPathError] = useState<string | null>(null);
  const [maxThreadsDraft, setMaxThreadsDraft] = useState("6");

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createModel, setCreateModel] = useState("");
  const [createReasoningEffort, setCreateReasoningEffort] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [pendingDeleteAgentName, setPendingDeleteAgentName] = useState<string | null>(null);
  const [editNameDraft, setEditNameDraft] = useState("");
  const [editDescriptionDraft, setEditDescriptionDraft] = useState("");
  const [renameManagedFile, setRenameManagedFile] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  const [configEditorAgentName, setConfigEditorAgentName] = useState<string | null>(null);
  const [configEditorContent, setConfigEditorContent] = useState("");
  const [configEditorDirty, setConfigEditorDirty] = useState(false);
  const effectiveModelOptions = modelOptions.length > 0 ? modelOptions : FALLBACK_AGENT_MODELS;

  useEffect(() => {
    if (!settings) {
      return;
    }
    setMaxThreadsDraft(String(settings.maxThreads));
  }, [settings]);

  const configEditorAgent = useMemo(
    () => settings?.agents.find((agent) => agent.name === configEditorAgentName) ?? null,
    [configEditorAgentName, settings?.agents],
  );

  const parseMaxThreads = (rawValue: string): number | null => {
    const value = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(value) || value < 1 || value > 12) {
      return null;
    }
    return value;
  };

  const selectedCreateModel = useMemo(
    () => effectiveModelOptions.find((option) => option.model === createModel) ?? null,
    [createModel, effectiveModelOptions],
  );

  const createReasoningOptions = useMemo(() => {
    if (!selectedCreateModel) {
      return [];
    }
    const supported = selectedCreateModel.supportedReasoningEfforts
      .map((option) => option.reasoningEffort.trim().toLowerCase())
      .filter((value) => value.length > 0);
    if (supported.length > 0) {
      return Array.from(new Set(supported));
    }
    const fallback = selectedCreateModel.defaultReasoningEffort?.trim().toLowerCase() ?? "";
    return fallback ? [fallback] : [];
  }, [selectedCreateModel]);

  useEffect(() => {
    if (!effectiveModelOptions.length) {
      return;
    }
    if (
      !createModel ||
      !effectiveModelOptions.some((option) => option.model === createModel)
    ) {
      setCreateModel(effectiveModelOptions[0].model);
    }
  }, [createModel, effectiveModelOptions]);

  useEffect(() => {
    if (createReasoningOptions.length === 0) {
      setCreateReasoningEffort("");
      return;
    }
    if (!createReasoningOptions.includes(createReasoningEffort)) {
      if (createReasoningOptions.includes("medium")) {
        setCreateReasoningEffort("medium");
      } else {
        setCreateReasoningEffort(createReasoningOptions[0]);
      }
    }
  }, [createReasoningEffort, createReasoningOptions]);

  const handleOpenPath = async (path: string) => {
    setOpenPathError(null);
    try {
      await revealItemInDir(path);
    } catch (openError) {
      setOpenPathError(
        openError instanceof Error ? openError.message : "Unable to open path.",
      );
    }
  };

  const handleToggleMultiAgent = async () => {
    if (!settings) {
      return;
    }
    await onSetMultiAgentEnabled(!settings.multiAgentEnabled);
  };

  const handleMaxThreadsChange = async (rawValue: string) => {
    setMaxThreadsDraft(rawValue);
    const parsed = parseMaxThreads(rawValue);
    if (parsed == null) {
      setCreateError(null);
      setEditError(null);
      setOpenPathError("Max threads must be an integer between 1 and 12.");
      return;
    }
    setOpenPathError(null);
    if (settings && parsed !== settings.maxThreads) {
      await onSetMaxThreads(parsed);
    }
  };

  const currentMaxThreads = settings
    ? (parseMaxThreads(maxThreadsDraft) ?? settings.maxThreads)
    : 1;

  const handleMaxThreadsStep = async (delta: number) => {
    if (!settings || isUpdatingCore) {
      return;
    }
    const nextValue = Math.min(12, Math.max(1, currentMaxThreads + delta));
    if (nextValue === currentMaxThreads) {
      return;
    }
    await handleMaxThreadsChange(String(nextValue));
  };

  const handleCreateAgent = async () => {
    const name = createName.trim();
    if (!name) {
      setCreateError("Agent name is required.");
      return;
    }
    setCreateError(null);
    const success = await onCreateAgent({
      name,
      description: createDescription.trim() || null,
      template: "blank",
      model: createModel || null,
      reasoningEffort: createReasoningEffort || null,
    });
    if (success) {
      setCreateName("");
      setCreateDescription("");
      setCreateReasoningEffort("");
    }
  };

  const startEditing = (agent: NonNullable<SettingsAgentsSectionProps["settings"]>["agents"][number]) => {
    setEditingName(agent.name);
    setEditNameDraft(agent.name);
    setEditDescriptionDraft(agent.description ?? "");
    setRenameManagedFile(true);
    setEditError(null);
  };

  const handleUpdateAgent = async () => {
    if (!editingName) {
      return;
    }
    const nextName = editNameDraft.trim();
    if (!nextName) {
      setEditError("Agent name is required.");
      return;
    }
    setEditError(null);
    const success = await onUpdateAgent({
      originalName: editingName,
      name: nextName,
      description: editDescriptionDraft.trim() || null,
      renameManagedFile,
    });
    if (success) {
      if (configEditorAgentName === editingName) {
        setConfigEditorAgentName(nextName);
      }
      setEditingName(null);
    }
  };

  const handleDeleteAgent = (name: string) => {
    setPendingDeleteAgentName(name);
  };

  const handleConfirmDeleteAgent = async (name: string) => {
    const success = await onDeleteAgent({ name, deleteManagedFile: true });
    if (!success) {
      return;
    }
    setPendingDeleteAgentName((current) => (current === name ? null : current));
    if (configEditorAgentName === name) {
      setConfigEditorAgentName(null);
      setConfigEditorContent("");
      setConfigEditorDirty(false);
    }
  };

  const handleOpenConfigEditor = async (agentName: string) => {
    const content = await onReadAgentConfig(agentName);
    if (content == null) {
      return;
    }
    setConfigEditorAgentName(agentName);
    setConfigEditorContent(content);
    setConfigEditorDirty(false);
  };

  const handleSaveConfigEditor = async () => {
    if (!configEditorAgentName) {
      return;
    }
    const success = await onWriteAgentConfig(configEditorAgentName, configEditorContent);
    if (success) {
      setConfigEditorDirty(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-title">Agents</div>
      <div className="settings-section-subtitle">
        Configure multi-agent mode, thread limits, and custom agent roles.
      </div>
      <div className="settings-help settings-agents-builtins-help">
        Built-in roles from Codex are still available: <code>default</code>, <code>explorer</code>,
        and <code>worker</code>.
      </div>

      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Config file</div>
          <div className="settings-toggle-subtitle">
            Open global Codex config in {fileManagerName()}.
          </div>
        </div>
        <div className="settings-agents-actions">
          <button type="button" className="ghost" onClick={onRefresh} disabled={isLoading}>
            Refresh
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => settings && void handleOpenPath(settings.configPath)}
            disabled={!settings}
          >
            {openInFileManagerLabel()}
          </button>
        </div>
      </div>

      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Enable Multi-Agent</div>
          <div className="settings-toggle-subtitle">
            Writes <code>features.multi_agent</code> in config.toml.
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${settings?.multiAgentEnabled ? "on" : ""}`}
          onClick={() => void handleToggleMultiAgent()}
          aria-pressed={settings?.multiAgentEnabled ?? false}
          disabled={!settings || isUpdatingCore}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>

      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">Max Threads</div>
          <div className="settings-toggle-subtitle">
            Maximum open agent threads. Valid range: <code>1-12</code>. Changes save immediately.
          </div>
        </div>
        <div className="settings-agents-stepper" role="group" aria-label="Maximum agent threads">
          <button
            type="button"
            className="ghost settings-agents-stepper-button"
            onClick={() => {
              void handleMaxThreadsStep(-1);
            }}
            disabled={!settings || isUpdatingCore || currentMaxThreads <= 1}
            aria-label="Decrease max threads"
          >
            ▼
          </button>
          <div className="settings-agents-stepper-value" aria-live="polite" aria-atomic="true">
            {currentMaxThreads}
          </div>
          <button
            type="button"
            className="ghost settings-agents-stepper-button"
            onClick={() => {
              void handleMaxThreadsStep(1);
            }}
            disabled={!settings || isUpdatingCore || currentMaxThreads >= 12}
            aria-label="Increase max threads"
          >
            ▲
          </button>
        </div>
      </div>

      <div className="settings-subsection-title">Create Agent</div>
      <div className="settings-subsection-subtitle">
        Add a custom role under <code>[agents.&lt;name&gt;]</code> and create its config file.
      </div>
      <div className="settings-field settings-agents-form">
        <label className="settings-label" htmlFor="settings-agent-create-name">
          Name
        </label>
        <input
          id="settings-agent-create-name"
          className="settings-input"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          placeholder="researcher"
          disabled={creatingAgent}
        />
        <label className="settings-label" htmlFor="settings-agent-create-description">
          Description
        </label>
        <textarea
          id="settings-agent-create-description"
          className="settings-agents-textarea"
          value={createDescription}
          onChange={(event) => setCreateDescription(event.target.value)}
          placeholder="Research-focused role."
          disabled={creatingAgent}
        />
        <div className="settings-agents-model-row">
          <div className="settings-agents-model-field settings-agents-model-field--model">
            <span className="settings-agents-inline-label">model:</span>
            <select
              id="settings-agent-create-model"
              className="settings-select settings-select--compact"
              value={createModel}
              onChange={(event) => setCreateModel(event.target.value)}
              disabled={creatingAgent}
              aria-label="Agent model"
            >
              {effectiveModelOptions.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.model}
                </option>
              ))}
            </select>
          </div>
          <span className="settings-agents-inline-separator" aria-hidden>
            |
          </span>
          <div className="settings-agents-model-field settings-agents-model-field--effort">
            <span className="settings-agents-inline-label">reasoning:</span>
            <select
              id="settings-agent-create-effort"
              className="settings-select settings-select--compact"
              value={createReasoningEffort}
              onChange={(event) => setCreateReasoningEffort(event.target.value)}
              disabled={creatingAgent || createReasoningOptions.length === 0}
              aria-label="Agent reasoning effort"
            >
              {createReasoningOptions.length === 0 && <option value="">not supported</option>}
              {createReasoningOptions.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="settings-agents-actions">
          <button type="button" className="ghost" onClick={() => void handleCreateAgent()}>
            {creatingAgent ? "Creating..." : "Create Agent"}
          </button>
        </div>
        {modelOptions.length === 0 && (
          <div className="settings-help">
            {modelOptionsLoading
              ? "Loading workspace model metadata. Using fallback model defaults for now."
              : "Using fallback model defaults until workspace model metadata is available."}
          </div>
        )}
        {modelOptionsError && <div className="settings-help">{modelOptionsError}</div>}
        {createError && <div className="settings-agents-error">{createError}</div>}
      </div>

      <div className="settings-subsection-title">Configured Agents</div>
      <div className="settings-subsection-subtitle">
        Manage custom roles and their per-agent config files.
      </div>

      {settings && settings.agents.length === 0 && !isLoading && (
        <div className="settings-help">No custom agents configured yet.</div>
      )}

      {settings?.agents.map((agent) => {
        const isEditing = editingName === agent.name;
        const isPendingDelete = pendingDeleteAgentName === agent.name;
        const isUpdating = updatingAgentName === agent.name;
        const isDeleting = deletingAgentName === agent.name;
        const isReadingConfig = readingConfigAgentName === agent.name;
        const isWritingConfig = writingConfigAgentName === agent.name;
        return (
          <div className="settings-field settings-agent-card" key={agent.name}>
            <div className="settings-agent-card-header">
              <div>
                <div className="settings-toggle-title">{agent.name}</div>
                <div className="settings-toggle-subtitle">
                  {agent.description || "No description."}
                </div>
              </div>
              {!isPendingDelete && (
                <div className="settings-agents-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => startEditing(agent)}
                    disabled={isUpdating || isDeleting}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleDeleteAgent(agent.name)}
                    disabled={isUpdating || isDeleting}
                  >
                    Delete
                  </button>
                </div>
              )}
              {isPendingDelete && (
                <div className="settings-agents-actions">
                  <span className="settings-help settings-help-inline">
                    Delete agent and managed config file?
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setPendingDeleteAgentName(null);
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void handleConfirmDeleteAgent(agent.name)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              )}
            </div>

            <div className="settings-help settings-help-inline">
              <code>{agent.configFile || "(missing config_file)"}</code>
            </div>
            <div className="settings-agents-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => void handleOpenPath(agent.resolvedPath)}
              >
                {openInFileManagerLabel()}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void handleOpenConfigEditor(agent.name)}
                disabled={!agent.managedByApp || isReadingConfig || isWritingConfig}
              >
                {isReadingConfig ? "Opening..." : "Edit File"}
              </button>
              {!agent.managedByApp && (
                <span className="settings-help settings-help-inline">External path</span>
              )}
            </div>

            {isEditing && (
              <div className="settings-agents-edit-form">
                <label className="settings-label" htmlFor={`settings-agent-edit-name-${agent.name}`}>
                  Name
                </label>
                <input
                  id={`settings-agent-edit-name-${agent.name}`}
                  className="settings-input"
                  value={editNameDraft}
                  onChange={(event) => setEditNameDraft(event.target.value)}
                  disabled={isUpdating}
                />
                <label
                  className="settings-label"
                  htmlFor={`settings-agent-edit-description-${agent.name}`}
                >
                  Description
                </label>
                <textarea
                  id={`settings-agent-edit-description-${agent.name}`}
                  className="settings-agents-textarea"
                  value={editDescriptionDraft}
                  onChange={(event) => setEditDescriptionDraft(event.target.value)}
                  disabled={isUpdating}
                />
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={renameManagedFile}
                    onChange={(event) => setRenameManagedFile(event.target.checked)}
                  />
                  Rename managed config file when agent name changes
                </label>
                <div className="settings-agents-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEditingName(null);
                      setEditError(null);
                    }}
                    disabled={isUpdating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void handleUpdateAgent()}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Saving..." : "Save"}
                  </button>
                </div>
                {editError && <div className="settings-agents-error">{editError}</div>}
              </div>
            )}
          </div>
        );
      })}

      {configEditorAgent && (
        <div className="settings-field settings-agents-editor">
          <div className="settings-agents-header">
            <div>
              <div className="settings-toggle-title">{configEditorAgent.name} config file</div>
              <div className="settings-toggle-subtitle">
                <code>{configEditorAgent.configFile}</code>
              </div>
            </div>
            <div className="settings-agents-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setConfigEditorAgentName(null);
                  setConfigEditorDirty(false);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void handleSaveConfigEditor()}
                disabled={!configEditorDirty || writingConfigAgentName === configEditorAgent.name}
              >
                {writingConfigAgentName === configEditorAgent.name ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          <textarea
            className="settings-agents-textarea"
            value={configEditorContent}
            onChange={(event) => {
              setConfigEditorContent(event.target.value);
              setConfigEditorDirty(true);
            }}
          />
        </div>
      )}

      {isLoading && <div className="settings-help">Loading agents settings...</div>}
      {openPathError && <div className="settings-agents-error">{openPathError}</div>}
      {error && <div className="settings-agents-error">{error}</div>}
    </section>
  );
}
