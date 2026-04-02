import { readGlobalCodexConfigToml, writeGlobalCodexConfigToml } from "@services/tauri";
import { useTranslation } from "react-i18next";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

export function useGlobalCodexConfigToml() {
  const { t } = useTranslation();
  return useFileEditor({
    key: "global-config",
    read: readGlobalCodexConfigToml,
    write: writeGlobalCodexConfigToml,
    readErrorTitle: t("uiText.codexFiles.loadGlobalConfigError"),
    writeErrorTitle: t("uiText.codexFiles.saveGlobalConfigError"),
  });
}
