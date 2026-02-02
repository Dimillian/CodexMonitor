import type { ReactNode } from "react";
import Folder from "lucide-react/dist/esm/icons/folder";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Lightbulb from "lucide-react/dist/esm/icons/lightbulb";

export type PanelTabId = "git" | "files" | "prompts" | "ideas";

type PanelTab = {
  id: PanelTabId;
  label: string;
  icon: ReactNode;
};

type PanelTabsProps = {
  active: PanelTabId;
  onSelect: (id: PanelTabId) => void;
  tabs?: PanelTab[];
};

const defaultTabs: PanelTab[] = [
  { id: "git", label: "Git", icon: <GitBranch aria-hidden /> },
  { id: "files", label: "Files", icon: <Folder aria-hidden /> },
  { id: "prompts", label: "Prompts", icon: <ScrollText aria-hidden /> },
  { id: "ideas", label: "Ideas", icon: <Lightbulb aria-hidden /> },
];

export function PanelTabs({ active, onSelect, tabs = defaultTabs }: PanelTabsProps) {
  return (
    <div className="panel-tabs" role="tablist" aria-label="Panel">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
            title={tab.label}
          >
            <span className="panel-tab-icon" aria-hidden>
              {tab.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
