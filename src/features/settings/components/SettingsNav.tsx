import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import ServerCog from "lucide-react/dist/esm/icons/server-cog";
import Bot from "lucide-react/dist/esm/icons/bot";
import Info from "lucide-react/dist/esm/icons/info";
import { PanelNavItem, PanelNavList } from "@/features/design-system/components/panel/PanelPrimitives";
import { useI18n } from "@/i18n";
import type { CodexSection } from "./settingsTypes";
import { SETTINGS_SECTION_LABEL_KEYS } from "./settingsViewConstants";

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
  const { t } = useI18n();
  const label = (section: CodexSection) => t(SETTINGS_SECTION_LABEL_KEYS[section]);

  return (
    <aside className="settings-sidebar">
      <PanelNavList className="settings-nav-list">
        <PanelNavItem
          className="settings-nav"
          icon={<LayoutGrid aria-hidden />}
          active={activeSection === "projects"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("projects")}
        >
          {label("projects")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Layers aria-hidden />}
          active={activeSection === "environments"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("environments")}
        >
          {label("environments")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<SlidersHorizontal aria-hidden />}
          active={activeSection === "display"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("display")}
        >
          {label("display")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FileText aria-hidden />}
          active={activeSection === "composer"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("composer")}
        >
          {label("composer")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Mic aria-hidden />}
          active={activeSection === "dictation"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("dictation")}
        >
          {label("dictation")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Keyboard aria-hidden />}
          active={activeSection === "shortcuts"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("shortcuts")}
        >
          {label("shortcuts")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ExternalLink aria-hidden />}
          active={activeSection === "open-apps"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("open-apps")}
        >
          {label("open-apps")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<GitBranch aria-hidden />}
          active={activeSection === "git"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("git")}
        >
          {label("git")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ServerCog aria-hidden />}
          active={activeSection === "server"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("server")}
        >
          {label("server")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Bot aria-hidden />}
          active={activeSection === "agents"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("agents")}
        >
          {label("agents")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<TerminalSquare aria-hidden />}
          active={activeSection === "codex"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("codex")}
        >
          {label("codex")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FlaskConical aria-hidden />}
          active={activeSection === "features"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("features")}
        >
          {label("features")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Info aria-hidden />}
          active={activeSection === "about"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("about")}
        >
          {label("about")}
        </PanelNavItem>
      </PanelNavList>
    </aside>
  );
}
