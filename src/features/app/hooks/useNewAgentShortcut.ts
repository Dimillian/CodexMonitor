import { useEffect } from "react";
import { isMacPlatform } from "../../../utils/shortcuts";

type UseNewAgentShortcutOptions = {
  isEnabled: boolean;
  onTrigger: () => void;
};

export function useNewAgentShortcut({
  isEnabled,
  onTrigger,
}: UseNewAgentShortcutOptions) {
  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const isMac = isMacPlatform();
    function handleKeyDown(event: KeyboardEvent) {
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;
      if (modifierKey && event.key === "n" && !event.shiftKey) {
        event.preventDefault();
        onTrigger();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, onTrigger]);
}
