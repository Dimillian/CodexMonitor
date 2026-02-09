import "../../../styles/mobile-setup-wizard.css";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import type { AppSettings } from "../../../types";

export type MobileServerSetupWizardProps = {
  provider: AppSettings["remoteBackendProvider"];
  remoteHostDraft: string;
  orbitWsUrlDraft: string;
  remoteTokenDraft: string;
  busy: boolean;
  checking: boolean;
  statusMessage: string | null;
  statusError: boolean;
  onProviderChange: (provider: AppSettings["remoteBackendProvider"]) => void;
  onRemoteHostChange: (value: string) => void;
  onOrbitWsUrlChange: (value: string) => void;
  onRemoteTokenChange: (value: string) => void;
  onConnectTest: () => void;
};

export function MobileServerSetupWizard({
  provider,
  remoteHostDraft,
  orbitWsUrlDraft,
  remoteTokenDraft,
  busy,
  checking,
  statusMessage,
  statusError,
  onProviderChange,
  onRemoteHostChange,
  onOrbitWsUrlChange,
  onRemoteTokenChange,
  onConnectTest,
}: MobileServerSetupWizardProps) {
  return (
    <ModalShell
      className="mobile-setup-wizard-overlay"
      cardClassName="mobile-setup-wizard-card"
      ariaLabel="Mobile server setup"
    >
      <div className="mobile-setup-wizard-header">
        <div className="mobile-setup-wizard-kicker">Mobile Setup Required</div>
        <h2 className="mobile-setup-wizard-title">Connect to your desktop backend</h2>
        <p className="mobile-setup-wizard-subtitle">
          Complete this setup before using the app. Use the same connection details configured on
          your desktop CodexMonitor server settings.
        </p>
      </div>

      <div className="mobile-setup-wizard-body">
        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-provider">
          Connection type
        </label>
        <select
          id="mobile-setup-provider"
          className="mobile-setup-wizard-input"
          value={provider}
          onChange={(event) =>
            onProviderChange(event.target.value as AppSettings["remoteBackendProvider"])
          }
          disabled={busy || checking}
        >
          <option value="tcp">TCP</option>
          <option value="orbit">Orbit</option>
        </select>

        {provider === "tcp" && (
          <>
            <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-host">
              Tailscale host
            </label>
            <input
              id="mobile-setup-host"
              className="mobile-setup-wizard-input"
              value={remoteHostDraft}
              placeholder="macbook.your-tailnet.ts.net:4732"
              onChange={(event) => onRemoteHostChange(event.target.value)}
              disabled={busy || checking}
            />
          </>
        )}

        {provider === "orbit" && (
          <>
            <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-orbit-url">
              Orbit websocket URL
            </label>
            <input
              id="mobile-setup-orbit-url"
              className="mobile-setup-wizard-input"
              value={orbitWsUrlDraft}
              placeholder="wss://..."
              onChange={(event) => onOrbitWsUrlChange(event.target.value)}
              disabled={busy || checking}
            />
          </>
        )}

        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-token">
          Remote backend token
        </label>
        <input
          id="mobile-setup-token"
          type="password"
          className="mobile-setup-wizard-input"
          value={remoteTokenDraft}
          placeholder="Token"
          onChange={(event) => onRemoteTokenChange(event.target.value)}
          disabled={busy || checking}
        />

        <button
          type="button"
          className="button primary mobile-setup-wizard-action"
          onClick={onConnectTest}
          disabled={busy || checking}
        >
          {checking ? "Checking..." : busy ? "Connecting..." : "Connect & test"}
        </button>

        {statusMessage ? (
          <div
            className={`mobile-setup-wizard-status${
              statusError ? " mobile-setup-wizard-status-error" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mobile-setup-wizard-hint">
          {provider === "tcp"
            ? "Use the Tailscale host from desktop Server settings and keep the desktop daemon running."
            : "Use the Orbit websocket URL and token from desktop Server settings."}
        </div>
      </div>
    </ModalShell>
  );
}
