import { useMemo, useState, type KeyboardEvent } from "react";
<<<<<<< HEAD
import { formatShortcut, getDefaultInterruptShortcut } from "../../../../utils/shortcuts";
import { isMacPlatform } from "../../../../utils/platformPaths";
=======
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
>>>>>>> origin/main
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "../settingsTypes";

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
  conflictsBySetting?: Partial<Record<ShortcutSettingKey, ShortcutSettingKey[]>>;
};

function ShortcutField({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
  conflictLabels = [],
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
  conflictLabels?: string[];
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className={`settings-input settings-input--shortcut${
            conflictLabels.length > 0 ? " is-conflict" : ""
          }`}
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder="输入快捷键"
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          清除
        </button>
      </div>
      {conflictLabels.length > 0 && (
        <div className="settings-shortcut-warning">
          与以下快捷键冲突：{conflictLabels.join("、")}
        </div>
      )}
      <div className="settings-help">{item.help}</div>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
  conflictsBySetting = {},
}: SettingsShortcutsSectionProps) {
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

<<<<<<< HEAD
  const groups = useMemo<ShortcutGroup[]>(() => [
    {
      title: "文件",
      subtitle: "通过键盘创建对话和 worktree。",
      items: [
        {
          label: "新建对话",
          draftKey: "newAgent",
          settingKey: "newAgentShortcut",
          help: `默认： ${formatShortcut("cmd+n")}`,
        },
        {
          label: "新建 Worktree 对话",
          draftKey: "newWorktreeAgent",
          settingKey: "newWorktreeAgentShortcut",
          help: `默认： ${formatShortcut("cmd+shift+n")}`,
        },
        {
          label: "新建克隆对话",
          draftKey: "newCloneAgent",
          settingKey: "newCloneAgentShortcut",
          help: `默认： ${formatShortcut("cmd+alt+n")}`,
        },
        {
          label: "归档当前对话",
          draftKey: "archiveThread",
          settingKey: "archiveThreadShortcut",
          help: `默认： ${formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a")}`,
        },
      ],
    },
    {
      title: "编辑器",
      subtitle: "循环切换模型、权限、推理和协作模式。",
      items: [
        {
          label: "切换模型",
          draftKey: "model",
          settingKey: "composerModelShortcut",
          help: `聚焦输入框后按下新快捷键。默认：${formatShortcut("cmd+shift+m")}`,
        },
        {
          label: "切换推理模式",
          draftKey: "reasoning",
          settingKey: "composerReasoningShortcut",
          help: `默认： ${formatShortcut("cmd+shift+r")}`,
        },
        {
          label: "切换协作模式",
          draftKey: "collaboration",
          settingKey: "composerCollaborationShortcut",
          help: `默认： ${formatShortcut("shift+tab")}`,
        },
        {
          label: "停止当前运行",
          draftKey: "interrupt",
          settingKey: "interruptShortcut",
          help: `默认： ${formatShortcut(getDefaultInterruptShortcut())}`,
        },
      ],
    },
    {
      title: "面板",
      subtitle: "开关侧边栏与面板。",
      items: [
        {
          label: "切换项目侧边栏",
          draftKey: "projectsSidebar",
          settingKey: "toggleProjectsSidebarShortcut",
          help: `默认： ${formatShortcut("cmd+shift+p")}`,
        },
        {
          label: "切换 Git 侧边栏",
          draftKey: "gitSidebar",
          settingKey: "toggleGitSidebarShortcut",
          help: `默认： ${formatShortcut("cmd+shift+g")}`,
        },
        {
          label: "分支切换器",
          draftKey: "branchSwitcher",
          settingKey: "branchSwitcherShortcut",
          help: `默认： ${formatShortcut("cmd+b")}`,
        },
        {
          label: "切换调试面板",
          draftKey: "debugPanel",
          settingKey: "toggleDebugPanelShortcut",
          help: `默认： ${formatShortcut("cmd+shift+d")}`,
        },
        {
          label: "切换终端面板",
          draftKey: "terminal",
          settingKey: "toggleTerminalShortcut",
          help: `默认： ${formatShortcut("cmd+shift+t")}`,
        },
      ],
    },
    {
      title: "导航",
      subtitle: "在对话与工作区间循环切换。",
      items: [
        {
          label: "下一个对话",
          draftKey: "cycleAgentNext",
          settingKey: "cycleAgentNextShortcut",
          help: `默认： ${formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down")}`,
        },
        {
          label: "上一个对话",
          draftKey: "cycleAgentPrev",
          settingKey: "cycleAgentPrevShortcut",
          help: `默认： ${formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up")}`,
        },
        {
          label: "下一个工作区",
          draftKey: "cycleWorkspaceNext",
          settingKey: "cycleWorkspaceNextShortcut",
          help: `默认： ${formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down")}`,
        },
        {
          label: "上一个工作区",
          draftKey: "cycleWorkspacePrev",
          settingKey: "cycleWorkspacePrevShortcut",
          help: `默认： ${formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up")}`,
        },
      ],
    },
  ], [isMac]);

  const labelBySetting = useMemo(() => {
    const mapping: Partial<Record<ShortcutSettingKey, string>> = {};
    groups.forEach((group) => {
      group.items.forEach((item) => {
        mapping[item.settingKey] = item.label;
      });
    });
    return mapping;
  }, [groups]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => {
          if (!normalizedSearch) {
            return group;
          }
          const items = group.items.filter((item) => {
            const haystack = `${group.title} ${group.subtitle} ${item.label} ${item.help}`.toLowerCase();
            return haystack.includes(normalizedSearch);
          });
          return { ...group, items };
        })
        .filter((group) => group.items.length > 0),
    [groups, normalizedSearch],
  );
=======
  const groups = useMemo<ShortcutGroup[]>(
    () => [
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
    ],
    [isMac],
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
>>>>>>> origin/main

  return (
    <section className="settings-section">
      <div className="settings-section-title">快捷键</div>
      <div className="settings-section-subtitle">
        自定义文件操作、编辑器、面板与导航的快捷键。
      </div>
<<<<<<< HEAD
      <div className="settings-field">
        <input
          className="settings-input settings-input--compact"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索快捷键（例如：终端 / 工作区 / 分支）"
          aria-label="搜索快捷键"
        />
      </div>
      {filteredGroups.length === 0 && (
        <div className="settings-help">未找到匹配的快捷键项。</div>
      )}
=======
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          Search shortcuts
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder="Search shortcuts"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>
        <div className="settings-help">Filter by section name, action, or default shortcut.</div>
      </div>
>>>>>>> origin/main
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
              conflictLabels={(conflictsBySetting[item.settingKey] ?? [])
                .map((settingKey) => labelBySetting[settingKey] ?? settingKey)
                .filter((label) => Boolean(label))}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
