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
import type { CodexSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
};

export function SettingsNav({ activeSection, onSelectSection }: SettingsNavProps) {
  return (
    <aside className="settings-sidebar">
      <button
        type="button"
        className={`settings-nav ${activeSection === "projects" ? "active" : ""}`}
        onClick={() => onSelectSection("projects")}
      >
        <LayoutGrid aria-hidden />
        Projects
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "environments" ? "active" : ""}`}
        onClick={() => onSelectSection("environments")}
      >
        <Layers aria-hidden />
        Environments
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "display" ? "active" : ""}`}
        onClick={() => onSelectSection("display")}
      >
        <SlidersHorizontal aria-hidden />
        Display &amp; Sound
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "composer" ? "active" : ""}`}
        onClick={() => onSelectSection("composer")}
      >
        <FileText aria-hidden />
        Composer
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "dictation" ? "active" : ""}`}
        onClick={() => onSelectSection("dictation")}
      >
        <Mic aria-hidden />
        Dictation
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "shortcuts" ? "active" : ""}`}
        onClick={() => onSelectSection("shortcuts")}
      >
        <Keyboard aria-hidden />
        Shortcuts
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "open-apps" ? "active" : ""}`}
        onClick={() => onSelectSection("open-apps")}
      >
        <ExternalLink aria-hidden />
        Open in
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "git" ? "active" : ""}`}
        onClick={() => onSelectSection("git")}
      >
        <GitBranch aria-hidden />
        Git
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "codex" ? "active" : ""}`}
        onClick={() => onSelectSection("codex")}
      >
        <TerminalSquare aria-hidden />
        CLI Backend
      </button>
      <button
        type="button"
        className={`settings-nav ${activeSection === "features" ? "active" : ""}`}
        onClick={() => onSelectSection("features")}
      >
        <FlaskConical aria-hidden />
        Features
      </button>
    </aside>
  );
}
