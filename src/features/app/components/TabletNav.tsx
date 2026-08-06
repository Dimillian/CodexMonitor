import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";

type TabletNavTab = "codex" | "git" | "log";

type TabletNavProps = {
  activeTab: TabletNavTab;
  onSelect: (tab: TabletNavTab) => void;
};

export function TabletNav({ activeTab, onSelect }: TabletNavProps) {
  const { t } = useTranslation("app");
  const tabs: { id: TabletNavTab; label: string; icon: ReactNode }[] = [
    { id: "codex", label: t("tabletNav.codex"), icon: <MessagesSquare className="tablet-nav-icon" /> },
    { id: "git", label: t("tabletNav.git"), icon: <GitBranch className="tablet-nav-icon" /> },
    { id: "log", label: t("tabletNav.log"), icon: <TerminalSquare className="tablet-nav-icon" /> },
  ];

  return (
    <nav className="tablet-nav" aria-label={t("tabletNav.ariaLabel")}>
      <div className="tablet-nav-group">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tablet-nav-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.icon}
            <span className="tablet-nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
