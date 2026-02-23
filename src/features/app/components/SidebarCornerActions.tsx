import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect } from "react";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarCornerActionsProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

export function SidebarCornerActions({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarCornerActionsProps) {
  const accountMenu = useMenuController();
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  return (
    <div className="sidebar-corner-actions">
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <MenuTrigger
            isOpen={accountMenuOpen}
            popupRole="dialog"
            className="ghost sidebar-corner-button"
            onClick={toggleAccountMenu}
            aria-label="Account"
            title="Account"
          >
            <User size={14} aria-hidden />
          </MenuTrigger>
          {accountMenuOpen && (
            <PopoverSurface className="sidebar-account-popover" role="dialog">
              <div className="sidebar-account-title">Account</div>
              <div className="sidebar-account-value">{accountLabel}</div>
              <div className="sidebar-account-actions-row">
                <button
                  type="button"
                  className="primary sidebar-account-action"
                  onClick={onSwitchAccount}
                  disabled={accountDisabled}
                  aria-busy={accountSwitching}
                >
                  <span className="sidebar-account-action-content">
                    {accountSwitching && (
                      <span className="sidebar-account-spinner" aria-hidden />
                    )}
                    <span>{accountActionLabel}</span>
                  </span>
                </button>
                {accountSwitching && (
                  <button
                    type="button"
                    className="secondary sidebar-account-cancel"
                    onClick={onCancelSwitchAccount}
                    disabled={accountCancelDisabled}
                    aria-label="Cancel account switch"
                    title="Cancel"
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </div>
            </PopoverSurface>
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
