import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import type {
  AgentProfile,
  AgentProfileApplyMode,
  AgentProfileMode,
  AppSettings,
  CliType,
  CodexDoctorResult,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  WorkspaceInfo,
} from "../../../../types";
import { FileEditorCard } from "../../../shared/components/FileEditorCard";
import {
  getWorkspaceCliArgsOverride,
  getWorkspaceCliBinOverride,
  getWorkspaceCliHomeOverride,
  normalizeOverrideValue,
  withWorkspaceCliArgsOverride,
  withWorkspaceCliHomeOverride,
} from "../../utils/cliBackend";

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
  remoteHostDraft: string;
  remoteTokenDraft: string;
  orbitWsUrlDraft: string;
  orbitAuthUrlDraft: string;
  orbitRunnerNameDraft: string;
  orbitAccessClientIdDraft: string;
  orbitAccessClientSecretRefDraft: string;
  orbitStatusText: string | null;
  orbitAuthCode: string | null;
  orbitVerificationUrl: string | null;
  orbitBusyAction: string | null;
  tailscaleStatus: TailscaleStatus | null;
  tailscaleStatusBusy: boolean;
  tailscaleStatusError: string | null;
  tailscaleCommandPreview: TailscaleDaemonCommandPreview | null;
  tailscaleCommandBusy: boolean;
  tailscaleCommandError: string | null;
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
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitWsUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAuthUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitRunnerNameDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientIdDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientSecretRefDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onSetCodexBinOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onSetCodexHomeOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onSetCodexArgsOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onChangeRemoteProvider: (provider: AppSettings["remoteBackendProvider"]) => Promise<void>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onCommitOrbitWsUrl: () => Promise<void>;
  onCommitOrbitAuthUrl: () => Promise<void>;
  onCommitOrbitRunnerName: () => Promise<void>;
  onCommitOrbitAccessClientId: () => Promise<void>;
  onCommitOrbitAccessClientSecretRef: () => Promise<void>;
  onOrbitConnectTest: () => void;
  onOrbitSignIn: () => void;
  onOrbitSignOut: () => void;
  onOrbitRunnerStart: () => void;
  onOrbitRunnerStop: () => void;
  onOrbitRunnerStatus: () => void;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceInfo["settings"]>,
  ) => Promise<void>;
  agentProfilesWorkspaceId: string | null;
  agentProfilesWorkspacePath: string | null;
  agentProfilesLoading: boolean;
  agentProfilesApplying: boolean;
  agentProfilesError: string | null;
  agentProfiles: AgentProfile[];
  activeAgentProfile: string | null;
  activeAgentProfileMode: AgentProfileMode | null;
  agentProfileTargetFile: "AGENTS.md" | "CLAUDE.md";
  selectedAgentProfile: string;
  onSetAgentProfilesWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetSelectedAgentProfile: Dispatch<SetStateAction<string>>;
  onRefreshAgentProfiles: () => void;
  onApplyAgentProfile: (mode?: AgentProfileApplyMode) => void;
};

const cliLabel = (cliType: CliType) => {
  switch (cliType) {
    case "gemini":
      return "Gemini CLI";
    case "cursor":
      return "Cursor CLI";
    case "claude":
      return "Claude Code";
    default:
      return "Agent CLI";
  }
};

