import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Folder from "lucide-react/dist/esm/icons/folder";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";

export type PanelTabId = "git" | "files" | "prompts";

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

export function PanelTabs({ active, onSelect, tabs }: PanelTabsProps) {
  const { t } = useTranslation();
  const resolvedTabs =
    tabs ??
    [
      { id: "git", label: t("layout.gitTab"), icon: <GitBranch aria-hidden /> },
      { id: "files", label: t("layout.filesTab"), icon: <Folder aria-hidden /> },
      { id: "prompts", label: t("layout.promptsTab"), icon: <ScrollText aria-hidden /> },
    ];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = resolvedTabs.findIndex((tab) => tab.id === active);
  const focusableIndex = activeIndex >= 0 ? activeIndex : 0;

  const selectByIndex = (index: number, options?: { focus?: boolean }) => {
    if (resolvedTabs.length === 0) {
      return;
    }
    const normalized = (index + resolvedTabs.length) % resolvedTabs.length;
    onSelect(resolvedTabs[normalized].id);
    if (options?.focus) {
      tabRefs.current[normalized]?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (resolvedTabs.length <= 1) {
      return;
    }
    const currentIndex = activeIndex >= 0 ? activeIndex : index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectByIndex(currentIndex + 1, { focus: true });
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectByIndex(currentIndex - 1, { focus: true });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectByIndex(0, { focus: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectByIndex(resolvedTabs.length - 1, { focus: true });
    }
  };

  return (
    <div
      className="panel-tabs"
      role="tablist"
      aria-label={t("layout.panelTabs")}
      aria-orientation="horizontal"
    >
      {resolvedTabs.map((tab, index) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={index === focusableIndex ? 0 : -1}
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
