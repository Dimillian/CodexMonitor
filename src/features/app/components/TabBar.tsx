import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import House from "lucide-react/dist/esm/icons/house";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";

type TabKey = "home" | "projects" | "codex" | "git" | "log";

type TabBarProps = {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
};

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  const { t } = useTranslation("app");
  const tabs: { id: TabKey; label: string; icon: ReactNode }[] = [
    { id: "home", label: t("tabBar.home"), icon: <House className="tabbar-icon" /> },
    { id: "projects", label: t("tabBar.projects"), icon: <FolderKanban className="tabbar-icon" /> },
    { id: "codex", label: t("tabBar.codex"), icon: <MessagesSquare className="tabbar-icon" /> },
    { id: "git", label: t("tabBar.git"), icon: <GitBranch className="tabbar-icon" /> },
    { id: "log", label: t("tabBar.log"), icon: <TerminalSquare className="tabbar-icon" /> },
  ];

  return (
    <nav className="tabbar" aria-label={t("tabBar.ariaLabel")}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tabbar-item ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          {tab.icon}
          <span className="tabbar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
