import { useEffect } from "react";

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
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
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
