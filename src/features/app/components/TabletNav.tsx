import type { ReactNode } from "react";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import MessagesSquare from "lucide-react/dist/esm/icons/messages-square";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";

type TabletNavTab = "codex" | "git" | "log";

type TabletNavProps = {
  activeTab: TabletNavTab;
  onSelect: (tab: TabletNavTab) => void;
};

const tabs: { id: TabletNavTab; label: string; icon: ReactNode }[] = [
  { id: "codex", label: "Codex", icon: <MessagesSquare className="tablet-nav-icon" /> },
  { id: "git", label: "Git", icon: <GitBranch className="tablet-nav-icon" /> },
  { id: "log", label: "Log", icon: <TerminalSquare className="tablet-nav-icon" /> },
];

export function TabletNav({ activeTab, onSelect }: TabletNavProps) {
  return (
    <nav className="tablet-nav" aria-label="Workspace">
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
