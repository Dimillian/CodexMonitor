import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import X from "lucide-react/dist/esm/icons/x";
import type {
  AppSettings,
  CloudflareTunnelStatus,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type AddRemoteBackendDraft = {
  name: string;
  provider: AppSettings["remoteBackendProvider"];
  host: string;
  token: string;
};

type DesktopServerMode = "local" | "private-tcp" | "public-wss";
type WizardStepState = "done" | "active" | "pending" | "error";

type SettingsServerSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  isMobilePlatform: boolean;
  mobileConnectBusy: boolean;
  mobileConnectStatusText: string | null;
  mobileConnectStatusError: boolean;
  remoteBackends: AppSettings["remoteBackends"];
  activeRemoteBackendId: string | null;
  remoteStatusText: string | null;
  remoteStatusError: boolean;
  remoteNameError: string | null;
  remoteHostError: string | null;
  remoteNameDraft: string;
  remoteProviderDraft: AppSettings["remoteBackendProvider"];
  remoteHostDraft: string;
  remoteTokenDraft: string;
  nextRemoteNameSuggestion: string;
  tailscaleStatus: TailscaleStatus | null;
  tailscaleStatusBusy: boolean;
  tailscaleStatusError: string | null;
  tailscaleCommandPreview: TailscaleDaemonCommandPreview | null;
  tailscaleCommandBusy: boolean;
  tailscaleCommandError: string | null;
  tcpDaemonStatus: TcpDaemonStatus | null;
  tcpDaemonBusyAction: "start" | "stop" | "status" | null;
  cloudflareTunnelStatus: CloudflareTunnelStatus | null;
  cloudflareTunnelBusyAction: "start" | "stop" | "status" | "setup" | "install" | null;
  onSetRemoteNameDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteProviderDraft: Dispatch<SetStateAction<AppSettings["remoteBackendProvider"]>>;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteName: () => Promise<void>;
  onCommitRemoteProvider: (
    nextProvider?: AppSettings["remoteBackendProvider"],
  ) => Promise<void>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onSetBackendMode: (nextMode: AppSettings["backendMode"]) => Promise<void>;
  onSelectRemoteBackend: (id: string) => Promise<void>;
  onAddRemoteBackend: (draft: AddRemoteBackendDraft) => Promise<void>;
  onMoveRemoteBackend: (id: string, direction: "up" | "down") => Promise<void>;
  onDeleteRemoteBackend: (id: string) => Promise<void>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onTcpDaemonStart: () => Promise<void>;
  onTcpDaemonStop: () => Promise<void>;
  onTcpDaemonStatus: () => Promise<void>;
  onCloudflareTunnelStart: () => Promise<void>;
  onCloudflareTunnelStop: () => Promise<void>;
  onCloudflareTunnelStatus: () => Promise<void>;
  onCloudflareTunnelInstall: () => Promise<void>;
  onGenerateRemotePassword: () => Promise<void>;
  onApplySuggestedWssUrl: () => Promise<void>;
  onOneClickWssSetup: () => Promise<void>;
  onMobileConnectTest: () => void;
};

