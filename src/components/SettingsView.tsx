import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  SlidersHorizontal,
  Stethoscope,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import type { AppSettings, CodexDoctorResult, WorkspaceInfo } from "../types";
import {
  clampUiScale,
} from "../utils/uiScale";

type SettingsViewProps = {
  workspaces: WorkspaceInfo[];
  onClose: () => void;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
  reduceTransparency: boolean;
  onToggleTransparency: (value: boolean) => void;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onRunDoctor: (codexBin: string | null) => Promise<CodexDoctorResult>;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
};

type SettingsSection = "projects" | "display";
type CodexSection = SettingsSection | "codex";

function orderValue(workspace: WorkspaceInfo) {
  const value = workspace.settings.sortOrder;
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

export function SettingsView({
  workspaces,
  onClose,
  onMoveWorkspace,
  onDeleteWorkspace,
  reduceTransparency,
  onToggleTransparency,
  appSettings,
  onUpdateAppSettings,
  onRunDoctor,
  onUpdateWorkspaceCodexBin,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<CodexSection>("projects");
  const [codexPathDraft, setCodexPathDraft] = useState(appSettings.codexBin ?? "");
  const [scaleDraft, setScaleDraft] = useState(
    `${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`,
  );
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const projects = useMemo(() => {
    return workspaces
      .filter((entry) => (entry.kind ?? "main") !== "worktree")
      .slice()
      .sort((a, b) => {
        const orderDiff = orderValue(a) - orderValue(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [workspaces]);

  useEffect(() => {
    setCodexPathDraft(appSettings.codexBin ?? "");
  }, [appSettings.codexBin]);

  useEffect(() => {
    setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
  }, [appSettings.uiScale]);

  useEffect(() => {
    setOverrideDrafts((prev) => {
      const next: Record<string, string> = {};
      projects.forEach((workspace) => {
        next[workspace.id] =
          prev[workspace.id] ?? workspace.codex_bin ?? "";
      });
      return next;
    });
  }, [projects]);

  const codexDirty =
    (codexPathDraft.trim() || null) !== (appSettings.codexBin ?? null);

  const trimmedScale = scaleDraft.trim();
  const parsedPercent = trimmedScale
    ? Number(trimmedScale.replace("%", ""))
    : Number.NaN;
  const parsedScale = Number.isFinite(parsedPercent) ? parsedPercent / 100 : null;

  const handleSaveCodexSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        codexBin: codexPathDraft.trim() ? codexPathDraft.trim() : null,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCommitScale = async () => {
    if (parsedScale === null) {
      setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
      return;
    }
    const nextScale = clampUiScale(parsedScale);
    setScaleDraft(`${Math.round(nextScale * 100)}%`);
    if (nextScale === appSettings.uiScale) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: nextScale,
    });
  };

  const handleResetScale = async () => {
    if (appSettings.uiScale === 1) {
      setScaleDraft("100%");
      return;
    }
    setScaleDraft("100%");
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: 1,
    });
  };

  const handleBrowseCodex = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setCodexPathDraft(selection);
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(
        codexPathDraft.trim() ? codexPathDraft.trim() : null,
      );
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          codexBin: codexPathDraft.trim() ? codexPathDraft.trim() : null,
          version: null,
          appServerOk: false,
          details: error instanceof Error ? error.message : String(error),
          path: null,
          nodeOk: false,
          nodeVersion: null,
          nodeDetails: null,
        },
      });
    }
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-window">
        <div className="settings-titlebar">
          <div className="settings-title">Settings</div>
          <button
            type="button"
            className="ghost icon-button settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X aria-hidden />
          </button>
        </div>
        <div className="settings-body">
          <aside className="settings-sidebar">
            <button
              type="button"
              className={`settings-nav ${activeSection === "projects" ? "active" : ""}`}
              onClick={() => setActiveSection("projects")}
            >
              <LayoutGrid aria-hidden />
              Projects
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "display" ? "active" : ""}`}
              onClick={() => setActiveSection("display")}
            >
              <SlidersHorizontal aria-hidden />
              Display &amp; Sound
            </button>
            <button
              type="button"
              className={`settings-nav ${activeSection === "codex" ? "active" : ""}`}
              onClick={() => setActiveSection("codex")}
            >
              <TerminalSquare aria-hidden />
              Codex
            </button>
          </aside>
          <div className="settings-content">
            {activeSection === "projects" && (
              <section className="settings-section">
                <div className="settings-section-title">Projects</div>
                <div className="settings-section-subtitle">
                  Reorder your projects and remove unused workspaces.
                </div>
                <div className="settings-projects">
                  {projects.map((workspace, index) => (
                    <div key={workspace.id} className="settings-project-row">
                      <div className="settings-project-info">
                        <div className="settings-project-name">{workspace.name}</div>
                        <div className="settings-project-path">{workspace.path}</div>
                      </div>
                      <div className="settings-project-actions">
                        <button
                          type="button"
                          className="ghost icon-button"
                          onClick={() => onMoveWorkspace(workspace.id, "up")}
                          disabled={index === 0}
                          aria-label="Move project up"
                        >
                          <ChevronUp aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="ghost icon-button"
                          onClick={() => onMoveWorkspace(workspace.id, "down")}
                          disabled={index === projects.length - 1}
                          aria-label="Move project down"
                        >
                          <ChevronDown aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="ghost icon-button"
                          onClick={() => onDeleteWorkspace(workspace.id)}
                          aria-label="Delete project"
                        >
                          <Trash2 aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="settings-empty">No projects yet.</div>
                  )}
                </div>
              </section>
            )}
            {activeSection === "display" && (
              <section className="settings-section">
                <div className="settings-section-title">Display &amp; Sound</div>
                <div className="settings-section-subtitle">
                  Tune visuals and audio alerts to your preferences.
                </div>
                <div className="settings-subsection-title">Display</div>
                <div className="settings-subsection-subtitle">
                  Adjust how the window renders backgrounds and effects.
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Reduce transparency</div>
                    <div className="settings-toggle-subtitle">
                      Use solid surfaces instead of glass.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${reduceTransparency ? "on" : ""}`}
                    onClick={() => onToggleTransparency(!reduceTransparency)}
                    aria-pressed={reduceTransparency}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-toggle-row settings-scale-row">
                  <div>
                    <div className="settings-toggle-title">Interface scale</div>
                    <div
                      className="settings-toggle-subtitle"
                      title={scaleShortcutTitle}
                    >
                      {scaleShortcutText}
                    </div>
                  </div>
                  <div className="settings-scale-controls">
                    <input
                      id="ui-scale"
                      type="text"
                      inputMode="decimal"
                      className="settings-input settings-input--scale"
                      value={scaleDraft}
                      aria-label="Interface scale"
                      onChange={(event) => setScaleDraft(event.target.value)}
                      onBlur={() => {
                        void handleCommitScale();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitScale();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost settings-scale-reset"
                      onClick={() => {
                        void handleResetScale();
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="settings-subsection-title">Sounds</div>
                <div className="settings-subsection-subtitle">
                  Control notification audio alerts.
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Notification sounds</div>
                    <div className="settings-toggle-subtitle">
                      Play a sound when a long-running agent finishes while the window is unfocused.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.notificationSoundsEnabled ? "on" : ""}`}
                    onClick={() =>
                      void onUpdateAppSettings({
                        ...appSettings,
                        notificationSoundsEnabled: !appSettings.notificationSoundsEnabled,
                      })
                    }
                    aria-pressed={appSettings.notificationSoundsEnabled}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-sound-actions">
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={onTestNotificationSound}
                  >
                    Test sound
                  </button>
                </div>
              </section>
            )}
            {activeSection === "codex" && (
              <section className="settings-section">
                <div className="settings-section-title">Codex</div>
                <div className="settings-section-subtitle">
                  Configure the Codex CLI used by CodexMonitor and validate the install.
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="codex-path">
                    Default Codex path
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="codex-path"
                      className="settings-input"
                      value={codexPathDraft}
                      placeholder="codex"
                      onChange={(event) => setCodexPathDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={handleBrowseCodex}>
                      Browse
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setCodexPathDraft("")}
                    >
                      Use PATH
                    </button>
                  </div>
                  <div className="settings-help">
                    Leave empty to use the system PATH resolution.
                  </div>
                <div className="settings-field-actions">
                  {codexDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveCodexSettings}
                      disabled={isSavingSettings}
                    >
                      {isSavingSettings ? "Saving..." : "Save"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={handleRunDoctor}
                    disabled={doctorState.status === "running"}
                  >
                    <Stethoscope aria-hidden />
                    {doctorState.status === "running" ? "Running..." : "Run doctor"}
                  </button>
                </div>

                {doctorState.result && (
                  <div
                    className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {doctorState.result.ok ? "Codex looks good" : "Codex issue detected"}
                    </div>
                    <div className="settings-doctor-body">
                      <div>
                        Version: {doctorState.result.version ?? "unknown"}
                      </div>
                      <div>
                        App-server: {doctorState.result.appServerOk ? "ok" : "failed"}
                      </div>
                      <div>
                        Node:{" "}
                        {doctorState.result.nodeOk
                          ? `ok (${doctorState.result.nodeVersion ?? "unknown"})`
                          : "missing"}
                      </div>
                      {doctorState.result.details && (
                        <div>{doctorState.result.details}</div>
                      )}
                      {doctorState.result.nodeDetails && (
                        <div>{doctorState.result.nodeDetails}</div>
                      )}
                      {doctorState.result.path && (
                        <div className="settings-doctor-path">
                          PATH: {doctorState.result.path}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="default-access">
                    Default access mode
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
                    <option value="read-only">Read only</option>
                    <option value="current">On-request</option>
                    <option value="full-access">Full access</option>
                  </select>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Workspace overrides</div>
                  <div className="settings-overrides">
                    {projects.map((workspace) => (
                      <div key={workspace.id} className="settings-override-row">
                        <div className="settings-override-info">
                          <div className="settings-project-name">{workspace.name}</div>
                          <div className="settings-project-path">{workspace.path}</div>
                        </div>
                        <div className="settings-override-actions">
                          <input
                            className="settings-input settings-input--compact"
                            value={overrideDrafts[workspace.id] ?? ""}
                            placeholder="Use default"
                            onChange={(event) =>
                              setOverrideDrafts((prev) => ({
                                ...prev,
                                [workspace.id]: event.target.value,
                              }))
                            }
                            onBlur={async () => {
                              const draft = overrideDrafts[workspace.id] ?? "";
                              const nextValue = draft.trim() || null;
                              if (nextValue === (workspace.codex_bin ?? null)) {
                                return;
                              }
                              await onUpdateWorkspaceCodexBin(workspace.id, nextValue);
                            }}
                          />
                          <button
                            type="button"
                            className="ghost"
                            onClick={async () => {
                              setOverrideDrafts((prev) => ({
                                ...prev,
                                [workspace.id]: "",
                              }));
                              await onUpdateWorkspaceCodexBin(workspace.id, null);
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="settings-empty">No projects yet.</div>
                    )}
                  </div>
                </div>

              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
