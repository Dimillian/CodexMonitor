import Copy from "lucide-react/dist/esm/icons/copy";
import Minus from "lucide-react/dist/esm/icons/minus";
import Square from "lucide-react/dist/esm/icons/square";
import X from "lucide-react/dist/esm/icons/x";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useState } from "react";
import { isWindowsPlatform } from "@utils/platformPaths";

type WindowCaptionControlsProps = {
  enabled: boolean;
};

function currentWindowSafe() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowCaptionControls({ enabled }: WindowCaptionControlsProps) {
  const isEnabled = useMemo(() => enabled && isWindowsPlatform() && isTauri(), [enabled]);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let mounted = true;
    let unlistenResized: (() => void) | null = null;
    const windowHandle = currentWindowSafe();
    if (!windowHandle) {
      return;
    }

    const syncMaximized = async () => {
      try {
        const next = await windowHandle.isMaximized();
        if (mounted) {
          setIsMaximized(next);
        }
      } catch {
        // Ignore non-Tauri/test runtimes.
      }
    };

    void syncMaximized();
    void windowHandle
      .onResized(() => {
        void syncMaximized();
      })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
          return;
        }
        unlistenResized = unlisten;
      })
      .catch(() => {
        // Ignore non-Tauri/test runtimes.
      });

    return () => {
      mounted = false;
      if (unlistenResized) {
        unlistenResized();
      }
    };
  }, [isEnabled]);

  if (!isEnabled) {
    return null;
  }

  const handleMinimize = () => {
    const windowHandle = currentWindowSafe();
    if (!windowHandle) {
      return;
    }
    void windowHandle.minimize();
  };

  const handleToggleMaximize = () => {
    const windowHandle = currentWindowSafe();
    if (!windowHandle) {
      return;
    }
    void windowHandle.toggleMaximize();
  };

  const handleClose = () => {
    const windowHandle = currentWindowSafe();
    if (!windowHandle) {
      return;
    }
    void windowHandle.close();
  };

  return (
    <div className="window-caption-controls" role="group" aria-label="Window controls">
      <button
        type="button"
        className="window-caption-control"
        aria-label="Minimize window"
        data-tauri-drag-region="false"
        onClick={handleMinimize}
      >
        <Minus aria-hidden />
      </button>
      <button
        type="button"
        className="window-caption-control"
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        data-tauri-drag-region="false"
        onClick={handleToggleMaximize}
      >
        {isMaximized ? <Copy aria-hidden /> : <Square aria-hidden />}
      </button>
      <button
        type="button"
        className="window-caption-control window-caption-control-close"
        aria-label="Close window"
        data-tauri-drag-region="false"
        onClick={handleClose}
      >
        <X aria-hidden />
      </button>
    </div>
  );
}
