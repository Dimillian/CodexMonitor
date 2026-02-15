import type { ReactNode } from "react";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import Layers from "lucide-react/dist/esm/icons/layers";
import ServerCog from "lucide-react/dist/esm/icons/server-cog";
import { PanelNavItem, PanelNavList } from "../../design-system/components/panel/PanelPrimitives";
import type { CodexSection } from "./settingsTypes";
import {
  SETTINGS_SECTION_GROUPS,
  type SettingsSectionGroupId,
  getSettingsSectionGroup,
} from "./settingsViewConstants";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  showDisclosure?: boolean;
};

export function SettingsNav({
  activeSection,
  onSelectSection,
  showDisclosure = false,
}: SettingsNavProps) {
  const activeGroupId = getSettingsSectionGroup(activeSection).id;
  const iconByGroup: Record<SettingsSectionGroupId, ReactNode> = {
    projects: <LayoutGrid aria-hidden />,
    environments: <Layers aria-hidden />,
    display: <SlidersHorizontal aria-hidden />,
    input: <FileText aria-hidden />,
    interaction: <Keyboard aria-hidden />,
    git: <GitBranch aria-hidden />,
    services: <ServerCog aria-hidden />,
    features: <FlaskConical aria-hidden />,
  };

  const handleSelectGroup = (groupId: SettingsSectionGroupId) => {
    const group = SETTINGS_SECTION_GROUPS.find((entry) => entry.id === groupId);
    if (!group) {
      return;
    }
    const nextSection = group.sections.includes(activeSection)
      ? activeSection
      : group.sections[0];
    onSelectSection(nextSection);
  };

  return (
    <aside className="settings-sidebar">
      <PanelNavList className="settings-nav-list">
        {SETTINGS_SECTION_GROUPS.map((group) => (
          <PanelNavItem
            key={group.id}
            className="settings-nav"
            icon={iconByGroup[group.id]}
            active={activeGroupId === group.id}
            showDisclosure={showDisclosure}
            onClick={() => handleSelectGroup(group.id)}
          >
            {group.label}
          </PanelNavItem>
        ))}
      </PanelNavList>
    </aside>
  );
}
