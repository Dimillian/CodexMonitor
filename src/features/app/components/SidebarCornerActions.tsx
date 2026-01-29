import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import { useEffect, useRef, useState } from "react";

type SidebarCornerActionsProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  onSwitchAccount: () => void;
};

export function SidebarCornerActions({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  onSwitchAccount,
}: SidebarCornerActionsProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountMenuRef.current?.contains(target)) {
        return;
      }
      setAccountMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!showAccountSwitcher) {
      setAccountMenuOpen(false);
    }
  }, [showAccountSwitcher]);

  return (
    <div className="sidebar-corner-actions">
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <button
            className="ghost sidebar-corner-button"
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-label="Account"
            title="Account"
          >
            <User size={14} aria-hidden />
          </button>
          {accountMenuOpen && (
            <div className="sidebar-account-popover popover-surface" role="dialog">
              <div className="sidebar-account-title">Account</div>
              <div className="sidebar-account-value">{accountLabel}</div>
              <button
                type="button"
                className="primary sidebar-account-action"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onSwitchAccount();
                }}
                disabled={accountDisabled}
              >
                {accountActionLabel}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        className="ghost sidebar-corner-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <Settings size={14} aria-hidden />
      </button>
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button"
          type="button"
          onClick={onOpenDebug}
          aria-label="Open debug log"
          title="Debug log"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
