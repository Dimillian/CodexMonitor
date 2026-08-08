import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { Trans, useTranslation } from "react-i18next";
import type {
  AppSettings,
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
  host: string;
  token: string;
};

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
  onSetRemoteNameDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteName: () => Promise<void>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
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
  onSetRemoteNameDraft,
  onSetRemoteHostDraft,
  onSetRemoteTokenDraft,
  onCommitRemoteName,
  onCommitRemoteHost,
  onCommitRemoteToken,
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
  onMobileConnectTest,
}: SettingsServerSectionProps) {
  const { t } = useTranslation("settings");
  const [pendingDeleteRemoteId, setPendingDeleteRemoteId] = useState<string | null>(
    null,
  );
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const [addRemoteBusy, setAddRemoteBusy] = useState(false);
  const [addRemoteError, setAddRemoteError] = useState<string | null>(null);
  const [addRemoteNameDraft, setAddRemoteNameDraft] = useState("");
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
        ? t("server_daemon_running_pid", { pid: tcpDaemonStatus.pid, addr: tcpDaemonStatus.listenAddr ?? t("unknown") })
        : t("server_daemon_running", { addr: tcpDaemonStatus.listenAddr ?? t("unknown") });
    }
    if (tcpDaemonStatus.state === "error") {
      return tcpDaemonStatus.lastError ?? t("server_daemon_error");
    }
    return t("server_daemon_stopped", { addr: tcpDaemonStatus.listenAddr ? ` (${tcpDaemonStatus.listenAddr})` : "" });
  })();

  const openAddRemoteModal = () => {
    setAddRemoteError(null);
    setAddRemoteNameDraft(nextRemoteNameSuggestion);
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

  return (
    <SettingsSection
      title={t("server_title")}
      subtitle={
        isMobileSimplified
          ? t("server_subtitle_mobile")
          : t("server_subtitle_desktop")
      }
    >

      {!isMobileSimplified && (
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="backend-mode">
            {t("server_backend_mode")}
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
            <option value="local">{t("server_backend_mode_local")}</option>
            <option value="remote">{t("server_backend_mode_remote")}</option>
          </select>
          <div className="settings-help">
            {t("server_backend_mode_help")}
          </div>
        </div>
      )}

      <>
        {isMobileSimplified && (
          <>
            <div className="settings-field">
              <div className="settings-field-label">{t("server_saved_remotes")}</div>
              <div className="settings-mobile-remotes" role="list" aria-label={t("server_saved_remotes_aria")}>
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
                          {isActive && <span className="settings-mobile-remote-badge">{t("server_remote_active")}</span>}
                        </div>
                        <div className="settings-mobile-remote-meta">{t("server_remote_tcp", { host: entry.host })}</div>
                        <div className="settings-mobile-remote-last">
                          {t("server_remote_last_connected")}{" "}
                          {typeof entry.lastConnectedAtMs === "number"
                            ? new Date(entry.lastConnectedAtMs).toLocaleString()
                            : t("server_remote_never")}
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
                          aria-label={t("server_remote_use", { name: entry.name })}
                        >
                          {isActive ? t("server_remote_using") : t("server_remote_use", { name: entry.name })}
                        </button>
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action"
                          onClick={() => {
                            void onMoveRemoteBackend(entry.id, "up");
                          }}
                          disabled={index === 0}
                          aria-label={t("server_remote_move_up", { name: entry.name })}
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
                          aria-label={t("server_remote_move_down", { name: entry.name })}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="ghost settings-mobile-remote-action settings-mobile-remote-action-danger"
                          onClick={() => {
                            setPendingDeleteRemoteId(entry.id);
                          }}
                          aria-label={t("server_remote_delete", { name: entry.name })}
                        >
                          {t("server_remote_delete_btn")}
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
                  {t("server_add_remote")}
                </button>
              </div>
              {remoteStatusText && (
                <div className={`settings-help${remoteStatusError ? " settings-help-error" : ""}`}>
                  {remoteStatusText}
                </div>
              )}
              <div className="settings-help">
                {t("server_remote_switch_help")}
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="mobile-remote-name">
                {t("server_remote_name")}
              </label>
              <input
                id="mobile-remote-name"
                className="settings-input settings-input--compact"
                value={remoteNameDraft}
                placeholder={t("server_remote_name_placeholder")}
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

        {!isMobileSimplified && (
          <SettingsToggleRow
            title={t("server_keep_daemon")}
            subtitle={t("server_keep_daemon_subtitle")}
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
        )}

        <div className="settings-field">
          <div className="settings-field-label">{t("server_remote_backend")}</div>
          <div className="settings-field-row">
            <input
              className="settings-input settings-input--compact"
              value={remoteHostDraft}
              placeholder={t("server_remote_host_placeholder")}
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
              aria-label={t("server_remote_host_aria")}
            />
            <input
              type="password"
              className="settings-input settings-input--compact"
              value={remoteTokenDraft}
              placeholder={t("server_remote_token_placeholder")}
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
              aria-label={t("server_remote_token_aria")}
            />
          </div>
          {remoteHostError && <div className="settings-help settings-help-error">{remoteHostError}</div>}
          <div className="settings-help">
            {isMobileSimplified
              ? t("server_remote_help_mobile")
              : t("server_remote_help_desktop")}
          </div>
        </div>

        {isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">{t("server_connection_test")}</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onMobileConnectTest}
                disabled={mobileConnectBusy}
              >
                {mobileConnectBusy ? t("server_connecting") : t("server_connect_test")}
              </button>
            </div>
            {mobileConnectStatusText && (
              <div className={`settings-help${mobileConnectStatusError ? " settings-help-error" : ""}`}>
                {mobileConnectStatusText}
              </div>
            )}
            <div className="settings-help">
              {t("server_connect_help")}
            </div>
          </div>
        )}

        {!isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">{t("server_mobile_daemon")}</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStart();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "start" ? t("server_starting") : t("server_start_daemon")}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStop();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "stop" ? t("server_stopping") : t("server_stop_daemon")}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={() => {
                  void onTcpDaemonStatus();
                }}
                disabled={tcpDaemonBusyAction !== null}
              >
                {tcpDaemonBusyAction === "status" ? t("server_refreshing") : t("server_refresh_status")}
              </button>
            </div>
            {tcpRunnerStatusText && <div className="settings-help">{tcpRunnerStatusText}</div>}
            {tcpDaemonStatus?.startedAtMs && (
              <div className="settings-help">
                {t("server_daemon_started_at", { time: new Date(tcpDaemonStatus.startedAtMs).toLocaleString() })}
              </div>
            )}
            <div className="settings-help">
              <Trans i18nKey="settings:server_daemon_help" />
            </div>
          </div>
        )}

        {!isMobileSimplified && (
          <div className="settings-field">
            <div className="settings-field-label">{t("server_tailscale_helper")}</div>
            <div className="settings-field-row">
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onRefreshTailscaleStatus}
                disabled={tailscaleStatusBusy}
              >
                {tailscaleStatusBusy ? t("server_checking") : t("server_detect_tailscale")}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                onClick={onRefreshTailscaleCommandPreview}
                disabled={tailscaleCommandBusy}
              >
                {tailscaleCommandBusy ? t("server_refreshing") : t("server_refresh_daemon_cmd")}
              </button>
              <button
                type="button"
                className="button settings-button-compact"
                disabled={!tailscaleStatus?.suggestedRemoteHost}
                onClick={() => {
                  void onUseSuggestedTailscaleHost();
                }}
              >
                {t("server_use_suggested")}
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
                    ? t("server_tailscale_version", { version: tailscaleStatus.version ?? t("unknown") })
                    : t("server_tailscale_install")}
                </div>
                {tailscaleStatus.suggestedRemoteHost && (
                  <div className="settings-help">
                    {t("server_tailscale_suggested")} <code>{tailscaleStatus.suggestedRemoteHost}</code>
                  </div>
                )}
                {tailscaleStatus.tailnetName && (
                  <div className="settings-help">
                    {t("server_tailscale_tailnet")} <code>{tailscaleStatus.tailnetName}</code>
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
                  {t("server_tailscale_command_template")}
                </div>
                <pre className="settings-command-preview">
                  <code>{tailscaleCommandPreview.command}</code>
                </pre>
                {!tailscaleCommandPreview.tokenConfigured && (
                  <div className="settings-help settings-help-error">
                    {t("server_tailscale_token_empty")}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </>

      <div className="settings-help">
        {isMobileSimplified
          ? t("server_footer_mobile")
          : t("server_footer_desktop")}
      </div>
      {addRemoteOpen && (
        <ModalShell
          className="settings-add-remote-overlay"
          cardClassName="settings-add-remote-card"
          onBackdropClick={closeAddRemoteModal}
          ariaLabel={t("server_add_remote_aria")}
        >
          <div className="settings-add-remote-header">
            <div className="settings-add-remote-title">{t("server_add_remote_title")}</div>
            <button
              type="button"
              className="ghost icon-button settings-add-remote-close"
              onClick={closeAddRemoteModal}
              aria-label={t("server_add_remote_close")}
              disabled={addRemoteBusy}
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-name">
              {t("server_new_remote_name")}
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
            <label className="settings-field-label" htmlFor="settings-add-remote-host">
              {t("server_new_remote_host")}
            </label>
            <input
              id="settings-add-remote-host"
              className="settings-input settings-input--compact"
              value={addRemoteHostDraft}
              placeholder={t("server_new_remote_host_placeholder")}
              onChange={(event) => setAddRemoteHostDraft(event.target.value)}
              disabled={addRemoteBusy}
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-add-remote-token">
              {t("server_new_remote_token")}
            </label>
            <input
              id="settings-add-remote-token"
              type="password"
              className="settings-input settings-input--compact"
              value={addRemoteTokenDraft}
              placeholder={t("server_new_remote_token_placeholder")}
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
              {t("server_cancel")}
            </button>
            <button
              type="button"
              className="button"
              onClick={handleAddRemoteConfirm}
              disabled={addRemoteBusy}
            >
              {addRemoteBusy ? t("server_connecting") : t("server_connect_add")}
            </button>
          </div>
        </ModalShell>
      )}
      {pendingDeleteRemote && (
        <ModalShell
          className="settings-delete-remote-overlay"
          cardClassName="settings-delete-remote-card"
          onBackdropClick={() => setPendingDeleteRemoteId(null)}
          ariaLabel={t("server_delete_remote_aria")}
        >
          <div className="settings-delete-remote-title">{t("server_delete_remote_title")}</div>
          <div className="settings-delete-remote-message">
            <Trans i18nKey="settings:server_delete_remote_message" values={{ name: pendingDeleteRemote.name }} />
          </div>
          <div className="settings-delete-remote-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setPendingDeleteRemoteId(null)}
            >
              {t("server_cancel")}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void onDeleteRemoteBackend(pendingDeleteRemote.id);
                setPendingDeleteRemoteId(null);
              }}
            >
              {t("server_delete_remote")}
            </button>
          </div>
        </ModalShell>
      )}
    </SettingsSection>
  );
}
