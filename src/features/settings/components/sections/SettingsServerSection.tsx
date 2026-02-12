import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";

type SettingsServerSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  isMobilePlatform: boolean;
  mobileConnectBusy: boolean;
  mobileConnectStatusText: string | null;
  mobileConnectStatusError: boolean;
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
  tcpDaemonStatus: TcpDaemonStatus | null;
  tcpDaemonBusyAction: "start" | "stop" | "status" | null;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitWsUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAuthUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitRunnerNameDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientIdDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientSecretRefDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onChangeRemoteProvider: (provider: AppSettings["remoteBackendProvider"]) => Promise<void>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onTcpDaemonStart: () => Promise<void>;
  onTcpDaemonStop: () => Promise<void>;
  onTcpDaemonStatus: () => Promise<void>;
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
  onMobileConnectTest: () => void;
};

export function SettingsServerSection({
  appSettings,
  onUpdateAppSettings,
  isMobilePlatform,
  mobileConnectBusy,
  mobileConnectStatusText,
  mobileConnectStatusError,
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
  tcpDaemonStatus,
  tcpDaemonBusyAction,
  onSetRemoteHostDraft,
  onSetRemoteTokenDraft,
  onSetOrbitWsUrlDraft,
  onSetOrbitAuthUrlDraft,
  onSetOrbitRunnerNameDraft,
  onSetOrbitAccessClientIdDraft,
  onSetOrbitAccessClientSecretRefDraft,
  onCommitRemoteHost,
  onCommitRemoteToken,
  onChangeRemoteProvider,
  onRefreshTailscaleStatus,
  onRefreshTailscaleCommandPreview,
  onUseSuggestedTailscaleHost,
  onTcpDaemonStart,
  onTcpDaemonStop,
  onTcpDaemonStatus,
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
  onMobileConnectTest,
}: SettingsServerSectionProps) {
  const isMobileSimplified = isMobilePlatform;
  const tcpRunnerStatusText = (() => {
    if (!tcpDaemonStatus) {
      return null;
    }
    if (tcpDaemonStatus.state === "running") {
      return tcpDaemonStatus.pid
        ? `Mobile daemon is running (pid ${tcpDaemonStatus.pid}) on ${tcpDaemonStatus.listenAddr ?? "configured listen address"}.`
        : `Mobile daemon is running on ${tcpDaemonStatus.listenAddr ?? "configured listen address"}.`;
    }
    if (tcpDaemonStatus.state === "error") {
      return tcpDaemonStatus.lastError ?? "Mobile daemon is in an error state.";
    }
    return `Mobile daemon is stopped${tcpDaemonStatus.listenAddr ? ` (${tcpDaemonStatus.listenAddr})` : ""}.`;
  })();

  return (
    <section className="settings-section">
      <div className="settings-section-title">Server</div>
      <div className="settings-section-subtitle">
        {isMobileSimplified
          ? "Choose TCP or Orbit, fill in the connection endpoint and token from your desktop setup, then run a connection test."
          : "Configure how CodexMonitor exposes backend access for mobile and remote clients. Desktop usage remains local unless you explicitly connect through remote mode."}
      </div>

      {!isMobileSimplified && (
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
            Local keeps desktop requests in-process. Remote routes desktop requests through the same
            network transport path used by mobile clients.
          </div>
        </div>
      )}

      <>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="remote-provider">
            {isMobileSimplified ? "Connection type" : "Remote provider"}
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
            aria-label={isMobileSimplified ? "Connection type" : "Remote provider"}
          >
            <option value="tcp">{isMobileSimplified ? "TCP" : "TCP (wip)"}</option>
            <option value="orbit">{isMobileSimplified ? "Orbit" : "Orbit (wip)"}</option>
          </select>
          <div className="settings-help">
            {isMobileSimplified
              ? "TCP uses your desktop daemon Tailscale address. Orbit uses your Orbit websocket endpoint."
              : "Select which remote transport configuration to maintain for mobile access and optional desktop remote-mode testing."}
          </div>
        </div>

        {!isMobileSimplified && (
          <div className="settings-toggle-row">
            <div>
              <div className="settings-toggle-title">Keep daemon running after app closes</div>
              <div className="settings-toggle-subtitle">
                If disabled, CodexMonitor stops managed TCP and Orbit daemon processes before exit.
              </div>
            </div>
            <button
              type="button"
              className={`settings-toggle ${appSettings.keepDaemonRunningAfterAppClose ? "on" : ""}`}
              onClick={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  keepDaemonRunningAfterAppClose: !appSettings.keepDaemonRunningAfterAppClose,
                })
              }
              aria-pressed={appSettings.keepDaemonRunningAfterAppClose}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        )}

        {appSettings.remoteBackendProvider === "tcp" && (
          <>
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
                  placeholder="Token (required)"
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
                {isMobileSimplified
                  ? "Use the Tailscale host from your desktop CodexMonitor app (Server section), for example `macbook.your-tailnet.ts.net:4732`."
                  : "This host/token is used by mobile clients and desktop remote-mode testing."}
              </div>
            </div>

            {isMobileSimplified && (
              <div className="settings-field">
                <div className="settings-field-label">Connection test</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onMobileConnectTest}
                    disabled={mobileConnectBusy}
                  >
                    {mobileConnectBusy ? "Connecting..." : "Connect & test"}
                  </button>
                </div>
                {mobileConnectStatusText && (
                  <div
                    className={`settings-help${mobileConnectStatusError ? " settings-help-error" : ""}`}
                  >
                    {mobileConnectStatusText}
                  </div>
                )}
                <div className="settings-help">
                  Make sure your desktop app daemon is running and reachable on Tailscale, then
                  retry this test.
                </div>
              </div>
            )}

            {!isMobileSimplified && (
              <div className="settings-field">
                <div className="settings-field-label">Mobile access daemon</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStart();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "start" ? "Starting..." : "Start daemon"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStop();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "stop" ? "Stopping..." : "Stop daemon"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStatus();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "status" ? "Refreshing..." : "Refresh status"}
                  </button>
                </div>
                {tcpRunnerStatusText && <div className="settings-help">{tcpRunnerStatusText}</div>}
                {tcpDaemonStatus?.startedAtMs && (
                  <div className="settings-help">
                    Started at: {new Date(tcpDaemonStatus.startedAtMs).toLocaleString()}
                  </div>
                )}
                <div className="settings-help">
                  Start this daemon before connecting from iOS. It uses your current token and
                  listens on <code>0.0.0.0:&lt;port&gt;</code>, matching your configured host port.
                </div>
              </div>
            )}

            {!isMobileSimplified && (
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
                      Command template (manual fallback) for starting the daemon:
                    </div>
                    <pre className="settings-command-preview">
                      <code>{tailscaleCommandPreview.command}</code>
                    </pre>
                    {!tailscaleCommandPreview.tokenConfigured && (
                      <div className="settings-help settings-help-error">
                        Remote backend token is empty. Set one before exposing daemon access.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
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

            {isMobileSimplified && (
              <>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="orbit-token-mobile">
                    Remote backend token
                  </label>
                  <input
                    id="orbit-token-mobile"
                    type="password"
                    className="settings-input settings-input--compact"
                    value={remoteTokenDraft}
                    placeholder="Token (required)"
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
                  <div className="settings-help">
                    Use the same token configured on your desktop Orbit daemon setup.
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">Connection test</div>
                  <div className="settings-field-row">
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onMobileConnectTest}
                      disabled={mobileConnectBusy}
                    >
                      {mobileConnectBusy ? "Connecting..." : "Connect & test"}
                    </button>
                  </div>
                  {mobileConnectStatusText && (
                    <div
                      className={`settings-help${mobileConnectStatusError ? " settings-help-error" : ""}`}
                    >
                      {mobileConnectStatusText}
                    </div>
                  )}
                  <div className="settings-help">
                    Make sure the Orbit endpoint and token match your desktop setup, then retry.
                  </div>
                </div>
              </>
            )}

            {!isMobileSimplified && (
              <>
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
                  <label className="settings-field-label" htmlFor="orbit-access-client-secret-ref">
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
      </>

      <div className="settings-help">
        {isMobileSimplified
          ? appSettings.remoteBackendProvider === "tcp"
            ? "Use your own infrastructure only. On iOS, get the Tailscale hostname and token from your desktop CodexMonitor setup."
            : "Use your own infrastructure only. On iOS, use the Orbit websocket URL and token configured on your desktop CodexMonitor setup."
          : "Mobile access should stay scoped to your own infrastructure (tailnet or self-hosted Orbit). CodexMonitor does not provide hosted backend services."}
      </div>
    </section>
  );
}
