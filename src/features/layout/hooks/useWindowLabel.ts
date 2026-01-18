import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowLabel(defaultLabel = "main") {
  const [label, setLabel] = useState(defaultLabel);

  useEffect(() => {
    try {
      const window = getCurrentWindow();
      setLabel(window.label ?? defaultLabel);
    } catch {
      setLabel(defaultLabel);
    }
  }, [defaultLabel]);

  return label;
}