export function SettingsServerSection({
  appSettings,
  onUpdateAppSettings,
  isMobilePlatform,
  mobileConnectBusy,
  mobileConnectStatusText,
  mobileConnectStatusError,
  remoteBackends,
  activeRemoteBackendId,
  remoteStatusText,
  remoteStatusError,
  remoteNameError,
  remoteHostError,
  remoteNameDraft,
  remoteProviderDraft,
  remoteHostDraft,
  remoteTokenDraft,
  nextRemoteNameSuggestion,
  tailscaleStatus,
  tailscaleStatusBusy,
  tailscaleStatusError,
  tailscaleCommandPreview,
  tailscaleCommandBusy,
  tailscaleCommandError,
  tcpDaemonStatus,
  tcpDaemonBusyAction,
  cloudflareTunnelStatus,
  cloudflareTunnelBusyAction,
  onSetRemoteNameDraft,
  onSetRemoteProviderDraft,
  onSetRemoteHostDraft,
  onSetRemoteTokenDraft,
  onCommitRemoteName,
  onCommitRemoteProvider,
  onCommitRemoteHost,
  onCommitRemoteToken,
  onSetBackendMode,
  onSelectRemoteBackend,
  onAddRemoteBackend,
  onMoveRemoteBackend,
  onDeleteRemoteBackend,
  onRefreshTailscaleStatus,
  onRefreshTailscaleCommandPreview,
  onUseSuggestedTailscaleHost,
  onTcpDaemonStart,
  onTcpDaemonStop,
  onTcpDaemonStatus,
  onCloudflareTunnelStart,
  onCloudflareTunnelStop,
  onCloudflareTunnelStatus,
  onCloudflareTunnelInstall,
  onGenerateRemotePassword,
  onApplySuggestedWssUrl,
  onOneClickWssSetup,
  onMobileConnectTest,
}: SettingsServerSectionProps) {
  const [pendingDeleteRemoteId, setPendingDeleteRemoteId] = useState<string | null>(
    null,
  );
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const [addRemoteBusy, setAddRemoteBusy] = useState(false);
  const [addRemoteError, setAddRemoteError] = useState<string | null>(null);
  const [serverModeError, setServerModeError] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenActionMessage, setTokenActionMessage] = useState<string | null>(null);
  const [tokenActionError, setTokenActionError] = useState(false);
  const [wssActionMessage, setWssActionMessage] = useState<string | null>(null);
  const [wssActionError, setWssActionError] = useState(false);
  const [addRemoteNameDraft, setAddRemoteNameDraft] = useState("");
  const [addRemoteProviderDraft, setAddRemoteProviderDraft] =
    useState<AppSettings["remoteBackendProvider"]>("tcp");
  const [addRemoteHostDraft, setAddRemoteHostDraft] = useState("");
  const [addRemoteTokenDraft, setAddRemoteTokenDraft] = useState("");
  const isMobileSimplified = isMobilePlatform;
  const pendingDeleteRemote = useMemo(
    () =>
      pendingDeleteRemoteId == null
        ? null
        : remoteBackends.find((entry) => entry.id === pendingDeleteRemoteId) ?? null,
    [pendingDeleteRemoteId, remoteBackends],
  );
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
  const remoteHostPlaceholder =
    remoteProviderDraft === "wss" ? "wss://codex.example.com/daemon" : "127.0.0.1:4732";
  const addRemoteHostPlaceholder =
    addRemoteProviderDraft === "wss"
      ? "wss://codex.example.com/daemon"
      : "macbook.your-tailnet.ts.net:4732";
  const cloudflareTunnelStatusText = (() => {
    if (!cloudflareTunnelStatus) {
      return null;
    }
    if (cloudflareTunnelStatus.state === "running") {
      if (cloudflareTunnelStatus.suggestedWssUrl) {
        return `Cloudflare tunnel is running: ${cloudflareTunnelStatus.suggestedWssUrl}`;
      }
      return "Cloudflare tunnel is running. Waiting for public URL.";
    }
    if (cloudflareTunnelStatus.state === "error") {
      return cloudflareTunnelStatus.lastError ?? "Cloudflare tunnel is in an error state.";
    }
    return "Cloudflare tunnel is stopped.";
  })();
  const desktopServerMode: DesktopServerMode = useMemo(() => {
    if (appSettings.backendMode === "local") {
      return "local";
    }
    return remoteProviderDraft === "wss" ? "public-wss" : "private-tcp";
  }, [appSettings.backendMode, remoteProviderDraft]);
  const desktopIsLocalMode = !isMobileSimplified && desktopServerMode === "local";
  const desktopIsPrivateMode = !isMobileSimplified && desktopServerMode === "private-tcp";
  const desktopIsPublicMode = !isMobileSimplified && desktopServerMode === "public-wss";
  const tokenConfigured = remoteTokenDraft.trim().length > 0;
  const daemonRunning = tcpDaemonStatus?.state === "running";
  const daemonFailed = tcpDaemonStatus?.state === "error";
  const cloudflareInstalled = cloudflareTunnelStatus?.installed ?? false;
  const cloudflareRunning = cloudflareTunnelStatus?.state === "running";
  const cloudflareFailed = cloudflareTunnelStatus?.state === "error";
  const suggestedWssUrl = cloudflareTunnelStatus?.suggestedWssUrl?.trim() ?? "";
  const tunnelUrlReady = suggestedWssUrl.length > 0;
  const tunnelUrlApplied =
    tunnelUrlReady &&
    remoteProviderDraft === "wss" &&
    remoteHostDraft.trim() === suggestedWssUrl;

  const openAddRemoteModal = () => {
    setAddRemoteError(null);
    setAddRemoteNameDraft(nextRemoteNameSuggestion);
    setAddRemoteProviderDraft(remoteProviderDraft);
    setAddRemoteHostDraft(remoteHostDraft);
    setAddRemoteTokenDraft("");
    setAddRemoteOpen(true);
  };

  const closeAddRemoteModal = () => {
    if (addRemoteBusy) {
      return;
    }
    setAddRemoteOpen(false);
    setAddRemoteError(null);
  };

  const handleAddRemoteConfirm = () => {
    void (async () => {
      if (addRemoteBusy) {
        return;
      }
      setAddRemoteBusy(true);
      setAddRemoteError(null);
      try {
        await onAddRemoteBackend({
          name: addRemoteNameDraft,
          provider: addRemoteProviderDraft,
          host: addRemoteHostDraft,
          token: addRemoteTokenDraft,
        });
        setAddRemoteOpen(false);
      } catch (error) {
        setAddRemoteError(error instanceof Error ? error.message : "Unable to add remote.");
      } finally {
        setAddRemoteBusy(false);
      }
    })();
  };

  const handleSelectDesktopMode = (nextMode: DesktopServerMode) => {
    if (isMobileSimplified || desktopServerMode === nextMode) {
      return;
    }
    setServerModeError(null);
    void (async () => {
      if (nextMode === "local") {
        await onSetBackendMode("local");
        return;
      }
      const nextProvider: AppSettings["remoteBackendProvider"] =
        nextMode === "public-wss" ? "wss" : "tcp";
      await onCommitRemoteProvider(nextProvider);
      await onSetBackendMode("remote");
    })();
  };

  const handleCopyToken = () => {
    const token = remoteTokenDraft.trim();
    if (!token) {
      setTokenActionError(true);
      setTokenActionMessage("Set a token first, then copy.");
      return;
    }
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (!clipboard?.writeText) {
      setTokenActionError(true);
      setTokenActionMessage("Clipboard is unavailable in this runtime.");
      return;
    }
    void clipboard
      .writeText(token)
      .then(() => {
        setTokenActionError(false);
        setTokenActionMessage("Token copied.");
      })
      .catch(() => {
        setTokenActionError(true);
        setTokenActionMessage("Could not copy token. Copy manually.");
      });
  };

  const wizardStepStatus = (
    done: boolean,
    { active, error }: { active: boolean; error?: boolean },
  ): WizardStepState => {
    if (done) {
      return "done";
    }
    if (error) {
      return "error";
    }
    if (active) {
      return "active";
    }
    return "pending";
  };

  const wizardStepLabel = (state: WizardStepState) => {
    if (state === "done") {
      return "Done";
    }
    if (state === "active") {
      return "Next";
    }
    if (state === "error") {
      return "Fix";
    }
    return "Pending";
  };

  const cloudflareStep = wizardStepStatus(cloudflareRunning, {
    active: cloudflareInstalled && !cloudflareFailed,
    error: cloudflareFailed,
  });
  const daemonStep = wizardStepStatus(daemonRunning, {
    active: cloudflareRunning && !daemonFailed,
    error: daemonFailed,
  });
  const connectReady = tokenConfigured && daemonRunning && tunnelUrlReady;
  const connectStep = wizardStepStatus(connectReady, {
    active: daemonRunning && cloudflareRunning,
  });

  const handleCopyWssUrl = () => {
    if (!suggestedWssUrl) {
      setWssActionError(true);
      setWssActionMessage("Tunnel URL is not ready yet.");
      return;
    }
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (!clipboard?.writeText) {
      setWssActionError(true);
      setWssActionMessage("Clipboard is unavailable in this runtime.");
      return;
    }
    void clipboard
      .writeText(suggestedWssUrl)
      .then(() => {
        setWssActionError(false);
        setWssActionMessage("WSS URL copied.");
      })
      .catch(() => {
        setWssActionError(true);
        setWssActionMessage("Could not copy URL. Copy manually.");
      });
  };

  const handleApplyTunnelUrl = () => {
    if (!suggestedWssUrl) {
      setWssActionError(true);
      setWssActionMessage("Tunnel URL is not ready yet.");
      return;
    }
    void onApplySuggestedWssUrl()
      .then(() => {
        setWssActionError(false);
        setWssActionMessage("Tunnel URL applied to remote host.");
      })
      .catch((error) => {
        setWssActionError(true);
        setWssActionMessage(error instanceof Error ? error.message : "Could not apply tunnel URL.");
      });
  };

  return (
    <SettingsSection
      title="Server"
      subtitle={
        isMobileSimplified
          ? "Configure host/token from your desktop setup (TCP or WSS), then run a connection test."
          : "Configure how CodexMonitor exposes backend access for mobile and remote clients. Desktop usage remains local unless you explicitly connect through remote mode."
      }
    >

      {!isMobileSimplified && (
        <div className="settings-field">
          <div className="settings-field-label">Server mode</div>
          <div
            className="settings-server-mode-grid"
            role="radiogroup"
            aria-label="Server mode"
          >
            <button
              type="button"
              className={`settings-server-mode-card${desktopServerMode === "local" ? " is-active" : ""}`}
              role="radio"
              aria-checked={desktopServerMode === "local"}
              onClick={() => {
                handleSelectDesktopMode("local");
              }}
            >
              <div className="settings-server-mode-title">1. Local only</div>
              <div className="settings-server-mode-subtitle">
                Desktop runs in-process. No remote endpoint is exposed.
              </div>
            </button>
            <button
              type="button"
              className={`settings-server-mode-card${desktopServerMode === "private-tcp" ? " is-active" : ""}`}
              role="radio"
              aria-checked={desktopServerMode === "private-tcp"}
              onClick={() => {
                handleSelectDesktopMode("private-tcp");
              }}
            >
              <div className="settings-server-mode-title">2. Private TCP (Tailscale/LAN)</div>
              <div className="settings-server-mode-subtitle">
                Use host:port + token on private network.
              </div>
            </button>
            <button
              type="button"
              className={`settings-server-mode-card${desktopServerMode === "public-wss" ? " is-active" : ""}`}
              role="radio"
              aria-checked={desktopServerMode === "public-wss"}
              onClick={() => {
                handleSelectDesktopMode("public-wss");
              }}
            >
              <div className="settings-server-mode-title">3. Public WSS (Cloudflare tunnel)</div>
              <div className="settings-server-mode-subtitle">
                Expose daemon through a secure public WebSocket endpoint.
              </div>
            </button>
          </div>
          <div className="settings-help">
            Pick one mode. Only relevant controls are shown below for the selected mode.
          </div>
          {serverModeError && <div className="settings-help settings-help-error">{serverModeError}</div>}
        </div>
      )}

      <>
        {isMobileSimplified && (
          <>
            <div className="settings-field">
              <div className="settings-field-label">Saved remotes</div>
              <div className="settings-mobile-remotes" role="list" aria-label="Saved remotes">
                {remoteBackends.map((entry, index) => {
                  const isActive = entry.id === activeRemoteBackendId;
                  return (
                    <div
                      className={`settings-mobile-remote${isActive ? " is-active" : ""}`}
                      role="listitem"
                      key={entry.id}
                    >
                      <div className="settings-mobile-remote-main">
                        <div className="settings-mobile-remote-name-row">
                          <div className="settings-mobile-remote-name">{entry.name}</div>
                          {isActive && <span className="settings-mobile-remote-badge">Active</span>}
                        </div>
                        <div className="settings-mobile-remote-meta">
                          {entry.provider.toUpperCase()} · {entry.host}
                        </div>
                        <div className="settings-mobile-remote-last">
                          Last connected:{" "}
                          {typeof entry.lastConnectedAtMs === "number"
                            ? new Date(entry.lastConnectedAtMs).toLocaleString()
                            : "Never"}
                        </div>
                      </div>
                      <div className="settings-mobile-remote-actions">
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action"
                          onClick={() => {
                            void onSelectRemoteBackend(entry.id);
                          }}
                          disabled={isActive}
                          aria-label={`Use ${entry.name} remote`}
                        >
                          {isActive ? "Using" : "Use"}
                        </button>
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action"
                          onClick={() => {
                            void onMoveRemoteBackend(entry.id, "up");
                          }}
                          disabled={index === 0}
                          aria-label={`Move ${entry.name} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action"
                          onClick={() => {
                            void onMoveRemoteBackend(entry.id, "down");
                          }}
                          disabled={index === remoteBackends.length - 1}
                          aria-label={`Move ${entry.name} down`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action settings-mobile-remote-action-danger"
                          onClick={() => {
                            setPendingDeleteRemoteId(entry.id);
                          }}
                          aria-label={`Delete ${entry.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="settings-field-row">
                <button
                  type="button"
                  className="button settings-button-compact"
                  onClick={openAddRemoteModal}
                >
                  Add remote
                </button>
              </div>
              {remoteStatusText && (
                <div className={`settings-help${remoteStatusError ? " settings-help-error" : ""}`}>
                  {remoteStatusText}
                </div>
              )}
              <div className="settings-help">
                Switch the active remote here. The fields below edit the active entry.
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="mobile-remote-name">
                Remote name
              </label>
              <input
                id="mobile-remote-name"
                className="settings-input settings-input--compact"
                value={remoteNameDraft}
                placeholder="My desktop"
                onChange={(event) => onSetRemoteNameDraft(event.target.value)}
                onBlur={() => {
                  void onCommitRemoteName();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onCommitRemoteName();
                  }
                }}
              />
              {remoteNameError && <div className="settings-help settings-help-error">{remoteNameError}</div>}
            </div>
          </>
        )}

        {!isMobileSimplified && desktopIsLocalMode && (
          <div className="settings-server-mode-note">
            <div className="settings-server-mode-note-title">Local mode is active</div>
            <div className="settings-help">
              CodexMonitor will keep desktop requests local. Switch to mode 2 or 3 when you want
              phone/remote access.
            </div>
          </div>
        )}

        {!isMobileSimplified && !desktopIsLocalMode && (
          <>
            <SettingsToggleRow
              title="Keep daemon running after app closes"
              subtitle="If disabled, CodexMonitor stops managed daemon processes before exit."
            >
              <SettingsToggleSwitch
                pressed={appSettings.keepDaemonRunningAfterAppClose}
                onClick={() =>
                  void onUpdateAppSettings({
                    ...appSettings,
                    keepDaemonRunningAfterAppClose: !appSettings.keepDaemonRunningAfterAppClose,
                  })
                }
              />
            </SettingsToggleRow>
            {desktopIsPublicMode && (
              <SettingsToggleRow
                title="Keep tunnel running after app closes"
                subtitle="If enabled, CodexMonitor leaves cloudflared running so your public URL stays up."
              >
                <SettingsToggleSwitch
                  pressed={appSettings.keepTunnelRunningAfterAppClose}
                  onClick={() =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      keepTunnelRunningAfterAppClose: !appSettings.keepTunnelRunningAfterAppClose,
                    })
                  }
                />
              </SettingsToggleRow>
            )}
          </>
        )}

        {(isMobileSimplified || desktopIsPrivateMode) && (
          <div className="settings-field">
          <div className="settings-field-label">Remote backend</div>
          <div className="settings-field-row">
            {isMobileSimplified ? (
              <select
                className="settings-select settings-select--compact"
                value={remoteProviderDraft}
                onChange={(event) =>
                  onSetRemoteProviderDraft(
                    event.target.value as AppSettings["remoteBackendProvider"],
                  )
                }
                onBlur={() => {
                  void onCommitRemoteProvider();
                }}
                aria-label="Remote backend transport"
              >
                <option value="tcp">TCP (Tailscale/LAN)</option>
                <option value="wss">WSS (Cloudflare Tunnel)</option>
              </select>
            ) : (
              <div className="settings-server-provider-pill" aria-label="Remote backend transport">
                TCP
              </div>
            )}
            <input
              className="settings-input settings-input--compact"
              value={remoteHostDraft}
              placeholder={remoteHostPlaceholder}
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
              type={tokenVisible ? "text" : "password"}
              className="settings-input settings-input--compact"
              value={remoteTokenDraft}
              placeholder="Password / token (required)"
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
          <div className="settings-field-row">
            <button
              type="button"
              className="button settings-button-compact"
              onClick={() => {
                setTokenVisible((previous) => !previous);
              }}
            >
              {tokenVisible ? "Hide token" : "Show token"}
            </button>
            <button
              type="button"
              className="button settings-button-compact"
              onClick={handleCopyToken}
              disabled={!remoteTokenDraft.trim()}
            >
              Copy token
            </button>
            <button
              type="button"
              className="button settings-button-compact"
              onClick={() => {
                void onGenerateRemotePassword();
              }}
              disabled={cloudflareTunnelBusyAction !== null}
            >
              Generate token
            </button>
          </div>
          {remoteHostError && <div className="settings-help settings-help-error">{remoteHostError}</div>}
          {tokenActionMessage && (
            <div className={`settings-help${tokenActionError ? " settings-help-error" : ""}`}>
              {tokenActionMessage}
            </div>
          )}
          {!isMobileSimplified && remoteStatusText && (
            <div className={`settings-help${remoteStatusError ? " settings-help-error" : ""}`}>
              {remoteStatusText}
            </div>
          )}
          <div className="settings-help">
            {isMobileSimplified
              ? remoteProviderDraft === "wss"
                ? "Use your public WSS endpoint (for example `wss://codex.example.com/daemon`) and the same token."
                : "Use the Tailscale host from your desktop CodexMonitor app (Server section), for example `macbook.your-tailnet.ts.net:4732`."
              : "This host/token is used by mobile clients and desktop remote-mode testing."}
          </div>
        </div>
        )}

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
              <div className={`settings-help${mobileConnectStatusError ? " settings-help-error" : ""}`}>
                {mobileConnectStatusText}
              </div>
            )}
            <div className="settings-help">
              {remoteProviderDraft === "wss"
                ? "Make sure your tunnel endpoint is reachable and forwarding to the daemon WebSocket listener."
                : "Make sure your desktop app daemon is running and reachable on Tailscale, then retry this test."}
            </div>
          </div>
        )}

        {!isMobileSimplified && desktopIsPublicMode && (
          !cloudflareInstalled ? (
            <div className="settings-field">
              <div className="settings-field-label">Step 1: Install Cloudflare tunnel</div>
              <div className="settings-server-mode-note">
                <div className="settings-help">
                  `cloudflared` is required for public WSS mode. Install once, then continue with
                  daemon + phone connection.
                </div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onCloudflareTunnelInstall();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null}
                  >
                    {cloudflareTunnelBusyAction === "install"
                      ? "Installing..."
                      : "Install cloudflared"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onCloudflareTunnelStatus();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null}
                  >
                    {cloudflareTunnelBusyAction === "status"
                      ? "Refreshing..."
                      : "Refresh install status"}
                  </button>
                </div>
                {cloudflareTunnelStatusText && (
                  <div className="settings-help">{cloudflareTunnelStatusText}</div>
                )}
                {cloudflareTunnelStatus?.version && (
                  <div className="settings-help">cloudflared: {cloudflareTunnelStatus.version}</div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="settings-field">
                <div className="settings-field-label">Public WSS setup</div>
                <div className="settings-wss-wizard-card">
                  <ol className="settings-wss-wizard-steps">
                    <li className={`settings-wss-wizard-step is-${cloudflareStep}`}>
                      <span className="settings-wss-wizard-step-badge">
                        {wizardStepLabel(cloudflareStep)}
                      </span>
                      <span className="settings-wss-wizard-step-text">Step 1: Start Cloudflare tunnel</span>
                    </li>
                    <li className={`settings-wss-wizard-step is-${daemonStep}`}>
                      <span className="settings-wss-wizard-step-badge">
                        {wizardStepLabel(daemonStep)}
                      </span>
                      <span className="settings-wss-wizard-step-text">Step 2: Start mobile daemon</span>
                    </li>
                    <li className={`settings-wss-wizard-step is-${connectStep}`}>
                      <span className="settings-wss-wizard-step-badge">
                        {wizardStepLabel(connectStep)}
                      </span>
                      <span className="settings-wss-wizard-step-text">Step 3: Connect phone with URL + password</span>
                    </li>
                  </ol>
                </div>
              </div>

              <div className="settings-field">
                <div className="settings-field-label">Step 1: Cloudflare tunnel</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onCloudflareTunnelStart();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null || tcpDaemonBusyAction !== null}
                  >
                    {cloudflareTunnelBusyAction === "start" ? "Starting..." : "Start tunnel"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onCloudflareTunnelStop();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null}
                  >
                    {cloudflareTunnelBusyAction === "stop" ? "Stopping..." : "Stop tunnel"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onCloudflareTunnelStatus();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null}
                  >
                    {cloudflareTunnelBusyAction === "status" ? "Refreshing..." : "Refresh tunnel"}
                  </button>
                </div>
                {cloudflareTunnelStatusText && (
                  <div className="settings-help">{cloudflareTunnelStatusText}</div>
                )}
                {cloudflareTunnelStatus?.version && (
                  <div className="settings-help">cloudflared: {cloudflareTunnelStatus.version}</div>
                )}
                {cloudflareTunnelStatus?.localUrl && (
                  <div className="settings-help">
                    Local target: <code>{cloudflareTunnelStatus.localUrl}</code>
                  </div>
                )}
              </div>

              <div className="settings-field">
                <div className="settings-field-label">Step 2: Mobile access daemon</div>
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
              </div>

              <div className="settings-field">
                <div className="settings-field-label">Step 3: Connect phone</div>
                <div className="settings-field-row">
                  <input
                    type={tokenVisible ? "text" : "password"}
                    className="settings-input settings-input--compact"
                    value={remoteTokenDraft}
                    placeholder="Password / token (required)"
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
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      setTokenVisible((previous) => !previous);
                    }}
                  >
                    {tokenVisible ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={handleCopyToken}
                    disabled={!remoteTokenDraft.trim()}
                  >
                    Copy password
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onGenerateRemotePassword();
                    }}
                    disabled={cloudflareTunnelBusyAction !== null}
                  >
                    Generate password
                  </button>
                </div>
                <div className="settings-field-row">
                  <input
                    className="settings-input settings-input--compact"
                    value={remoteHostDraft}
                    placeholder="wss://codex.example.com/daemon"
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
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={handleApplyTunnelUrl}
                    disabled={!tunnelUrlReady || cloudflareTunnelBusyAction !== null}
                  >
                    Use tunnel URL
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={handleCopyWssUrl}
                    disabled={!tunnelUrlReady}
                  >
                    Copy URL
                  </button>
                </div>
                {remoteHostError && <div className="settings-help settings-help-error">{remoteHostError}</div>}
                {tokenActionMessage && (
                  <div className={`settings-help${tokenActionError ? " settings-help-error" : ""}`}>
                    {tokenActionMessage}
                  </div>
                )}
                {wssActionMessage && (
                  <div className={`settings-help${wssActionError ? " settings-help-error" : ""}`}>
                    {wssActionMessage}
                  </div>
                )}
                {remoteStatusText && (
                  <div className={`settings-help${remoteStatusError ? " settings-help-error" : ""}`}>
                    {remoteStatusText}
                  </div>
                )}
                {cloudflareTunnelStatus?.suggestedWssUrl && (
                  <div className="settings-help">
                    Current tunnel URL: <code>{cloudflareTunnelStatus.suggestedWssUrl}</code>
                  </div>
                )}
                {tunnelUrlApplied && (
                  <div className="settings-help">Remote host is already using current tunnel URL.</div>
                )}
                <div className="settings-help">
                  On mobile, choose WSS and enter this URL + password. URL only changes when tunnel process changes.
                </div>
                <details>
                  <summary className="settings-help">Advanced controls</summary>
                  <div className="settings-field-row">
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={() => {
                        void onOneClickWssSetup();
                      }}
                      disabled={cloudflareTunnelBusyAction !== null || tcpDaemonBusyAction !== null}
                    >
                      {cloudflareTunnelBusyAction === "setup" ? "Setting up..." : "Run one-click setup"}
                    </button>
                  </div>
                </details>
              </div>
            </>
          )
        )}

        {!isMobileSimplified && desktopIsPrivateMode && (
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
              Start this daemon before connecting from iOS. It uses your current token and listens
              on <code>0.0.0.0:&lt;port&gt;</code>, matching your configured host port.
            </div>
          </div>
        )}

        {!isMobileSimplified && desktopIsPrivateMode && (
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

      <div className="settings-help">
        {isMobileSimplified
          ? "Use your own infrastructure only. On iOS, configure either a Tailscale TCP host or a WSS tunnel endpoint with token auth."
          : "Mobile access should stay scoped to your own infrastructure. CodexMonitor does not provide hosted backend services."}
      </div>
      {addRemoteOpen && (
        <ModalShell
          className="settings-add-remote-overlay"
          cardClassName="settings-add-remote-card"
          onBackdropClick={closeAddRemoteModal}
          ariaLabel="Add remote"
        >
          <div className="settings-add-remote-header">
            <div className="settings-add-remote-title">Add remote</div>
            <button
              type="button"
              className="ghost icon-button settings-add-remote-close"
              onClick={closeAddRemoteModal}
              aria-label="Close add remote modal"
              disabled={addRemoteBusy}
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-name">
              New remote name
            </label>
            <input
              id="settings-add-remote-name"
              className="settings-input settings-input--compact"
              value={addRemoteNameDraft}
              onChange={(event) => setAddRemoteNameDraft(event.target.value)}
              disabled={addRemoteBusy}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-provider">
              New remote transport
            </label>
            <select
              id="settings-add-remote-provider"
              className="settings-select settings-select--compact"
              value={addRemoteProviderDraft}
              onChange={(event) =>
                setAddRemoteProviderDraft(
                  event.target.value as AppSettings["remoteBackendProvider"],
                )
              }
              disabled={addRemoteBusy}
            >
              <option value="tcp">TCP (Tailscale/LAN)</option>
              <option value="wss">WSS (Cloudflare Tunnel)</option>
            </select>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-host">
              New remote host
            </label>
            <input
              id="settings-add-remote-host"
              className="settings-input settings-input--compact"
              value={addRemoteHostDraft}
              placeholder={addRemoteHostPlaceholder}
              onChange={(event) => setAddRemoteHostDraft(event.target.value)}
              disabled={addRemoteBusy}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-token">
              New remote token
            </label>
            <input
              id="settings-add-remote-token"
              type="password"
              className="settings-input settings-input--compact"
              value={addRemoteTokenDraft}
              placeholder="Token"
              onChange={(event) => setAddRemoteTokenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddRemoteConfirm();
                }
              }}
              disabled={addRemoteBusy}
            />
          </div>
          {addRemoteError && <div className="settings-help settings-help-error">{addRemoteError}</div>}
          <div className="settings-add-remote-actions">
            <button type="button" className="ghost" onClick={closeAddRemoteModal} disabled={addRemoteBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={handleAddRemoteConfirm}
              disabled={addRemoteBusy}
            >
              {addRemoteBusy ? "Connecting..." : "Connect & add"}
            </button>
          </div>
        </ModalShell>
      )}
      {pendingDeleteRemote && (
        <ModalShell
          className="settings-delete-remote-overlay"
          cardClassName="settings-delete-remote-card"
          onBackdropClick={() => setPendingDeleteRemoteId(null)}
          ariaLabel="Delete remote confirmation"
        >
          <div className="settings-delete-remote-title">Delete remote?</div>
          <div className="settings-delete-remote-message">
            Remove <strong>{pendingDeleteRemote.name}</strong> from saved remotes? This only
            removes the profile from this device.
          </div>
          <div className="settings-delete-remote-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setPendingDeleteRemoteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void onDeleteRemoteBackend(pendingDeleteRemote.id);
                setPendingDeleteRemoteId(null);
              }}
            >
              Delete remote
            </button>
          </div>
        </ModalShell>
      )}
    </SettingsSection>
  );
}
