import { useWorkspaces } from "../../workspaces/hooks/useWorkspaces";
import type { AppSettings } from "../../../types";
import type { DebugEntry } from "../../../types";

type WorkspaceControllerOptions = {
  appSettings: AppSettings;
  addDebugEntry: (entry: DebugEntry) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

function getActiveCliBin(settings: AppSettings): string | null {
  switch (settings.cliType) {
    case "gemini":
      return settings.geminiBin;
    case "cursor":
      return settings.cursorBin;
    case "claude":
      return settings.claudeBin;
    default:
      return settings.codexBin;
  }
}

export function useWorkspaceController({
  appSettings,
  addDebugEntry,
  queueSaveSettings,
}: WorkspaceControllerOptions) {
  return useWorkspaces({
    onDebug: addDebugEntry,
    defaultCodexBin: getActiveCliBin(appSettings),
    appSettings,
    onUpdateAppSettings: queueSaveSettings,
  });
}
