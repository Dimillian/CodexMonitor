import { useCallback, useMemo, useState } from "react";

export type TerminalTab = {
  id: string;
  title: string;
};

type TerminalTabRecord = TerminalTab & {
  autoNamed: boolean;
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

function renumberAutoNamedTabs(tabs: TerminalTabRecord[]): TerminalTabRecord[] {
  let autoNamedIndex = 1;
  let changed = false;
  const nextTabs = tabs.map((tab) => {
    if (!tab.autoNamed) {
      return tab;
    }
    const nextTitle = `Terminal ${autoNamedIndex}`;
    autoNamedIndex += 1;
    if (tab.title === nextTitle) {
      return tab;
    }
    changed = true;
    return {
      ...tab,
      title: nextTitle,
    };
  });
  return changed ? nextTabs : tabs;
}

export function useTerminalTabs({
  activeWorkspaceId,
  onCloseTerminal,
}: UseTerminalTabsOptions) {
  const [tabsByWorkspace, setTabsByWorkspace] = useState<
    Record<string, TerminalTabRecord[]>
  >({});
  const [activeTerminalIdByWorkspace, setActiveTerminalIdByWorkspace] = useState<
    Record<string, string | null>
  >({});

  const createTerminal = useCallback((workspaceId: string) => {
    const id = createTerminalId();
    setTabsByWorkspace((prev) => {
      const existing = prev[workspaceId] ?? [];
      const nextTabs = renumberAutoNamedTabs([
        ...existing,
        { id, title: "", autoNamed: true },
      ]);
      return {
        ...prev,
        [workspaceId]: nextTabs,
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
          const nextTabs = renumberAutoNamedTabs([
            ...existing,
            { id: terminalId, title, autoNamed: false },
          ]);
          return {
            ...prev,
            [workspaceId]: nextTabs,
          };
        }
        if (!existing[index].autoNamed && existing[index].title === title) {
          return prev;
        }
        const nextTabs = existing.slice();
        nextTabs[index] = {
          ...existing[index],
          title,
          autoNamed: false,
        };
        return {
          ...prev,
          [workspaceId]: renumberAutoNamedTabs(nextTabs),
        };
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
        const nextTabs = renumberAutoNamedTabs(
          existing.filter((tab) => tab.id !== terminalId),
        );
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
    return (tabsByWorkspace[activeWorkspaceId] ?? []).map(({ id, title }) => ({
      id,
      title,
    }));
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