export function SettingsCodexSection({
  appSettings,
  onUpdateAppSettings,
  codexPathDraft,
  codexArgsDraft,
  codexDirty,
  isSavingSettings,
  doctorState,
  remoteHostDraft,
  remoteTokenDraft,
  orbitWsUrlDraft,
  orbitAuthUrlDraft,
  orbitRunnerNameDraft,
  orbitAccessClientIdDraft,
  orbitAccessClientSecretRefDraft,
  orbitStatusText,
  orbitAuthCode,
  orbitVerificationUrl,
  orbitBusyAction,
  tailscaleStatus,
  tailscaleStatusBusy,
  tailscaleStatusError,
  tailscaleCommandPreview,
  tailscaleCommandBusy,
  tailscaleCommandError,
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
  onSetRemoteHostDraft,
  onSetRemoteTokenDraft,
  onSetOrbitWsUrlDraft,
  onSetOrbitAuthUrlDraft,
  onSetOrbitRunnerNameDraft,
  onSetOrbitAccessClientIdDraft,
  onSetOrbitAccessClientSecretRefDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onSetCodexBinOverrideDrafts,
  onSetCodexHomeOverrideDrafts,
  onSetCodexArgsOverrideDrafts,
  onBrowseCodex,
  onSaveCodexSettings,
  onRunDoctor,
  onCommitRemoteHost,
  onCommitRemoteToken,
  onChangeRemoteProvider,
  onRefreshTailscaleStatus,
  onRefreshTailscaleCommandPreview,
  onUseSuggestedTailscaleHost,
  onCommitOrbitWsUrl,
  onCommitOrbitAuthUrl,
  onCommitOrbitRunnerName,
  onCommitOrbitAccessClientId,
  onCommitOrbitAccessClientSecretRef,
  onOrbitConnectTest,
  onOrbitSignIn,
  onOrbitSignOut,
  onOrbitRunnerStart,
  onOrbitRunnerStop,
  onOrbitRunnerStatus,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
  onUpdateWorkspaceCodexBin,
  onUpdateWorkspaceSettings,
  agentProfilesWorkspaceId,
  agentProfilesWorkspacePath,
  agentProfilesLoading,
  agentProfilesApplying,
  agentProfilesError,
  agentProfiles,
  activeAgentProfile,
  activeAgentProfileMode,
  agentProfileTargetFile,
  selectedAgentProfile,
  onSetAgentProfilesWorkspaceId,
  onSetSelectedAgentProfile,
  onRefreshAgentProfiles,
  onApplyAgentProfile,
}: SettingsCodexSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">CLI Backend</div>
      <div className="settings-section-subtitle">
        Configure the active agent CLI and validate the install.
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="active-cli">
          Active CLI
        </label>
        <select
          id="active-cli"
          className="settings-select"
          value={appSettings.cliType}
          onChange={(event) => {
            void onUpdateAppSettings({
              ...appSettings,
              cliType: event.target.value as AppSettings["cliType"],
            });
          }}
        >
          <option value="codex">Agent CLI</option>
          <option value="gemini">Gemini CLI</option>
          <option value="cursor">Cursor CLI</option>
          <option value="claude">Claude Code</option>
        </select>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="agent-profile-workspace">
          Agent profile workspace
        </label>
        <select
          id="agent-profile-workspace"
          className="settings-select"
          value={agentProfilesWorkspaceId ?? ""}
          onChange={(event) => onSetAgentProfilesWorkspaceId(event.target.value || null)}
        >
          <option value="" disabled>
            Select workspace
          </option>
          {projects.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        {agentProfilesWorkspacePath && (
          <div className="settings-help">
            Applies in <code>{agentProfilesWorkspacePath}</code>
          </div>
        )}
        <label className="settings-field-label" htmlFor="agent-profile-select">
          {agentProfileTargetFile} profile
        </label>
        <div className="settings-field-row">
          <select
            id="agent-profile-select"
            className="settings-select"
            value={selectedAgentProfile}
            onChange={(event) => onSetSelectedAgentProfile(event.target.value)}
            disabled={agentProfilesLoading || agentProfiles.length === 0}
          >
            <option value="" disabled>
              {agentProfilesLoading
                ? "Loading profiles..."
                : agentProfiles.length === 0
                  ? "No profiles found"
                  : "Select profile"}
            </option>
            {agentProfiles
              .filter((profile) =>
                agentProfileTargetFile === "CLAUDE.md" ? profile.hasClaude : profile.hasAgents,
              )
              .map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.label}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={onRefreshAgentProfiles}
            disabled={agentProfilesLoading || !agentProfilesWorkspaceId}
          >
            Refresh
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onApplyAgentProfile("auto")}
            disabled={
              agentProfilesApplying ||
              !agentProfilesWorkspaceId ||
              !selectedAgentProfile ||
              agentProfiles.length === 0
            }
          >
            {agentProfilesApplying ? "Applying..." : "Apply"}
          </button>
        </div>
        {activeAgentProfile && (
          <div className="settings-help">
            Active profile: <code>{activeAgentProfile}</code>
            {activeAgentProfileMode ? ` (${activeAgentProfileMode})` : ""}
          </div>
        )}
        {agentProfilesError && <div className="settings-help settings-error">{agentProfilesError}</div>}
        <div className="settings-help">
          Uses <code>CLAUDE.md</code> for Claude Code and <code>AGENTS.md</code> for other CLIs.
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          Default Agent path
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
            Browse
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexPathDraft("")}
          >
            Use PATH
          </button>
        </div>
        <div className="settings-help">Leave empty to use the system PATH resolution.</div>
        <label className="settings-field-label" htmlFor="codex-args">
          Default Agent args
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
            Clear
          </button>
        </div>
        <div className="settings-help">
          Extra flags passed before <code>app-server</code>. Use quotes for values with spaces.
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
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok
                ? `${cliLabel(appSettings.cliType)} looks good`
                : `${cliLabel(appSettings.cliType)} issue detected`}
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

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="backend-mode">
          Backend mode
        </label>
        <select
          id="backend-mode"
          className="settings-select"
          value={appSettings.backendMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              backendMode: event.target.value as AppSettings["backendMode"],
            })
          }
        >
          <option value="local">Local (default)</option>
          <option value="remote">Remote (daemon)</option>
        </select>
        <div className="settings-help">
          Remote mode connects to a separate daemon running the backend on another machine (e.g.
          WSL2/Linux).
        </div>
      </div>

      {appSettings.backendMode === "remote" && (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="remote-provider">
              Remote provider
            </label>
            <select
              id="remote-provider"
              className="settings-select"
              value={appSettings.remoteBackendProvider}
              onChange={(event) => {
                void onChangeRemoteProvider(
                  event.target.value as AppSettings["remoteBackendProvider"],
                );
              }}
              aria-label="Remote provider"
            >
              <option value="tcp">TCP (wip)</option>
              <option value="orbit">Orbit (wip)</option>
            </select>
            <div className="settings-help">
              Use TCP for host:port daemon access, or Orbit for self-hosted Cloudflare relay
              sessions.
            </div>
          </div>

          {appSettings.remoteBackendProvider === "tcp" && (
            <div className="settings-field">
              <div className="settings-field-label">Remote backend</div>
              <div className="settings-field-row">
                <input
                  className="settings-input settings-input--compact"
                  value={remoteHostDraft}
                  placeholder="127.0.0.1:4732"
                  onChange={(event) => onSetRemoteHostDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitRemoteHost();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitRemoteHost();
                    }
                  }}
                  aria-label="Remote backend host"
                />
                <input
                  type="password"
                  className="settings-input settings-input--compact"
                  value={remoteTokenDraft}
                  placeholder="Token (optional)"
                  onChange={(event) => onSetRemoteTokenDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitRemoteToken();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitRemoteToken();
                    }
                  }}
                  aria-label="Remote backend token"
                />
              </div>
              <div className="settings-help">
                Start the daemon separately and point CodexMonitor to it (host:port + token).
              </div>
              <div className="settings-field">
                <div className="settings-field-label">Tailscale helper</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onRefreshTailscaleStatus}
                    disabled={tailscaleStatusBusy}
                  >
                    {tailscaleStatusBusy ? "Checking..." : "Detect Tailscale"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onRefreshTailscaleCommandPreview}
                    disabled={tailscaleCommandBusy}
                  >
                    {tailscaleCommandBusy ? "Refreshing..." : "Refresh daemon command"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    disabled={!tailscaleStatus?.suggestedRemoteHost}
                    onClick={() => {
                      void onUseSuggestedTailscaleHost();
                    }}
                  >
                    Use suggested host
                  </button>
                </div>
                {tailscaleStatusError && (
                  <div className="settings-help settings-help-error">{tailscaleStatusError}</div>
                )}
                {tailscaleStatus && (
                  <>
                    <div className="settings-help">{tailscaleStatus.message}</div>
                    <div className="settings-help">
                      {tailscaleStatus.installed
                        ? `Version: ${tailscaleStatus.version ?? "unknown"}`
                        : "Install Tailscale on both desktop and iOS to continue."}
                    </div>
                    {tailscaleStatus.suggestedRemoteHost && (
                      <div className="settings-help">
                        Suggested remote host: <code>{tailscaleStatus.suggestedRemoteHost}</code>
                      </div>
                    )}
                    {tailscaleStatus.tailnetName && (
                      <div className="settings-help">
                        Tailnet: <code>{tailscaleStatus.tailnetName}</code>
                      </div>
                    )}
                  </>
                )}
                {tailscaleCommandError && (
                  <div className="settings-help settings-help-error">{tailscaleCommandError}</div>
                )}
                {tailscaleCommandPreview && (
                  <>
                    <div className="settings-help">
                      Run this command on the desktop host to start the daemon on your tailnet:
                    </div>
                    <pre className="settings-command-preview">
                      <code>{tailscaleCommandPreview.command}</code>
                    </pre>
                    <div className="settings-help">
                      Use the same value as <code>Remote backend token</code>.
                    </div>
                    {!tailscaleCommandPreview.tokenConfigured && (
                      <div className="settings-help settings-help-error">
                        Remote backend token is empty. Set one before exposing daemon access.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {appSettings.remoteBackendProvider === "orbit" && (
            <>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="orbit-ws-url">
                  Orbit websocket URL
                </label>
                <input
                  id="orbit-ws-url"
                  className="settings-input settings-input--compact"
                  value={orbitWsUrlDraft}
                  placeholder="wss://..."
                  onChange={(event) => onSetOrbitWsUrlDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitOrbitWsUrl();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitOrbitWsUrl();
                    }
                  }}
                  aria-label="Orbit websocket URL"
                />
              </div>

              <div className="settings-field">
                <label className="settings-field-label" htmlFor="orbit-auth-url">
                  Orbit auth URL
                </label>
                <input
                  id="orbit-auth-url"
                  className="settings-input settings-input--compact"
                  value={orbitAuthUrlDraft}
                  placeholder="https://..."
                  onChange={(event) => onSetOrbitAuthUrlDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitOrbitAuthUrl();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitOrbitAuthUrl();
                    }
                  }}
                  aria-label="Orbit auth URL"
                />
              </div>

              <div className="settings-field">
                <label className="settings-field-label" htmlFor="orbit-runner-name">
                  Orbit runner name
                </label>
                <input
                  id="orbit-runner-name"
                  className="settings-input settings-input--compact"
                  value={orbitRunnerNameDraft}
                  placeholder="codex-monitor"
                  onChange={(event) => onSetOrbitRunnerNameDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitOrbitRunnerName();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitOrbitRunnerName();
                    }
                  }}
                  aria-label="Orbit runner name"
                />
              </div>

              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-title">Auto start runner</div>
                  <div className="settings-toggle-subtitle">
                    Start the Orbit runner automatically when remote mode activates.
                  </div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${appSettings.orbitAutoStartRunner ? "on" : ""}`}
                  onClick={() =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      orbitAutoStartRunner: !appSettings.orbitAutoStartRunner,
                    })
                  }
                  aria-pressed={appSettings.orbitAutoStartRunner}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>

              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-title">Use Orbit Access</div>
                  <div className="settings-toggle-subtitle">
                    Enable OAuth client credentials for Orbit Access.
                  </div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${appSettings.orbitUseAccess ? "on" : ""}`}
                  onClick={() =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      orbitUseAccess: !appSettings.orbitUseAccess,
                    })
                  }
                  aria-pressed={appSettings.orbitUseAccess}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>

              <div className="settings-field">
                <label className="settings-field-label" htmlFor="orbit-access-client-id">
                  Orbit access client ID
                </label>
                <input
                  id="orbit-access-client-id"
                  className="settings-input settings-input--compact"
                  value={orbitAccessClientIdDraft}
                  placeholder="client-id"
                  disabled={!appSettings.orbitUseAccess}
                  onChange={(event) => onSetOrbitAccessClientIdDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitOrbitAccessClientId();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitOrbitAccessClientId();
                    }
                  }}
                  aria-label="Orbit access client ID"
                />
              </div>

              <div className="settings-field">
                <label
                  className="settings-field-label"
                  htmlFor="orbit-access-client-secret-ref"
                >
                  Orbit access client secret ref
                </label>
                <input
                  id="orbit-access-client-secret-ref"
                  className="settings-input settings-input--compact"
                  value={orbitAccessClientSecretRefDraft}
                  placeholder="secret-ref"
                  disabled={!appSettings.orbitUseAccess}
                  onChange={(event) => onSetOrbitAccessClientSecretRefDraft(event.target.value)}
                  onBlur={() => {
                    void onCommitOrbitAccessClientSecretRef();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCommitOrbitAccessClientSecretRef();
                    }
                  }}
                  aria-label="Orbit access client secret ref"
                />
              </div>

              <div className="settings-field">
                <div className="settings-field-label">Orbit actions</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitConnectTest}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "connect-test" ? "Testing..." : "Connect test"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitSignIn}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "sign-in" ? "Signing In..." : "Sign In"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitSignOut}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "sign-out" ? "Signing Out..." : "Sign Out"}
                  </button>
                </div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitRunnerStart}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "runner-start" ? "Starting..." : "Start Runner"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitRunnerStop}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "runner-stop" ? "Stopping..." : "Stop Runner"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onOrbitRunnerStatus}
                    disabled={orbitBusyAction !== null}
                  >
                    {orbitBusyAction === "runner-status" ? "Refreshing..." : "Refresh Status"}
                  </button>
                </div>
                {orbitStatusText && <div className="settings-help">{orbitStatusText}</div>}
                {orbitAuthCode && (
                  <div className="settings-help">
                    Auth code: <code>{orbitAuthCode}</code>
                  </div>
                )}
                {orbitVerificationUrl && (
                  <div className="settings-help">
                    Verification URL:{" "}
                    <a href={orbitVerificationUrl} target="_blank" rel="noreferrer">
                      {orbitVerificationUrl}
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      <FileEditorCard
        title="Global AGENTS.md"
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder="Add global instructions for Codex agents…"
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            Stored at <code>~/.codex/AGENTS.md</code>.
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
        placeholder="Edit the global Codex config.toml…"
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            Stored at <code>~/.codex/config.toml</code>.
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
        <div className="settings-field-label">Workspace overrides</div>
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
                    placeholder="Agent binary override"
                    onChange={(event) =>
                      onSetCodexBinOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexBinOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (
                        nextValue ===
                        getWorkspaceCliBinOverride(workspace, appSettings.cliType)
                      ) {
                        return;
                      }
                      await onUpdateWorkspaceCodexBin(workspace.id, nextValue);
                    }}
                    aria-label={`Agent binary override for ${workspace.name}`}
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
                    Clear
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexHomeOverrideDrafts[workspace.id] ?? ""}
                    placeholder="Agent home override"
                    onChange={(event) =>
                      onSetCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexHomeOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (
                        nextValue ===
                        getWorkspaceCliHomeOverride(workspace, appSettings.cliType)
                      ) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(
                        workspace.id,
                        withWorkspaceCliHomeOverride(appSettings.cliType, nextValue),
                      );
                    }}
                    aria-label={`Agent home override for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      onSetCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(
                        workspace.id,
                        withWorkspaceCliHomeOverride(appSettings.cliType, null),
                      );
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexArgsOverrideDrafts[workspace.id] ?? ""}
                    placeholder="Agent args override"
                    onChange={(event) =>
                      onSetCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexArgsOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (
                        nextValue ===
                        getWorkspaceCliArgsOverride(workspace, appSettings.cliType)
                      ) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(
                        workspace.id,
                        withWorkspaceCliArgsOverride(appSettings.cliType, nextValue),
                      );
                    }}
                    aria-label={`Agent args override for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      onSetCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(
                        workspace.id,
                        withWorkspaceCliArgsOverride(appSettings.cliType, null),
                      );
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="settings-empty">No projects yet.</div>}
        </div>
      </div>
    </section>
  );
}
