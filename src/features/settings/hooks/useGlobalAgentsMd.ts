import { readGlobalAgentsMd, writeGlobalAgentsMd } from "@services/tauri";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

export function useGlobalAgentsMd(codexHome?: string | null) {
  return useFileEditor({
    key: `global-agents:${codexHome ?? "default"}`,
    read: readGlobalAgentsMd,
    write: writeGlobalAgentsMd,
    readErrorTitle: "Couldn’t load global AGENTS.md",
    writeErrorTitle: "Couldn’t save global AGENTS.md",
  });
}
