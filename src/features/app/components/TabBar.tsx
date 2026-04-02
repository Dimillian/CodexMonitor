import type { ReactNode } from "react";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import House from "lucide-react/dist/esm/icons/house";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import { useTranslation } from "react-i18next";

type TabKey = "home" | "projects" | "codex" | "git" | "log";

type TabBarProps = {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
};

const tabs: { id: TabKey; labelKey: string; icon: ReactNode }[] = [
  { id: "home", labelKey: "tabBar.home", icon: <House className="tabbar-icon" /> },
  {
    id: "projects",
    labelKey: "tabBar.projects",
    icon: <FolderKanban className="tabbar-icon" />,
  },
  { id: "codex", labelKey: "tabBar.codex", icon: <MessagesSquare className="tabbar-icon" /> },
  { id: "git", labelKey: "tabBar.git", icon: <GitBranch className="tabbar-icon" /> },
  { id: "log", labelKey: "tabBar.log", icon: <TerminalSquare className="tabbar-icon" /> },
];

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  const { t } = useTranslation();

  return (
    <nav className="tabbar" aria-label={t("tabBar.primary")}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tabbar-item ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          {tab.icon}
          <span className="tabbar-label">{t(tab.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
