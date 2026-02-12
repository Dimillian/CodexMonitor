import { SettingsCodexSection } from "./SettingsCodexSection";
import { SettingsComposerSection } from "./SettingsComposerSection";
import { SettingsDictationSection } from "./SettingsDictationSection";
import { SettingsDisplaySection } from "./SettingsDisplaySection";
import { SettingsEnvironmentsSection } from "./SettingsEnvironmentsSection";
import { SettingsFeaturesSection } from "./SettingsFeaturesSection";
import { SettingsGitSection } from "./SettingsGitSection";
import { SettingsOpenAppsSection } from "./SettingsOpenAppsSection";
import { SettingsProjectsSection } from "./SettingsProjectsSection";
import { SettingsServerSection } from "./SettingsServerSection";
import { SettingsShortcutsSection } from "./SettingsShortcutsSection";
import type { CodexSection } from "@settings/components/settingsTypes";
import type { SettingsViewOrchestration } from "@settings/hooks/useSettingsViewOrchestration";

type SettingsSectionContainersProps = {
  activeSection: CodexSection;
  orchestration: SettingsViewOrchestration;
};

export function SettingsSectionContainers({
  activeSection,
  orchestration,
}: SettingsSectionContainersProps) {
  if (activeSection === "projects") {
    return <SettingsProjectsSection {...orchestration.projectsSectionProps} />;
  }
  if (activeSection === "environments") {
    return <SettingsEnvironmentsSection {...orchestration.environmentsSectionProps} />;
  }
  if (activeSection === "display") {
    return <SettingsDisplaySection {...orchestration.displaySectionProps} />;
  }
  if (activeSection === "composer") {
    return <SettingsComposerSection {...orchestration.composerSectionProps} />;
  }
  if (activeSection === "dictation") {
    return <SettingsDictationSection {...orchestration.dictationSectionProps} />;
  }
  if (activeSection === "shortcuts") {
    return <SettingsShortcutsSection {...orchestration.shortcutsSectionProps} />;
  }
  if (activeSection === "open-apps") {
    return <SettingsOpenAppsSection {...orchestration.openAppsSectionProps} />;
  }
  if (activeSection === "git") {
    return <SettingsGitSection {...orchestration.gitSectionProps} />;
  }
  if (activeSection === "server") {
    return <SettingsServerSection {...orchestration.serverSectionProps} />;
  }
  if (activeSection === "codex") {
    return <SettingsCodexSection {...orchestration.codexSectionProps} />;
  }
  if (activeSection === "features") {
    return <SettingsFeaturesSection {...orchestration.featuresSectionProps} />;
  }
  return null;
}
