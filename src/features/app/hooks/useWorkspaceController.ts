import { useWorkspaces } from "../../workspaces/hooks/useWorkspaces";
import type { AppSettings } from "../../../types";
import type { DebugEntry } from "../../../types";

type WorkspaceControllerOptions = {
  appSettings: AppSettings;
  addDebugEntry: (entry: DebugEntry) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function useWorkspaceController({
  appSettings,
  addDebugEntry,
  queueSaveSettings,
}: WorkspaceControllerOptions) {
  return useWorkspaces({
    onDebug: addDebugEntry,
    defaultCodexBin: appSettings.codexBin,
    appSettings,
    onUpdateAppSettings: queueSaveSettings,
  });
}
