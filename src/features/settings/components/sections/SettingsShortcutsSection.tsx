import { useMemo, useState, type KeyboardEvent } from "react";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import { useI18n } from "@/i18n/useI18n";
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
  const { t } = useI18n();
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={t("settings.shortcuts.field.inputPlaceholder")}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {t("settings.shortcuts.field.clear")}
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
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: t("settings.shortcuts.group.file.title"),
        subtitle: t("settings.shortcuts.group.file.subtitle"),
        items: [
          {
            label: t("settings.shortcuts.item.newAgent"),
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            help: `Default: ${formatShortcut("cmd+n")}`,
          },
          {
            label: t("settings.shortcuts.item.newWorktreeAgent"),
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            help: `Default: ${formatShortcut("cmd+shift+n")}`,
          },
          {
            label: t("settings.shortcuts.item.newCloneAgent"),
            draftKey: "newCloneAgent",
            settingKey: "newCloneAgentShortcut",
            help: `Default: ${formatShortcut("cmd+alt+n")}`,
          },
          {
            label: t("settings.shortcuts.item.archiveThread"),
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a")}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.composer.title"),
        subtitle: t("settings.shortcuts.group.composer.subtitle"),
        items: [
          {
            label: t("settings.shortcuts.item.cycleModel"),
            draftKey: "model",
            settingKey: "composerModelShortcut",
            help: `Press a new shortcut while focused. Default: ${formatShortcut("cmd+shift+m")}`,
          },
          {
            label: t("settings.shortcuts.item.cycleAccess"),
            draftKey: "access",
            settingKey: "composerAccessShortcut",
            help: `Default: ${formatShortcut("cmd+shift+a")}`,
          },
          {
            label: t("settings.shortcuts.item.cycleReasoning"),
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            help: `Default: ${formatShortcut("cmd+shift+r")}`,
          },
          {
            label: t("settings.shortcuts.item.cycleCollaboration"),
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            help: `Default: ${formatShortcut("shift+tab")}`,
          },
          {
            label: t("settings.shortcuts.item.stopRun"),
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            help: `Default: ${formatShortcut(getDefaultInterruptShortcut())}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.panels.title"),
        subtitle: t("settings.shortcuts.group.panels.subtitle"),
        items: [
          {
            label: t("settings.shortcuts.item.toggleProjectsSidebar"),
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            help: `Default: ${formatShortcut("cmd+shift+p")}`,
          },
          {
            label: t("settings.shortcuts.item.toggleGitSidebar"),
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            help: `Default: ${formatShortcut("cmd+shift+g")}`,
          },
          {
            label: t("settings.shortcuts.item.branchSwitcher"),
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            help: `Default: ${formatShortcut("cmd+b")}`,
          },
          {
            label: t("settings.shortcuts.item.toggleDebugPanel"),
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            help: `Default: ${formatShortcut("cmd+shift+d")}`,
          },
          {
            label: t("settings.shortcuts.item.toggleTerminalPanel"),
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            help: `Default: ${formatShortcut("cmd+shift+t")}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.navigation.title"),
        subtitle: t("settings.shortcuts.group.navigation.subtitle"),
        items: [
          {
            label: t("settings.shortcuts.item.nextAgent"),
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down")}`,
          },
          {
            label: t("settings.shortcuts.item.prevAgent"),
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up")}`,
          },
          {
            label: t("settings.shortcuts.item.nextWorkspace"),
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            help: `Default: ${formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down")}`,
          },
          {
            label: t("settings.shortcuts.item.prevWorkspace"),
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            help: `Default: ${formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up")}`,
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
      title={t("settings.shortcuts.sectionTitle")}
      subtitle={t("settings.shortcuts.sectionSubtitle")}
    >
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          {t("settings.shortcuts.search.label")}
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder={t("settings.shortcuts.search.placeholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              {t("settings.shortcuts.field.clear")}
            </button>
          )}
        </div>
        <div className="settings-help">
          {t("settings.shortcuts.search.help")}
        </div>
      </div>
      {filteredGroups.map((group, index) => (
        <div key={group.title}>
          {index > 0 && <div className="settings-divider" />}
          <div className="settings-subsection-title">{group.title}</div>
          <div className="settings-subsection-subtitle">{group.subtitle}</div>
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
          {t("settings.shortcuts.empty.prefix")}
          {normalizedSearchQuery
            ? `"${searchQuery.trim()}"`
            : t("settings.shortcuts.empty.fallback")}
          {t("settings.shortcuts.empty.suffix")}
        </div>
      )}
    </SettingsSection>
  );
}
