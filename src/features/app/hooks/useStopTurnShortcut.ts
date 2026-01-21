import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

type UseStopTurnShortcutOptions = {
  canStop: boolean;
  onStop: () => void;
};

export function useStopTurnShortcut({ canStop, onStop }: UseStopTurnShortcutOptions) {
  const windowRef = useRef(getCurrentWindow());
  const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});

  useEffect(() => {
    handlerRef.current = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key !== "Escape" && event.key !== "Esc") {
        return;
      }
      if (!canStop) {
        event.preventDefault();
      } else {
        event.preventDefault();
        onStop();
      }
      const windowHandle = windowRef.current;
      void windowHandle
        .isFullscreen()
        .then((isFullscreen) => {
          if (!isFullscreen) {
            return;
          }
          setTimeout(() => {
            void windowHandle.setFullscreen(true);
          }, 0);
        })
        .catch(() => {});
    };
  }, [canStop, onStop]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handlerRef.current(event);
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
}
