import type { KeyboardEvent } from "react";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={t('settings.keyboard_shortcuts.enter_shortcut')}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {t('settings.keyboard_shortcuts.clear')}
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
  const { t } = useTranslation();
  const isMac = isMacPlatform();

  const groups: ShortcutGroup[] = [
    {
      title: t('settings.keyboard_shortcuts.file'),
      subtitle: t('settings.keyboard_shortcuts.file_description'),
      items: [
        {
          label: t('settings.keyboard_shortcuts.new_agent'),
          draftKey: "newAgent",
          settingKey: "newAgentShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+n")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.new_worktree_agent'),
          draftKey: "newWorktreeAgent",
          settingKey: "newWorktreeAgentShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+n")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.new_clone_agent'),
          draftKey: "newCloneAgent",
          settingKey: "newCloneAgentShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+alt+n")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.archive_thread'),
          draftKey: "archiveThread",
          settingKey: "archiveThreadShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a")}`,
        },
      ],
    },
    {
      title: t('settings.keyboard_shortcuts.composer'),
      subtitle: t('settings.keyboard_shortcuts.composer_description'),
      items: [
        {
          label: t('settings.keyboard_shortcuts.toggle_model'),
          draftKey: "model",
          settingKey: "composerModelShortcut",
          help: `${t('settings.keyboard_shortcuts.focus_shortcut')} ${formatShortcut("cmd+shift+m")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_access'),
          draftKey: "access",
          settingKey: "composerAccessShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+a")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_reasoning'),
          draftKey: "reasoning",
          settingKey: "composerReasoningShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+r")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_collaboration'),
          draftKey: "collaboration",
          settingKey: "composerCollaborationShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("shift+tab")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.stop_running'),
          draftKey: "interrupt",
          settingKey: "interruptShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(getDefaultInterruptShortcut())}`,
        },
      ],
    },
    {
      title: t('settings.keyboard_shortcuts.panels'),
      subtitle: t('settings.keyboard_shortcuts.panels_description'),
      items: [
        {
          label: t('settings.keyboard_shortcuts.toggle_workspace_sidebar'),
          draftKey: "projectsSidebar",
          settingKey: "toggleProjectsSidebarShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+p")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_git_sidebar'),
          draftKey: "gitSidebar",
          settingKey: "toggleGitSidebarShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+g")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.branch_switcher'),
          draftKey: "branchSwitcher",
          settingKey: "branchSwitcherShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+b")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_debug_panel'),
          draftKey: "debugPanel",
          settingKey: "toggleDebugPanelShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+d")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.toggle_terminal_panel'),
          draftKey: "terminal",
          settingKey: "toggleTerminalShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut("cmd+shift+t")}`,
        },
      ],
    },
    {
      title: t('settings.keyboard_shortcuts.navigation'),
      subtitle: t('settings.keyboard_shortcuts.navigation_description'),
      items: [
        {
          label: t('settings.keyboard_shortcuts.next_agent'),
          draftKey: "cycleAgentNext",
          settingKey: "cycleAgentNextShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.previous_agent'),
          draftKey: "cycleAgentPrev",
          settingKey: "cycleAgentPrevShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.next_workspace'),
          draftKey: "cycleWorkspaceNext",
          settingKey: "cycleWorkspaceNextShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down")}`,
        },
        {
          label: t('settings.keyboard_shortcuts.previous_workspace'),
          draftKey: "cycleWorkspacePrev",
          settingKey: "cycleWorkspacePrevShortcut",
          help: `${t('settings.keyboard_shortcuts.default')}: ${formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up")}`,
        },
      ],
    },
  ];

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t('settings.sections.keyboard_shortcuts')}</div>
      <div className="settings-section-subtitle">
        {t('settings.keyboard_shortcuts.customize')}
      </div>
      {groups.map((group, index) => (
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
    </section>
  );
}
