import { useEffect } from "react";
import { matchesShortcut } from "../../../utils/shortcuts";

type UseBranchSwitcherShortcutOptions = {
  shortcut: string | null;
  isEnabled: boolean;
  onTrigger: () => void;
};

export function useBranchSwitcherShortcut({
  shortcut,
  isEnabled,
  onTrigger,
}: UseBranchSwitcherShortcutOptions) {
  useEffect(() => {
    if (!isEnabled || !shortcut) {
      return;
    }

    const isEditableEventTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        ),
      );
    };

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        onTrigger();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, onTrigger, shortcut]);
}
