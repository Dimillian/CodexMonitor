import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useMemo, useState } from "react";
import type { SavedAccountProfile } from "../../../types";
import { getUsageLabels } from "../utils/usageLabels";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../hooks/useMenuController";

type SidebarBottomRailProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  savedProfiles: SavedAccountProfile[];
  savedProfilesLoading: boolean;
  activatingProfileId: string | null;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
  onActivateSavedProfile: (profileId: string) => void;
  usageShowRemaining: boolean;
};

type UsageRowProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
};

function UsageRow({ label, percent, resetLabel }: UsageRowProps) {
  return (
    <div className="sidebar-usage-row">
      <div className="sidebar-usage-row-head">
        <span className="sidebar-usage-name">{label}</span>
        <span className="sidebar-usage-value">
          {percent === null ? "--" : `${percent}%`}
        </span>
      </div>
      <div className="sidebar-usage-bar" aria-hidden>
        <span className="sidebar-usage-bar-fill" style={{ width: `${percent ?? 0}%` }} />
      </div>
      {resetLabel && <div className="sidebar-usage-reset">{resetLabel}</div>}
    </div>
  );
}

function formatSavedProfileUsage(
  profile: SavedAccountProfile,
  usageShowRemaining: boolean,
): string | null {
  const usage = getUsageLabels(profile.rateLimits, usageShowRemaining);
  const parts: string[] = [];

  if (usage.sessionPercent !== null) {
    parts.push(`Session ${usage.sessionPercent}%`);
  }
  if (usage.showWeekly && usage.weeklyPercent !== null) {
    parts.push(`Weekly ${usage.weeklyPercent}%`);
  }
  if (usage.creditsLabel) {
    parts.push(usage.creditsLabel.replace(/^Available credits:\s*/i, "Credits "));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function SidebarBottomRail({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  savedProfiles,
  savedProfilesLoading,
  activatingProfileId,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
  onActivateSavedProfile,
  usageShowRemaining,
}: SidebarBottomRailProps) {
  const accountMenu = useMenuController();
  const [savedProfilesOpen, setSavedProfilesOpen] = useState(false);
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
      setSavedProfilesOpen(false);
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  useEffect(() => {
    if (!accountMenuOpen) {
      setSavedProfilesOpen(false);
    }
  }, [accountMenuOpen]);

  const selectableProfiles = useMemo(
    () => savedProfiles.filter((profile) => !profile.isActive),
    [savedProfiles],
  );

  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-usage-panel">
        <div className="sidebar-usage-header">
          <div className="sidebar-usage-kicker">Usage</div>
          {creditsLabel && <div className="sidebar-usage-credits">{creditsLabel}</div>}
        </div>
        <div className="sidebar-usage-list">
          <UsageRow
            label="Session"
            percent={sessionPercent}
            resetLabel={sessionResetLabel}
          />
          {showWeekly && (
            <UsageRow
              label="Weekly"
              percent={weeklyPercent}
              resetLabel={weeklyResetLabel}
            />
          )}
        </div>
      </div>
      <div
        className={`sidebar-bottom-actions${showAccountSwitcher ? "" : " is-compact"}`}
      >
        {showAccountSwitcher && (
          <div className="sidebar-account-menu" ref={accountMenuRef}>
            <MenuTrigger
              isOpen={accountMenuOpen}
              popupRole="dialog"
              className="ghost sidebar-labeled-button sidebar-account-trigger"
              activeClassName="is-open"
              onClick={toggleAccountMenu}
              aria-label="Account"
            >
              <span className="sidebar-account-trigger-content">
                <span className="sidebar-account-avatar" aria-hidden>
                  <User size={12} aria-hidden />
                </span>
                <span className="sidebar-account-trigger-label">Account</span>
              </span>
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
                <button
                  type="button"
                  className="secondary sidebar-account-saved-toggle"
                  onClick={() => setSavedProfilesOpen((open) => !open)}
                  disabled={savedProfilesLoading || savedProfiles.length === 0}
                >
                  {savedProfilesLoading
                    ? "Loading profiles..."
                    : savedProfiles.length === 0
                      ? "No saved profiles yet"
                      : savedProfilesOpen
                        ? "Hide saved profiles"
                        : "Saved profiles"}
                </button>
                {savedProfilesOpen && (
                  <div className="sidebar-saved-profiles-list" role="list">
                    {savedProfiles.map((profile) => {
                      const usageSummary = formatSavedProfileUsage(
                        profile,
                        usageShowRemaining,
                      );
                      const label =
                        profile.email?.trim() ||
                        (profile.accountType === "apikey" ? "API key" : "Saved account");
                      const meta = [profile.planType, usageSummary]
                        .filter((value): value is string => Boolean(value?.trim()))
                        .join(" · ");
                      const isBusy = activatingProfileId === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          role="listitem"
                          className={`sidebar-saved-profile${
                            profile.isActive ? " is-active" : ""
                          }`}
                          onClick={async () => {
                            await onActivateSavedProfile(profile.id);
                            closeAccountMenu();
                          }}
                          disabled={profile.isActive || isBusy || accountSwitching}
                        >
                          <span className="sidebar-saved-profile-head">
                            <span className="sidebar-saved-profile-label">{label}</span>
                            <span className="sidebar-saved-profile-state">
                              {profile.isActive
                                ? "Active"
                                : isBusy
                                  ? "Switching..."
                                  : "Use"}
                            </span>
                          </span>
                          {meta && (
                            <span className="sidebar-saved-profile-meta">{meta}</span>
                          )}
                        </button>
                      );
                    })}
                    {!savedProfilesLoading && selectableProfiles.length === 0 && (
                      <div className="sidebar-saved-profiles-empty">
                        Only the current login is saved right now.
                      </div>
                    )}
                  </div>
                )}
              </PopoverSurface>
            )}
          </div>
        )}
        <div className="sidebar-utility-actions">
            <button
              className="ghost sidebar-labeled-button sidebar-utility-button"
              type="button"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <span className="sidebar-labeled-button-icon" aria-hidden>
                <Settings size={14} aria-hidden />
              </span>
              <span>Settings</span>
            </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button"
              type="button"
              onClick={onOpenDebug}
              aria-label="Open debug log"
            >
              <ScrollText size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
