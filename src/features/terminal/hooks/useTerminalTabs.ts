import { useCallback, useMemo, useState } from "react";

export type TerminalTab = {
  id: string;
  title: string;
};

type UseTerminalTabsOptions = {
  activeWorkspaceId: string | null;
  onCloseTerminal?: (workspaceId: string, terminalId: string) => void;
};

function createTerminalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTerminalTabs({
  activeWorkspaceId,
  onCloseTerminal,
}: UseTerminalTabsOptions) {
  const [tabsByWorkspace, setTabsByWorkspace] = useState<
    Record<string, TerminalTab[]>
  >({});
  const [activeTerminalIdByWorkspace, setActiveTerminalIdByWorkspace] = useState<
    Record<string, string | null>
  >({});

  const createTerminal = useCallback((workspaceId: string) => {
    const id = createTerminalId();
    setTabsByWorkspace((prev) => {
      const existing = prev[workspaceId] ?? [];
      const title = `Terminal ${existing.length + 1}`;
      return {
        ...prev,
        [workspaceId]: [...existing, { id, title }],
      };
    });
    setActiveTerminalIdByWorkspace((prev) => ({ ...prev, [workspaceId]: id }));
    return id;
  }, []);

  const ensureTerminalWithTitle = useCallback(
    (workspaceId: string, terminalId: string, title: string) => {
      setTabsByWorkspace((prev) => {
        const existing = prev[workspaceId] ?? [];
        const index = existing.findIndex((tab) => tab.id === terminalId);
        if (index === -1) {
          return {
            ...prev,
            [workspaceId]: [...existing, { id: terminalId, title }],
          };
        }
        if (existing[index].title === title) {
          return prev;
        }
        const nextTabs = existing.slice();
        nextTabs[index] = { ...existing[index], title };
        return { ...prev, [workspaceId]: nextTabs };
      });
      setActiveTerminalIdByWorkspace((prev) => ({ ...prev, [workspaceId]: terminalId }));
      return terminalId;
    },
    [],
  );

  const closeTerminal = useCallback(
    (workspaceId: string, terminalId: string) => {
      setTabsByWorkspace((prev) => {
        const existing = prev[workspaceId] ?? [];
        const nextTabs = existing.filter((tab) => tab.id !== terminalId);
        setActiveTerminalIdByWorkspace((prevActive) => {
          const active = prevActive[workspaceId];
          if (active !== terminalId) {
            return prevActive;
          }
          const nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null;
          if (!nextActive) {
            const { [workspaceId]: _, ...rest } = prevActive;
            return rest;
          }
          return { ...prevActive, [workspaceId]: nextActive };
        });
        if (nextTabs.length === 0) {
          const { [workspaceId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [workspaceId]: nextTabs };
      });
      onCloseTerminal?.(workspaceId, terminalId);
    },
    [onCloseTerminal],
  );

  const setActiveTerminal = useCallback((workspaceId: string, terminalId: string) => {
    setActiveTerminalIdByWorkspace((prev) => ({ ...prev, [workspaceId]: terminalId }));
  }, []);

  const ensureTerminal = useCallback(
    (workspaceId: string) => {
      const active = activeTerminalIdByWorkspace[workspaceId];
      if (active) {
        return active;
      }
      return createTerminal(workspaceId);
    },
    [activeTerminalIdByWorkspace, createTerminal],
  );

  const terminals = useMemo(() => {
    if (!activeWorkspaceId) {
      return [];
    }
    return tabsByWorkspace[activeWorkspaceId] ?? [];
  }, [activeWorkspaceId, tabsByWorkspace]);

  const activeTerminalId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return activeTerminalIdByWorkspace[activeWorkspaceId] ?? null;
  }, [activeTerminalIdByWorkspace, activeWorkspaceId]);

  return {
    terminals,
    activeTerminalId,
    createTerminal,
    ensureTerminalWithTitle,
    closeTerminal,
    setActiveTerminal,
    ensureTerminal,
  };
}
