import type { LucideIcon } from "lucide-react";
import type { LaunchScriptIconId } from "../../../types";
export type { LaunchScriptIconId } from "../../../types";
import { Bug, Code2, Database, GitBranch, Hammer, Package, Play, RefreshCw, Search, Server, Settings, TerminalSquare, TestTube2, Wrench } from "lucide-react";

export const DEFAULT_LAUNCH_SCRIPT_ICON: LaunchScriptIconId = "play";

const ICON_MAP: Record<LaunchScriptIconId, LucideIcon> = {
  play: Play,
  build: Hammer,
  debug: Bug,
  wrench: Wrench,
  terminal: TerminalSquare,
  code: Code2,
  server: Server,
  database: Database,
  package: Package,
  test: TestTube2,
  lint: RefreshCw,
  dev: Play,
  git: GitBranch,
  config: Settings,
  logs: Search,
};

const ICON_LABELS: Record<LaunchScriptIconId, string> = {
  play: "Play",
  build: "Build",
  debug: "Debug",
  wrench: "Wrench",
  terminal: "Terminal",
  code: "Code",
  server: "Server",
  database: "Database",
  package: "Package",
  test: "Test",
  lint: "Lint",
  dev: "Dev",
  git: "Git",
  config: "Config",
  logs: "Logs",
};

function isLaunchScriptIconId(value: string): value is LaunchScriptIconId {
  return value in ICON_MAP;
}

export function coerceLaunchScriptIconId(value?: string | null): LaunchScriptIconId {
  if (!value) {
    return DEFAULT_LAUNCH_SCRIPT_ICON;
  }
  return isLaunchScriptIconId(value) ? value : DEFAULT_LAUNCH_SCRIPT_ICON;
}

export const LAUNCH_SCRIPT_ICON_OPTIONS = Object.keys(ICON_MAP).map((id) => {
  const iconId = coerceLaunchScriptIconId(id);
  return {
    id: iconId,
    label: ICON_LABELS[iconId],
  };
});

export function getLaunchScriptIcon(id?: string | null): LucideIcon {
  const iconId = coerceLaunchScriptIconId(id);
  return ICON_MAP[iconId];
}

export function getLaunchScriptIconLabel(id?: string | null): string {
  const iconId = coerceLaunchScriptIconId(id);
  return ICON_LABELS[iconId];
}
