import type { KeyboardEvent } from "react";
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
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder="Type shortcut"
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          Clear
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
  const isMac = isMacPlatform();

  const groups: ShortcutGroup[] = [
    {
      title: "File",
      subtitle: "Create agents and worktrees from the keyboard.",
      items: [
        {
          label: "New Agent",
          draftKey: "newAgent",
          settingKey: "newAgentShortcut",
          help: `Default: ${formatShortcut("cmd+n")}`,
        },
        {
          label: "New Worktree Agent",
          draftKey: "newWorktreeAgent",
          settingKey: "newWorktreeAgentShortcut",
          help: `Default: ${formatShortcut("cmd+shift+n")}`,
        },
        {
          label: "New Clone Agent",
          draftKey: "newCloneAgent",
          settingKey: "newCloneAgentShortcut",
          help: `Default: ${formatShortcut("cmd+alt+n")}`,
        },
        {
          label: "Archive active thread",
          draftKey: "archiveThread",
          settingKey: "archiveThreadShortcut",
          help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a")}`,
        },
      ],
    },
    {
      title: "Composer",
      subtitle: "Cycle between model, access, reasoning, and collaboration modes.",
      items: [
        {
          label: "Cycle model",
          draftKey: "model",
          settingKey: "composerModelShortcut",
          help: `Press a new shortcut while focused. Default: ${formatShortcut("cmd+shift+m")}`,
        },
        {
          label: "Cycle access mode",
          draftKey: "access",
          settingKey: "composerAccessShortcut",
          help: `Default: ${formatShortcut("cmd+shift+a")}`,
        },
        {
          label: "Cycle reasoning mode",
          draftKey: "reasoning",
          settingKey: "composerReasoningShortcut",
          help: `Default: ${formatShortcut("cmd+shift+r")}`,
        },
        {
          label: "Cycle collaboration mode",
          draftKey: "collaboration",
          settingKey: "composerCollaborationShortcut",
          help: `Default: ${formatShortcut("shift+tab")}`,
        },
        {
          label: "Stop active run",
          draftKey: "interrupt",
          settingKey: "interruptShortcut",
          help: `Default: ${formatShortcut(getDefaultInterruptShortcut())}`,
        },
      ],
    },
    {
      title: "Panels",
      subtitle: "Toggle sidebars and panels.",
      items: [
        {
          label: "Toggle projects sidebar",
          draftKey: "projectsSidebar",
          settingKey: "toggleProjectsSidebarShortcut",
          help: `Default: ${formatShortcut("cmd+shift+p")}`,
        },
        {
          label: "Toggle git sidebar",
          draftKey: "gitSidebar",
          settingKey: "toggleGitSidebarShortcut",
          help: `Default: ${formatShortcut("cmd+shift+g")}`,
        },
        {
          label: "Branch switcher",
          draftKey: "branchSwitcher",
          settingKey: "branchSwitcherShortcut",
          help: `Default: ${formatShortcut("cmd+b")}`,
        },
        {
          label: "Toggle debug panel",
          draftKey: "debugPanel",
          settingKey: "toggleDebugPanelShortcut",
          help: `Default: ${formatShortcut("cmd+shift+d")}`,
        },
        {
          label: "Toggle terminal panel",
          draftKey: "terminal",
          settingKey: "toggleTerminalShortcut",
          help: `Default: ${formatShortcut("cmd+shift+t")}`,
        },
      ],
    },
    {
      title: "Navigation",
      subtitle: "Cycle between agents and workspaces.",
      items: [
        {
          label: "Next agent",
          draftKey: "cycleAgentNext",
          settingKey: "cycleAgentNextShortcut",
          help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down")}`,
        },
        {
          label: "Previous agent",
          draftKey: "cycleAgentPrev",
          settingKey: "cycleAgentPrevShortcut",
          help: `Default: ${formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up")}`,
        },
        {
          label: "Next workspace",
          draftKey: "cycleWorkspaceNext",
          settingKey: "cycleWorkspaceNextShortcut",
          help: `Default: ${formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down")}`,
        },
        {
          label: "Previous workspace",
          draftKey: "cycleWorkspacePrev",
          settingKey: "cycleWorkspacePrevShortcut",
          help: `Default: ${formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up")}`,
        },
      ],
    },
  ];

  return (
    <section className="settings-section">
      <div className="settings-section-title">Shortcuts</div>
      <div className="settings-section-subtitle">
        Customize keyboard shortcuts for file actions, composer, panels, and navigation.
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
