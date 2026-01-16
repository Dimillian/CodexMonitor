import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  LayoutGrid,
  SlidersHorizontal,
  Stethoscope,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import type { CloudTelemetryEntry } from "../../../cloud/cloudTelemetry";
import { clearCloudTelemetry, readCloudTelemetry } from "../../../cloud/cloudTelemetry";
import type {
  AppSettings,
  CloudKitStatus,
  CloudKitTestResult,
  CodexDoctorResult,
  WorkspaceInfo,
} from "../../../types";
import { clampUiScale } from "../../../utils/uiScale";

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
  onCloudKitStatus: () => Promise<CloudKitStatus>;
  onCloudKitTest: () => Promise<CloudKitTestResult>;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
};

type SettingsSection = "projects" | "display" | "cloud";
type SettingsTab = SettingsSection | "codex";

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
  onCloudKitStatus,
  onCloudKitTest,
  onUpdateWorkspaceCodexBin,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsTab>("projects");
  const [codexPathDraft, setCodexPathDraft] = useState(appSettings.codexBin ?? "");
  const [scaleDraft, setScaleDraft] = useState(
    `${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`,
  );
  const [cloudKitContainerDraft, setCloudKitContainerDraft] = useState(
    appSettings.cloudKitContainerId ?? "",
  );
  const [cloudKitPollDraft, setCloudKitPollDraft] = useState(
    appSettings.cloudKitPollIntervalMs ? String(appSettings.cloudKitPollIntervalMs) : "",
  );
  const [natsUrlDraft, setNatsUrlDraft] = useState(appSettings.natsUrl ?? "");
  const [natsNamespaceDraft, setNatsNamespaceDraft] = useState(
    appSettings.natsNamespace ?? "",
  );
  const [natsCredsDraft, setNatsCredsDraft] = useState(
    appSettings.natsCredsFilePath ?? "",
  );
  const [telegramTokenDraft, setTelegramTokenDraft] = useState(
    appSettings.telegramBotToken ?? "",
  );
  const [telegramAllowedDraft, setTelegramAllowedDraft] = useState(() =>
    (appSettings.telegramAllowedUserIds ?? []).join(","),
  );
  const [telegramChatDraft, setTelegramChatDraft] = useState(
    appSettings.telegramDefaultChatId ? String(appSettings.telegramDefaultChatId) : "",
  );
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });
  const [cloudStatusState, setCloudStatusState] = useState<{
    status: "idle" | "running" | "done";
    result: CloudKitStatus | null;
    error: string | null;
  }>({ status: "idle", result: null, error: null });
  const [cloudTestState, setCloudTestState] = useState<{
    status: "idle" | "running" | "done";
    result: CloudKitTestResult | null;
    error: string | null;
  }>({ status: "idle", result: null, error: null });
  const [cloudTelemetryOpen, setCloudTelemetryOpen] = useState(false);
  const [cloudTelemetryEntries, setCloudTelemetryEntries] = useState<
    CloudTelemetryEntry[]
  >(() => readCloudTelemetry());
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingCloudSettings, setIsSavingCloudSettings] = useState(false);

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
    setCloudKitContainerDraft(appSettings.cloudKitContainerId ?? "");
  }, [appSettings.cloudKitContainerId]);

  useEffect(() => {
    setCloudKitPollDraft(
      appSettings.cloudKitPollIntervalMs
        ? String(appSettings.cloudKitPollIntervalMs)
        : "",
    );
  }, [appSettings.cloudKitPollIntervalMs]);

  useEffect(() => {
    if (activeSection !== "cloud") {
      return;
    }
    if (!cloudTelemetryOpen) {
      return;
    }
    setCloudTelemetryEntries(readCloudTelemetry());
  }, [activeSection, cloudTelemetryOpen]);

  useEffect(() => {
    setNatsUrlDraft(appSettings.natsUrl ?? "");
    setNatsNamespaceDraft(appSettings.natsNamespace ?? "");
    setNatsCredsDraft(appSettings.natsCredsFilePath ?? "");
  }, [appSettings.natsUrl, appSettings.natsNamespace, appSettings.natsCredsFilePath]);

  useEffect(() => {
    setTelegramTokenDraft(appSettings.telegramBotToken ?? "");
    setTelegramAllowedDraft((appSettings.telegramAllowedUserIds ?? []).join(","));
    setTelegramChatDraft(
      appSettings.telegramDefaultChatId
        ? String(appSettings.telegramDefaultChatId)
        : "",
    );
  }, [appSettings.telegramAllowedUserIds, appSettings.telegramBotToken, appSettings.telegramDefaultChatId]);

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
  const cloudKitContainerDirty =
    (cloudKitContainerDraft.trim() || null) !==
    (appSettings.cloudKitContainerId ?? null);

  const cloudKitContainerConfigured = Boolean(
    (appSettings.cloudKitContainerId ?? "").trim(),
  );

  const cloudKitPollDirty =
    (cloudKitPollDraft.trim() || null) !==
    (appSettings.cloudKitPollIntervalMs ? String(appSettings.cloudKitPollIntervalMs) : null);

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

  const handleToggleCloudKit = async () => {
    if (isSavingCloudSettings) {
      return;
    }
    const nextEnabled = !appSettings.cloudKitEnabled;
    setIsSavingCloudSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        cloudKitEnabled: nextEnabled,
      });
      setCloudStatusState({ status: "idle", result: null, error: null });
      setCloudTestState({ status: "idle", result: null, error: null });
    } finally {
      setIsSavingCloudSettings(false);
    }
  };

  const handleSaveCloudKitContainer = async () => {
    if (isSavingCloudSettings) {
      return;
    }
    setIsSavingCloudSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        cloudKitContainerId: cloudKitContainerDraft.trim()
          ? cloudKitContainerDraft.trim()
          : null,
      });
      setCloudStatusState({ status: "idle", result: null, error: null });
      setCloudTestState({ status: "idle", result: null, error: null });
    } finally {
      setIsSavingCloudSettings(false);
    }
  };

  const handleSaveCloudKitPoll = async () => {
    if (isSavingCloudSettings) {
      return;
    }
    setIsSavingCloudSettings(true);
    try {
      const parsed = cloudKitPollDraft.trim()
        ? Number.parseInt(cloudKitPollDraft.trim(), 10)
        : null;
      await onUpdateAppSettings({
        ...appSettings,
        cloudKitPollIntervalMs:
          parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      });
    } finally {
      setIsSavingCloudSettings(false);
    }
  };

  const handleBrowseNatsCreds = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setNatsCredsDraft(selection);
  };

  const handleSaveNatsTelegram = async () => {
    if (isSavingCloudSettings) {
      return;
    }
    setIsSavingCloudSettings(true);
    try {
      const allowedIds = telegramAllowedDraft
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number.parseInt(entry, 10))
        .filter((entry) => Number.isFinite(entry));
      const defaultChatId = telegramChatDraft.trim()
        ? Number.parseInt(telegramChatDraft.trim(), 10)
        : null;
      await onUpdateAppSettings({
        ...appSettings,
        natsUrl: natsUrlDraft.trim() ? natsUrlDraft.trim() : null,
        natsNamespace: natsNamespaceDraft.trim() ? natsNamespaceDraft.trim() : null,
        natsCredsFilePath: natsCredsDraft.trim() ? natsCredsDraft.trim() : null,
        telegramBotToken: telegramTokenDraft.trim()
          ? telegramTokenDraft.trim()
          : null,
        telegramAllowedUserIds: allowedIds,
        telegramDefaultChatId:
          defaultChatId && Number.isFinite(defaultChatId) ? defaultChatId : null,
      });
    } finally {
      setIsSavingCloudSettings(false);
    }
  };

  const handleRunCloudStatus = async () => {
    setCloudStatusState({ status: "running", result: null, error: null });
    try {
      const result = await onCloudKitStatus();
      setCloudStatusState({ status: "done", result, error: null });
    } catch (error) {
      setCloudStatusState({
        status: "done",
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleRunCloudTest = async () => {
    setCloudTestState({ status: "running", result: null, error: null });
    try {
      const result = await onCloudKitTest();
      setCloudTestState({ status: "done", result, error: null });
    } catch (error) {
      setCloudTestState({
        status: "done",
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Intentionally do not auto-run CloudKit calls when the Cloud tab opens.
  // Misconfigured entitlements can cause native exceptions, so we only run
  // CloudKit operations via explicit user actions (buttons).

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
              className={`settings-nav ${activeSection === "cloud" ? "active" : ""}`}
              onClick={() => setActiveSection("cloud")}
            >
              <Cloud aria-hidden />
              Cloud
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
            {activeSection === "cloud" && (
              <section className="settings-section">
                <div className="settings-section-title">Cloud</div>
                <div className="settings-section-subtitle">
                  Optional iCloud sync for projects and chats.
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">Runner ID</label>
                  <div className="settings-help">
                    <code>{appSettings.runnerId || "…"}</code>
                  </div>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Enable CloudKit Sync</div>
                    <div className="settings-toggle-subtitle">
                      Mirrors your data into your private iCloud database.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.cloudKitEnabled ? "on" : ""}`}
                    onClick={handleToggleCloudKit}
                    aria-pressed={appSettings.cloudKitEnabled}
                    disabled={isSavingCloudSettings}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>

                <div className="settings-field">
                  <label
                    className="settings-field-label"
                    htmlFor="cloudkit-container-id"
                  >
                    CloudKit container identifier
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="cloudkit-container-id"
                      className="settings-input"
                      value={cloudKitContainerDraft}
                      placeholder="iCloud.com.example.codexmonitor"
                      onChange={(event) =>
                        setCloudKitContainerDraft(event.target.value)
                      }
                    />
                  </div>
                  <div className="settings-help">
                    Use the iCloud container identifier enabled for this app. Example:{" "}
                    <code>iCloud.com.ilass.codexmonitor</code>.
                  </div>
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="cloudkit-poll-ms">
                    CloudKit poll interval (ms)
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="cloudkit-poll-ms"
                      className="settings-input"
                      value={cloudKitPollDraft}
                      placeholder="2000"
                      onChange={(event) => setCloudKitPollDraft(event.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="settings-help">
                    Leave empty to use the default. Lower values mean faster remote control but more CloudKit traffic.
                  </div>
                </div>

                <div className="settings-field-actions">
                  {cloudKitContainerDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveCloudKitContainer}
                      disabled={isSavingCloudSettings}
                    >
                      {isSavingCloudSettings ? "Saving..." : "Save"}
                    </button>
                  )}
                  {cloudKitPollDirty && (
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveCloudKitPoll}
                      disabled={isSavingCloudSettings}
                    >
                      {isSavingCloudSettings ? "Saving..." : "Save poll interval"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={handleRunCloudStatus}
                    disabled={
                      !appSettings.cloudKitEnabled ||
                      !cloudKitContainerConfigured ||
                      cloudStatusState.status === "running"
                    }
                  >
                    <Stethoscope aria-hidden />
                    {cloudStatusState.status === "running"
                      ? "Checking..."
                      : "Check status"}
                  </button>
                  <button
                    type="button"
                    className="primary settings-button-compact"
                    onClick={handleRunCloudTest}
                    disabled={
                      !appSettings.cloudKitEnabled ||
                      !cloudKitContainerConfigured ||
                      cloudTestState.status === "running"
                    }
                  >
                    Test CloudKit
                  </button>
                </div>

                {cloudStatusState.status === "done" && (
                  <div
                    className={`settings-doctor ${cloudStatusState.result?.available ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {cloudStatusState.result?.available
                        ? "CloudKit account available"
                        : "CloudKit unavailable"}
                    </div>
                    <div className="settings-doctor-body">
                      <div>Status: {cloudStatusState.result?.status ?? "unknown"}</div>
                      {cloudStatusState.error && <div>{cloudStatusState.error}</div>}
                    </div>
                  </div>
                )}

                {cloudTestState.status === "done" && (
                  <div
                    className={`settings-doctor ${cloudTestState.result ? "ok" : "error"}`}
                  >
                    <div className="settings-doctor-title">
                      {cloudTestState.result ? "CloudKit test succeeded" : "CloudKit test failed"}
                    </div>
                    <div className="settings-doctor-body">
                      {cloudTestState.result && (
                        <div>
                          Record: {cloudTestState.result.recordName} (
                          {cloudTestState.result.durationMs} ms)
                        </div>
                      )}
                      {cloudTestState.error && <div>{cloudTestState.error}</div>}
                    </div>
                  </div>
                )}

                <div className="settings-divider" />

                <div className="settings-section-title">Cloud Telemetry</div>
                <div className="settings-section-subtitle">
                  Client-side cache and fetch timings (local-only). Use this to see whether views were served from cache or fetched from CloudKit.
                </div>
                <div className="settings-field-actions">
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => {
                      setCloudTelemetryOpen((prev) => !prev);
                      setCloudTelemetryEntries(readCloudTelemetry());
                    }}
                  >
                    {cloudTelemetryOpen ? "Hide telemetry" : "Show telemetry"}
                  </button>
                  <button
                    type="button"
                      className="ghost settings-button-compact"
                      onClick={async () => {
                        const entries = readCloudTelemetry();
                      const text = entries
                        .map((entry: CloudTelemetryEntry) => JSON.stringify(entry))
                        .join("\n");
                        if (text) {
                          await navigator.clipboard.writeText(text);
                        }
                      }}
                    >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => {
                      clearCloudTelemetry();
                      setCloudTelemetryEntries([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                {cloudTelemetryOpen && (
                  <div className="settings-help">
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 220,
                        overflow: "auto",
                        userSelect: "text",
                      }}
                    >
                      {cloudTelemetryEntries.length
                        ? cloudTelemetryEntries
                            .slice(-120)
                            .map((entry) => {
                              const time = new Date(entry.ts).toLocaleTimeString();
                              const parts = [
                                time,
                                entry.event,
                                entry.fromCache != null ? `cache=${entry.fromCache}` : "",
                                entry.durationMs != null ? `${Math.round(entry.durationMs)}ms` : "",
                                entry.scopeKey ? `scope=${entry.scopeKey}` : "",
                                entry.workspaceId ? `ws=${entry.workspaceId}` : "",
                                entry.threadId ? `th=${entry.threadId}` : "",
                                entry.note || "",
                              ].filter(Boolean);
                              return parts.join(" · ");
                            })
                            .join("\n")
                        : "No telemetry yet."}
                    </pre>
                  </div>
                )}

                <div className="settings-divider" />

                <div className="settings-section-title">NATS (Realtime)</div>
                <div className="settings-section-subtitle">
                  Optional low-latency transport for streaming events and commands.
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Enable NATS</div>
                    <div className="settings-toggle-subtitle">
                      Requires a reachable NATS server (self-hosted or managed).
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.natsEnabled ? "on" : ""}`}
                    onClick={async () => {
                      if (isSavingCloudSettings) return;
                      setIsSavingCloudSettings(true);
                      try {
                        await onUpdateAppSettings({
                          ...appSettings,
                          natsEnabled: !appSettings.natsEnabled,
                        });
                      } finally {
                        setIsSavingCloudSettings(false);
                      }
                    }}
                    aria-pressed={appSettings.natsEnabled}
                    disabled={isSavingCloudSettings}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="nats-url">
                    NATS URL
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="nats-url"
                      className="settings-input"
                      value={natsUrlDraft}
                      placeholder="nats://localhost:4222"
                      onChange={(event) => setNatsUrlDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="nats-namespace">
                    Namespace
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="nats-namespace"
                      className="settings-input"
                      value={natsNamespaceDraft}
                      placeholder="ilass.codexmonitor"
                      onChange={(event) => setNatsNamespaceDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="nats-creds">
                    Creds file (optional)
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="nats-creds"
                      className="settings-input"
                      value={natsCredsDraft}
                      placeholder="/path/to/user.creds"
                      onChange={(event) => setNatsCredsDraft(event.target.value)}
                    />
                    <button type="button" className="ghost" onClick={handleBrowseNatsCreds}>
                      Browse
                    </button>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-section-title">Telegram (Notifications)</div>
                <div className="settings-section-subtitle">
                  Minimal remote control via a Telegram bot (commands + main events).
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">Enable Telegram</div>
                    <div className="settings-toggle-subtitle">
                      Requires a bot token and an allowlist.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${appSettings.telegramEnabled ? "on" : ""}`}
                    onClick={async () => {
                      if (isSavingCloudSettings) return;
                      setIsSavingCloudSettings(true);
                      try {
                        await onUpdateAppSettings({
                          ...appSettings,
                          telegramEnabled: !appSettings.telegramEnabled,
                        });
                      } finally {
                        setIsSavingCloudSettings(false);
                      }
                    }}
                    aria-pressed={appSettings.telegramEnabled}
                    disabled={isSavingCloudSettings}
                  >
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="telegram-token">
                    Bot token
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="telegram-token"
                      className="settings-input"
                      value={telegramTokenDraft}
                      placeholder="123456:ABCDEF..."
                      onChange={(event) => setTelegramTokenDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="telegram-allowlist">
                    Allowed user IDs (comma-separated)
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="telegram-allowlist"
                      className="settings-input"
                      value={telegramAllowedDraft}
                      placeholder="12345678,87654321"
                      onChange={(event) => setTelegramAllowedDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="telegram-chat">
                    Default chat ID (optional)
                  </label>
                  <div className="settings-field-row">
                    <input
                      id="telegram-chat"
                      className="settings-input"
                      value={telegramChatDraft}
                      placeholder="-1001234567890"
                      onChange={(event) => setTelegramChatDraft(event.target.value)}
                    />
                  </div>
                </div>
                <div className="settings-field-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSaveNatsTelegram}
                    disabled={isSavingCloudSettings}
                  >
                    {isSavingCloudSettings ? "Saving..." : "Save transport settings"}
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
