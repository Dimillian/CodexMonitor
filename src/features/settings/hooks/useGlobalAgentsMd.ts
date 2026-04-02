import { readGlobalAgentsMd, writeGlobalAgentsMd } from "@services/tauri";
import { useTranslation } from "react-i18next";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

export function useGlobalAgentsMd() {
  const { t } = useTranslation();
  return useFileEditor({
    key: "global-agents",
    read: readGlobalAgentsMd,
    write: writeGlobalAgentsMd,
    readErrorTitle: t("uiText.codexFiles.loadGlobalAgentsError"),
    writeErrorTitle: t("uiText.codexFiles.saveGlobalAgentsError"),
  });
}
