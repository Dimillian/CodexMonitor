import { useCallback, useState } from "react";

type UsePanelVisibilityOptions = {
  isCompact: boolean;
  activeWorkspaceId: string | null;
  setActiveTab: (tab: "codex" | "git" | "log" | "projects") => void;
  setDebugOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
};

export function usePanelVisibility({
  isCompact,
  activeWorkspaceId,
  setActiveTab,
  setDebugOpen,
}: UsePanelVisibilityOptions) {
  const [terminalOpen, setTerminalOpen] = useState(false);

  const onToggleDebug = useCallback(() => {
    if (isCompact) {
      setActiveTab("log");
      return;
    }
    setDebugOpen((prev) => !prev);
  }, [isCompact, setActiveTab, setDebugOpen]);

  const onToggleTerminal = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    setTerminalOpen((prev) => !prev);
  }, [activeWorkspaceId]);

  const openTerminal = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    setTerminalOpen(true);
  }, [activeWorkspaceId]);

  const closeTerminal = useCallback(() => {
    setTerminalOpen(false);
  }, []);

  return {
    terminalOpen,
    onToggleDebug,
    onToggleTerminal,
    openTerminal,
    closeTerminal,
  };
}
