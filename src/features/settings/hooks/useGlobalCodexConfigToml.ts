import { readGlobalCodexConfigToml, writeGlobalCodexConfigToml } from "../../../services/tauri";
import { useFileEditor } from "../../shared/hooks/useFileEditor";

export function useGlobalCodexConfigToml() {
  return useFileEditor({
    key: "global-config",
    read: readGlobalCodexConfigToml,
    write: writeGlobalCodexConfigToml,
    readErrorTitle: "Couldn’t load global config.toml",
    writeErrorTitle: "Couldn’t save global config.toml",
  });
}
