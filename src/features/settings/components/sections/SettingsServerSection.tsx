import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "../../../../types";

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
        ? `移动端守护进程正在运行（pid ${tcpDaemonStatus.pid}），监听地址：${tcpDaemonStatus.listenAddr ?? "已配置监听地址"}。`
        : `移动端守护进程正在运行，监听地址：${tcpDaemonStatus.listenAddr ?? "已配置监听地址"}。`;
    }
    if (tcpDaemonStatus.state === "error") {
      return tcpDaemonStatus.lastError ?? "移动端守护进程处于错误状态。";
    }
    return `移动端守护进程已停止${tcpDaemonStatus.listenAddr ? `（${tcpDaemonStatus.listenAddr}）` : ""}。`;
  })();

  return (
    <section className="settings-section">
      <div className="settings-section-title">服务</div>
      <div className="settings-section-subtitle">
        {isMobileSimplified
          ? "请选择 TCP 或 Orbit，填写桌面端配置的连接地址与令牌，然后执行连接测试。"
          : "配置 CodexMonitor 如何为移动端与远程客户端提供后端访问。除非你显式启用远程模式，桌面端默认仍使用本地模式。"}
      </div>

      {!isMobileSimplified && (
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="backend-mode">
            后端模式
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
            <option value="local">本地（默认）</option>
            <option value="remote">远程（守护进程）</option>
          </select>
          <div className="settings-help">
            本地模式会在应用进程内处理桌面请求。远程模式会让桌面请求走与移动端一致的网络传输链路。
          </div>
        </div>
      )}

      <>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="remote-provider">
            {isMobileSimplified ? "连接类型" : "远程提供方"}
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
            aria-label={isMobileSimplified ? "连接类型" : "远程提供方"}
          >
            <option value="tcp">{isMobileSimplified ? "TCP" : "TCP（开发中）"}</option>
            <option value="orbit">{isMobileSimplified ? "Orbit" : "Orbit（开发中）"}</option>
          </select>
          <div className="settings-help">
            {isMobileSimplified
              ? "TCP 使用桌面端守护进程的 Tailscale 地址。Orbit 使用 Orbit WebSocket 地址。"
              : "选择用于移动端访问与桌面远程模式测试的远程传输配置。"}
          </div>
        </div>

        {!isMobileSimplified && (
          <div className="settings-toggle-row">
            <div>
              <div className="settings-toggle-title">关闭应用后保持守护进程运行</div>
              <div className="settings-toggle-subtitle">
                关闭后，CodexMonitor 会在退出前停止其管理的 TCP 与 Orbit 守护进程。
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
              <div className="settings-field-label">远程后端</div>
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
                  aria-label="远程后端 host"
                />
                <input
                  type="password"
                  className="settings-input settings-input--compact"
                  value={remoteTokenDraft}
                  placeholder="令牌（必填）"
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
                  aria-label="远程后端 token"
                />
              </div>
              <div className="settings-help">
                {isMobileSimplified
                  ? "使用桌面端 CodexMonitor（服务设置）中的 Tailscale 地址，例如 `macbook.your-tailnet.ts.net:4732`。"
                  : "该地址/令牌用于移动端连接和桌面远程模式测试。"}
              </div>
            </div>

            {isMobileSimplified && (
              <div className="settings-field">
                <div className="settings-field-label">连接测试</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onMobileConnectTest}
                    disabled={mobileConnectBusy}
                  >
                    {mobileConnectBusy ? "连接中..." : "连接并测试"}
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
                  请确保桌面端守护进程已运行，且可通过 Tailscale 访问后再重试。
                </div>
              </div>
            )}

            {!isMobileSimplified && (
              <div className="settings-field">
                <div className="settings-field-label">移动端访问守护进程</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStart();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "start" ? "启动中..." : "启动守护进程"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStop();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "stop" ? "停止中..." : "停止守护进程"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={() => {
                      void onTcpDaemonStatus();
                    }}
                    disabled={tcpDaemonBusyAction !== null}
                  >
                    {tcpDaemonBusyAction === "status" ? "刷新中..." : "刷新状态"}
                  </button>
                </div>
                {tcpRunnerStatusText && <div className="settings-help">{tcpRunnerStatusText}</div>}
                {tcpDaemonStatus?.startedAtMs && (
                  <div className="settings-help">
                    启动时间： {new Date(tcpDaemonStatus.startedAtMs).toLocaleString()}
                  </div>
                )}
                <div className="settings-help">
                  请先启动该守护进程再从 iOS 连接。它会使用当前令牌，并监听 <code>0.0.0.0:&lt;port&gt;</code>，与配置中的主机端口保持一致。
                </div>
              </div>
            )}

            {!isMobileSimplified && (
              <div className="settings-field">
                <div className="settings-field-label">Tailscale 助手</div>
                <div className="settings-field-row">
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onRefreshTailscaleStatus}
                    disabled={tailscaleStatusBusy}
                  >
                    {tailscaleStatusBusy ? "检查中..." : "检测 Tailscale"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    onClick={onRefreshTailscaleCommandPreview}
                    disabled={tailscaleCommandBusy}
                  >
                    {tailscaleCommandBusy ? "刷新中..." : "刷新守护进程命令"}
                  </button>
                  <button
                    type="button"
                    className="button settings-button-compact"
                    disabled={!tailscaleStatus?.suggestedRemoteHost}
                    onClick={() => {
                      void onUseSuggestedTailscaleHost();
                    }}
                  >
                    使用建议地址
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
                        ? `版本：${tailscaleStatus.version ?? "未知"}`
                        : "请先在桌面端和 iOS 安装 Tailscale。"}
                    </div>
                    {tailscaleStatus.suggestedRemoteHost && (
                      <div className="settings-help">
                        建议的远程地址： <code>{tailscaleStatus.suggestedRemoteHost}</code>
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
                      启动守护进程的命令模板（手动兜底）：
                    </div>
                    <pre className="settings-command-preview">
                      <code>{tailscaleCommandPreview.command}</code>
                    </pre>
                    {!tailscaleCommandPreview.tokenConfigured && (
                      <div className="settings-help settings-help-error">
                        远程后端令牌为空。请在开放守护进程访问前设置一个。
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
                Orbit WebSocket 地址
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
                aria-label="Orbit WebSocket 地址"
              />
            </div>

            {isMobileSimplified && (
              <>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="orbit-token-mobile">
                    远程后端 token
                  </label>
                  <input
                    id="orbit-token-mobile"
                    type="password"
                    className="settings-input settings-input--compact"
                    value={remoteTokenDraft}
                    placeholder="令牌（必填）"
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
                    aria-label="远程后端 token"
                  />
                  <div className="settings-help">
                    请使用与桌面端 Orbit 守护进程一致的令牌。
                  </div>
                </div>
                <div className="settings-field">
                  <div className="settings-field-label">连接测试</div>
                  <div className="settings-field-row">
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onMobileConnectTest}
                      disabled={mobileConnectBusy}
                    >
                      {mobileConnectBusy ? "连接中..." : "连接并测试"}
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
                    请确保 Orbit 地址和令牌与桌面端配置一致后再重试。
                  </div>
                </div>
              </>
            )}

            {!isMobileSimplified && (
              <>
                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="orbit-auth-url">
                    Orbit 认证 URL
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
                    aria-label="Orbit 认证 URL"
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="orbit-runner-name">
                    Orbit Runner 名称
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
                    aria-label="Orbit Runner 名称"
                  />
                </div>

                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-title">自动启动 Runner</div>
                    <div className="settings-toggle-subtitle">
                      启用远程模式时自动启动 Orbit Runner。
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
                    <div className="settings-toggle-title">使用 Orbit Access</div>
                    <div className="settings-toggle-subtitle">
                      为 Orbit Access 启用 OAuth 客户端凭据。
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
                    Orbit Access 客户端 ID
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
                    aria-label="Orbit Access 客户端 ID"
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-field-label" htmlFor="orbit-access-client-secret-ref">
                    Orbit Access 客户端密钥引用
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
                    aria-label="Orbit Access 客户端密钥引用"
                  />
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Orbit 操作</div>
                  <div className="settings-field-row">
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitConnectTest}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "connect-test" ? "测试中..." : "连接测试"}
                    </button>
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitSignIn}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "sign-in" ? "登录中..." : "登录"}
                    </button>
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitSignOut}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "sign-out" ? "登出中..." : "登出"}
                    </button>
                  </div>
                  <div className="settings-field-row">
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitRunnerStart}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "runner-start" ? "启动中..." : "启动 Runner"}
                    </button>
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitRunnerStop}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "runner-stop" ? "停止中..." : "停止 Runner"}
                    </button>
                    <button
                      type="button"
                      className="button settings-button-compact"
                      onClick={onOrbitRunnerStatus}
                      disabled={orbitBusyAction !== null}
                    >
                      {orbitBusyAction === "runner-status" ? "刷新中..." : "刷新状态"}
                    </button>
                  </div>
                  {orbitStatusText && <div className="settings-help">{orbitStatusText}</div>}
                  {orbitAuthCode && (
                    <div className="settings-help">
                      授权码： <code>{orbitAuthCode}</code>
                    </div>
                  )}
                  {orbitVerificationUrl && (
                    <div className="settings-help">
                      验证链接：{" "}
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
            ? "请仅使用你自己的基础设施。在 iOS 上，请使用桌面端 CodexMonitor 配置中的 Tailscale 主机名和令牌。"
            : "请仅使用你自己的基础设施。在 iOS 上，请使用桌面端 CodexMonitor 配置中的 Orbit WebSocket 地址和令牌。"
          : "移动端访问应始终限定在你自己的基础设施（Tailnet 或自托管 Orbit）内。CodexMonitor 不提供托管后端服务。"}
      </div>
    </section>
  );
}
