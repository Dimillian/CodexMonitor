import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "@settings/components/settingsTypes";

type ShortcutItem = {
  label: string;
  draftKey: ShortcutDraftKey;
  settingKey: ShortcutSettingKey;
  help: string;
};

type ShortcutGroup = {
  title: string;
  subtitle: string;
  items: ShortcutItem[];
};

type SettingsShortcutsSectionProps = {
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
};

function ShortcutField({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={t("shortcuts_type")}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {t("shortcuts_clear")}
        </button>
      </div>
      <div className="settings-help">{item.help}</div>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: SettingsShortcutsSectionProps) {
  const { t } = useTranslation("settings");
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: t("shortcuts_group_file"),
        subtitle: t("shortcuts_group_file_subtitle"),
        items: [
          {
            label: t("shortcuts_new_agent"),
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+n") }),
          },
          {
            label: t("shortcuts_new_worktree_agent"),
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+n") }),
          },
          {
            label: t("shortcuts_new_clone_agent"),
            draftKey: "newCloneAgent",
            settingKey: "newCloneAgentShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+alt+n") }),
          },
          {
            label: t("shortcuts_archive_thread"),
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a") }),
          },
        ],
      },
      {
        title: t("shortcuts_group_composer"),
        subtitle: t("shortcuts_group_composer_subtitle"),
        items: [
          {
            label: t("shortcuts_cycle_model"),
            draftKey: "model",
            settingKey: "composerModelShortcut",
            help: t("shortcuts_cycle_model_help", { shortcut: formatShortcut("cmd+shift+m") }),
          },
          {
            label: t("shortcuts_cycle_access"),
            draftKey: "access",
            settingKey: "composerAccessShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+a") }),
          },
          {
            label: t("shortcuts_cycle_reasoning"),
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+r") }),
          },
          {
            label: t("shortcuts_cycle_collaboration"),
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("shift+tab") }),
          },
          {
            label: t("shortcuts_stop_run"),
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(getDefaultInterruptShortcut()) }),
          },
        ],
      },
      {
        title: t("shortcuts_group_panels"),
        subtitle: t("shortcuts_group_panels_subtitle"),
        items: [
          {
            label: t("shortcuts_toggle_projects"),
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+p") }),
          },
          {
            label: t("shortcuts_toggle_git"),
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+g") }),
          },
          {
            label: t("shortcuts_branch_switcher"),
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+b") }),
          },
          {
            label: t("shortcuts_toggle_debug"),
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+d") }),
          },
          {
            label: t("shortcuts_toggle_terminal"),
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut("cmd+shift+t") }),
          },
        ],
      },
      {
        title: t("shortcuts_group_navigation"),
        subtitle: t("shortcuts_group_navigation_subtitle"),
        items: [
          {
            label: t("shortcuts_next_agent"),
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down") }),
          },
          {
            label: t("shortcuts_prev_agent"),
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up") }),
          },
          {
            label: t("shortcuts_next_workspace"),
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down") }),
          },
          {
            label: t("shortcuts_prev_workspace"),
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            help: t("shortcuts_new_agent_help", { shortcut: formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up") }),
          },
        ],
      },
    ],
    [isMac, t],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchValue = `${group.title} ${group.subtitle} ${item.label} ${item.help}`.toLowerCase();
          return searchValue.includes(normalizedSearchQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedSearchQuery]);

  return (
    <SettingsSection
      title={t("shortcuts_title")}
      subtitle={t("shortcuts_subtitle")}
    >
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          {t("shortcuts_search")}
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder={t("shortcuts_search_placeholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              {t("shortcuts_clear")}
            </button>
          )}
        </div>
        <div className="settings-help">{t("shortcuts_search_help")}</div>
      </div>
      {filteredGroups.map((group, index) => (
        <div key={group.title}>
          {index > 0 && <div className="settings-divider" />}
          <SettingsSubsection title={group.title} subtitle={group.subtitle} />
          {group.items.map((item) => (
            <ShortcutField
              key={item.settingKey}
              item={item}
              shortcutDrafts={shortcutDrafts}
              onShortcutKeyDown={onShortcutKeyDown}
              onClearShortcut={onClearShortcut}
            />
          ))}
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <div className="settings-empty">
          {t("shortcuts_no_match", { query: normalizedSearchQuery ? `"${searchQuery.trim()}"` : t("shortcuts_search") })}
        </div>
      )}
    </SettingsSection>
  );
}
