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
import { useI18n } from "@/i18n/useI18n";
import type { CodexSection } from "./settingsTypes";

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
          {t("settings.nav.projects")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Layers aria-hidden />}
          active={activeSection === "environments"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("environments")}
        >
          {t("settings.nav.environments")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<SlidersHorizontal aria-hidden />}
          active={activeSection === "display"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("display")}
        >
          {t("settings.nav.display")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FileText aria-hidden />}
          active={activeSection === "composer"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("composer")}
        >
          {t("settings.nav.composer")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Mic aria-hidden />}
          active={activeSection === "dictation"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("dictation")}
        >
          {t("settings.nav.dictation")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Keyboard aria-hidden />}
          active={activeSection === "shortcuts"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("shortcuts")}
        >
          {t("settings.nav.shortcuts")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ExternalLink aria-hidden />}
          active={activeSection === "open-apps"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("open-apps")}
        >
          {t("settings.nav.openApps")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<GitBranch aria-hidden />}
          active={activeSection === "git"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("git")}
        >
          {t("settings.nav.git")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ServerCog aria-hidden />}
          active={activeSection === "server"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("server")}
        >
          {t("settings.nav.server")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Bot aria-hidden />}
          active={activeSection === "agents"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("agents")}
        >
          {t("settings.nav.agents")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<TerminalSquare aria-hidden />}
          active={activeSection === "codex"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("codex")}
        >
          {t("settings.nav.codex")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FlaskConical aria-hidden />}
          active={activeSection === "features"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("features")}
        >
          {t("settings.nav.features")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Info aria-hidden />}
          active={activeSection === "about"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("about")}
        >
          {t("settings.nav.about")}
        </PanelNavItem>
      </PanelNavList>
    </aside>
  );
}
