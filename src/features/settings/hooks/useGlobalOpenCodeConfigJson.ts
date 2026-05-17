import { readGlobalOpenCodeConfigJson, writeGlobalOpenCodeConfigJson } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

export function useGlobalOpenCodeConfigJson() {
  return useFileEditor({
    key: "global-config",
    read: readGlobalOpenCodeConfigJson,
    write: writeGlobalOpenCodeConfigJson,
    readErrorTitle: "Couldn’t load global config.toml",
    writeErrorTitle: "Couldn’t save global config.toml",
  });
}
