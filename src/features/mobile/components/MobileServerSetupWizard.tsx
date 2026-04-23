import "../../../styles/mobile-setup-wizard.css";
import X from "lucide-react/dist/esm/icons/x";
import { ModalShell } from "../../design-system/components/modal/ModalShell";
import { useI18n } from "@/i18n";

export type MobileServerSetupWizardProps = {
  remoteHostDraft: string;
  remoteTokenDraft: string;
  busy: boolean;
  checking: boolean;
  statusMessage: string | null;
  statusError: boolean;
  onClose: () => void;
  onRemoteHostChange: (value: string) => void;
  onRemoteTokenChange: (value: string) => void;
  onConnectTest: () => void;
};

export function MobileServerSetupWizard({
  remoteHostDraft,
  remoteTokenDraft,
  busy,
  checking,
  statusMessage,
  statusError,
  onClose,
  onRemoteHostChange,
  onRemoteTokenChange,
  onConnectTest,
}: MobileServerSetupWizardProps) {
  const { tx } = useI18n();

  return (
    <ModalShell
      className="mobile-setup-wizard-overlay"
      cardClassName="mobile-setup-wizard-card"
      onBackdropClick={onClose}
      ariaLabel={tx("Mobile server setup")}
    >
      <div className="mobile-setup-wizard-header">
        <button
          type="button"
          className="ghost icon-button mobile-setup-wizard-close"
          onClick={onClose}
          aria-label={tx("Close mobile setup")}
        >
          <X aria-hidden />
        </button>
        <div className="mobile-setup-wizard-kicker">{tx("Mobile Setup Required")}</div>
        <h2 className="mobile-setup-wizard-title">
          {tx("Connect to your desktop backend")}
        </h2>
        <p className="mobile-setup-wizard-subtitle">
          {tx(
            "Complete this setup before using the app. Use the same connection details configured on your desktop CodexMonitor server settings.",
          )}
        </p>
      </div>

      <div className="mobile-setup-wizard-body">
        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-host">
          {tx("Tailscale host")}
        </label>
        <input
          id="mobile-setup-host"
          className="mobile-setup-wizard-input"
          value={remoteHostDraft}
          placeholder="macbook.your-tailnet.ts.net:4732"
          onChange={(event) => onRemoteHostChange(event.target.value)}
          disabled={busy || checking}
        />

        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-token">
          {tx("Remote backend token")}
        </label>
        <input
          id="mobile-setup-token"
          type="password"
          className="mobile-setup-wizard-input"
          value={remoteTokenDraft}
          placeholder={tx("Token")}
          onChange={(event) => onRemoteTokenChange(event.target.value)}
          disabled={busy || checking}
        />

        <button
          type="button"
          className="button primary mobile-setup-wizard-action"
          onClick={onConnectTest}
          disabled={busy || checking}
        >
          {checking ? tx("Checking...") : busy ? tx("Connecting...") : tx("Connect & test")}
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
          {tx(
            "Use the Tailscale host from desktop Server settings and keep the desktop daemon running.",
          )}
        </div>
      </div>
    </ModalShell>
  );
}
