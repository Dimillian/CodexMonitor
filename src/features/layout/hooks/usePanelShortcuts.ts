import { useEffect } from "react";
import { matchesShortcut } from "../../../utils/shortcuts";

type UsePanelShortcutsOptions = {
  toggleDebugPanelShortcut: string | null;
  toggleTerminalShortcut: string | null;
  onToggleDebug: () => void;
  onToggleTerminal: () => void;
};

export function usePanelShortcuts({
  toggleDebugPanelShortcut,
  toggleTerminalShortcut,
  onToggleDebug,
  onToggleTerminal,
}: UsePanelShortcutsOptions) {
  useEffect(() => {
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
      if (matchesShortcut(event, toggleDebugPanelShortcut)) {
        event.preventDefault();
        onToggleDebug();
        return;
      }
      if (matchesShortcut(event, toggleTerminalShortcut)) {
        event.preventDefault();
        onToggleTerminal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleDebug, onToggleTerminal, toggleDebugPanelShortcut, toggleTerminalShortcut]);
}
