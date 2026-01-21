import { useEffect, useMemo } from "react";

type UseInterruptShortcutOptions = {
  isEnabled: boolean;
  onTrigger: () => void | Promise<void>;
};

export function useInterruptShortcut({
  isEnabled,
  onTrigger,
}: UseInterruptShortcutOptions) {
  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }, []);

  useEffect(() => {
    if (!isEnabled || !isMac) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "c") {
        return;
      }
      event.preventDefault();
      void onTrigger();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, isMac, onTrigger]);
}
