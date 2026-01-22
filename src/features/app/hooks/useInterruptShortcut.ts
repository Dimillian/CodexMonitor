import { useEffect } from "react";
import { matchesShortcut } from "../../../utils/shortcuts";

type UseInterruptShortcutOptions = {
  isEnabled: boolean;
  shortcut: string | null;
  onTrigger: () => void | Promise<void>;
};

export function useInterruptShortcut({
  isEnabled,
  shortcut,
  onTrigger,
}: UseInterruptShortcutOptions) {
  useEffect(() => {
    if (!isEnabled || !shortcut) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (!matchesShortcut(event, shortcut)) {
        return;
      }
      event.preventDefault();
      void onTrigger();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, onTrigger, shortcut]);
}
