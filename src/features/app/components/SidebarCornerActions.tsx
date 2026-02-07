import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useRef, useState } from "react";
import { PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";

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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useDismissibleMenu({
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    onClose: () => setAccountMenuOpen(false),
  });

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
            aria-label="账号"
            title="账号"
          >
            <User size={14} aria-hidden />
          </button>
          {accountMenuOpen && (
            <PopoverSurface className="sidebar-account-popover" role="dialog">
              <div className="sidebar-account-title">账号</div>
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
                    aria-label="取消切换账号"
                    title="取消"
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
        aria-label="打开设置"
        title="设置"
      >
        <Settings size={14} aria-hidden />
      </button>
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button"
          type="button"
          onClick={onOpenDebug}
          aria-label="打开调试日志"
          title="调试日志"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
