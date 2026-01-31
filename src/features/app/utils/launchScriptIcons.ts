import type { LucideIcon } from "lucide-react";
import Play from "lucide-react/dist/esm/icons/play";
import Hammer from "lucide-react/dist/esm/icons/hammer";
import Bug from "lucide-react/dist/esm/icons/bug";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import Code2 from "lucide-react/dist/esm/icons/code-2";
import Server from "lucide-react/dist/esm/icons/server";
import Database from "lucide-react/dist/esm/icons/database";
import Package from "lucide-react/dist/esm/icons/package";
import TestTube2 from "lucide-react/dist/esm/icons/test-tube-2";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Settings from "lucide-react/dist/esm/icons/settings";
import Search from "lucide-react/dist/esm/icons/search";

export type LaunchScriptIconId =
  | "play"
  | "build"
  | "debug"
  | "wrench"
  | "terminal"
  | "code"
  | "server"
  | "database"
  | "package"
  | "test"
  | "lint"
  | "dev"
  | "git"
  | "config"
  | "logs";

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

export const LAUNCH_SCRIPT_ICON_OPTIONS = Object.keys(ICON_MAP).map((id) => ({
  id: id as LaunchScriptIconId,
  label: ICON_LABELS[id as LaunchScriptIconId],
}));

export function getLaunchScriptIcon(id?: string | null): LucideIcon {
  if (!id) {
    return ICON_MAP[DEFAULT_LAUNCH_SCRIPT_ICON];
  }
  return ICON_MAP[id as LaunchScriptIconId] ?? ICON_MAP[DEFAULT_LAUNCH_SCRIPT_ICON];
}

export function getLaunchScriptIconLabel(id?: string | null): string {
  if (!id) {
    return ICON_LABELS[DEFAULT_LAUNCH_SCRIPT_ICON];
  }
  return ICON_LABELS[id as LaunchScriptIconId] ?? ICON_LABELS[DEFAULT_LAUNCH_SCRIPT_ICON];
}
