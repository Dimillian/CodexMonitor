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
      if (event.repeat || event.defaultPrevented) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
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
