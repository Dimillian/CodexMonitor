import type {
  AccountSnapshot,
  RequestUserInputRequest,
  RateLimitSnapshot,
  ThreadListOrganizeMode,
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent, RefObject } from "react";
import { FolderOpen } from "lucide-react";
import Copy from "lucide-react/dist/esm/icons/copy";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Plus from "lucide-react/dist/esm/icons/plus";
import X from "lucide-react/dist/esm/icons/x";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { SidebarCornerActions } from "./SidebarCornerActions";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorktreeSection } from "./WorktreeSection";
import { PinnedThreadList } from "./PinnedThreadList";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useMenuController } from "../hooks/useMenuController";
import { useSidebarMenus } from "../hooks/useSidebarMenus";
import { useSidebarScrollFade } from "../hooks/useSidebarScrollFade";
import { useThreadRows } from "../hooks/useThreadRows";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { getUsageLabels } from "../utils/usageLabels";
import { formatRelativeTimeShort } from "../../../utils/time";
import type { ThreadStatusById } from "../../../utils/threadStatus";

const COLLAPSED_GROUPS_STORAGE_KEY = "codexmonitor.collapsedGroups";
const UNGROUPED_COLLAPSE_ID = "__ungrouped__";
const ADD_MENU_WIDTH = 200;
const ALL_THREADS_ADD_MENU_WIDTH = 220;

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type FlatThreadRow = {
  thread: ThreadSummary;
  depth: number;
  hasChildren: boolean;
  workspaceId: string;
  workspaceName: string;
};

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: WorkspaceGroupSection[];
  hasWorkspaceGroups: boolean;
  deletingWorktreeIds: Set<string>;
  newAgentDraftWorkspaceId?: string | null;
  startingDraftThreadWorkspaceId?: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: ThreadStatusById;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  pinnedThreadsVersion: number;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  threadListOrganizeMode: ThreadListOrganizeMode;
  onSetThreadListOrganizeMode: (organizeMode: ThreadListOrganizeMode) => void;
  onRefreshAllThreads: () => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  userInputRequests?: RequestUserInputRequest[];
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  showSubagentSessions: boolean;
  accountInfo: AccountSnapshot | null;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
  accountSwitching: boolean;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  workspaceDropTargetRef: RefObject<HTMLElement | null>;
  isWorkspaceDropActive: boolean;
  workspaceDropText: string;
  onWorkspaceDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDrop: (event: React.DragEvent<HTMLElement>) => void;
};

export const Sidebar = memo(function Sidebar({
  workspaces,
  groupedWorkspaces,
  hasWorkspaceGroups,
  deletingWorktreeIds,
  newAgentDraftWorkspaceId = null,
  startingDraftThreadWorkspaceId = null,
  threadsByWorkspace,
  threadParentById,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  pinnedThreadsVersion,
  threadListSortKey,
  onSetThreadListSortKey,
  threadListOrganizeMode,
  onSetThreadListOrganizeMode,
  onRefreshAllThreads,
  activeWorkspaceId,
  activeThreadId,
  userInputRequests = [],
  accountRateLimits,
  usageShowRemaining,
  showSubagentSessions,
  accountInfo,
  onSwitchAccount,
  onCancelSwitchAccount,
  accountSwitching,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  onAddWorkspace,
  onSelectHome,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onAddWorktreeAgent,
  onAddCloneAgent,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onDeleteThread,
  onSyncThread,
  pinThread,
  unpinThread,
  isThreadPinned,
  getPinTimestamp,
  getThreadArgsBadge,
  onRenameThread,
  onDeleteWorkspace,
  onDeleteWorktree,
  onLoadOlderThreads,
  onReloadWorkspaceThreads,
  workspaceDropTargetRef,
  isWorkspaceDropActive,
  workspaceDropText,
  onWorkspaceDragOver,
  onWorkspaceDragEnter,
  onWorkspaceDragLeave,
  onWorkspaceDrop,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [collapsedThreadIdsByWorkspace, setCollapsedThreadIdsByWorkspace] = useState<
    Record<string, Set<string>>
  >({});
  const [addMenuAnchor, setAddMenuAnchor] = useState<{
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [allThreadsAddMenuAnchor, setAllThreadsAddMenuAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const allThreadsAddMenuOpen = Boolean(allThreadsAddMenuAnchor);
  const addMenuController = useMenuController({
    open: Boolean(addMenuAnchor),
    onDismiss: () => setAddMenuAnchor(null),
  });
  const { containerRef: addMenuRef } = addMenuController;
  const allThreadsAddMenuController = useMenuController({
    open: Boolean(allThreadsAddMenuAnchor),
    onDismiss: () => setAllThreadsAddMenuAnchor(null),
  });
  const { containerRef: allThreadsAddMenuRef } = allThreadsAddMenuController;
  const { collapsedGroups, toggleGroupCollapse } = useCollapsedGroups(
    COLLAPSED_GROUPS_STORAGE_KEY,
  );
  const { getThreadRows } = useThreadRows(threadParentById);
  const { showThreadMenu, showWorkspaceMenu, showWorktreeMenu, showCloneMenu } =
    useSidebarMenus({
      onDeleteThread,
      onSyncThread,
      onPinThread: pinThread,
      onUnpinThread: unpinThread,
      isThreadPinned,
      onRenameThread,
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onDeleteWorktree,
    });
  const {
    sessionPercent,
    weeklyPercent,
    sessionResetLabel,
    weeklyResetLabel,
    creditsLabel,
    showWeekly,
  } = getUsageLabels(accountRateLimits, usageShowRemaining);
  const debouncedQuery = useDebouncedValue(searchQuery, 150);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const pendingUserInputKeys = useMemo(
    () =>
      new Set(
        userInputRequests
          .map((request) => {
            const workspaceId = request.workspace_id.trim();
            const threadId = request.params.thread_id.trim();
            return workspaceId && threadId ? `${workspaceId}:${threadId}` : "";
          })
          .filter(Boolean),
      ),
    [userInputRequests],
  );

  const isWorkspaceMatch = useCallback(
    (workspace: WorkspaceInfo) => {
      if (!normalizedQuery) {
        return true;
      }
      return workspace.name.toLowerCase().includes(normalizedQuery);
    },
    [normalizedQuery],
  );

  const renderHighlightedName = useCallback(
    (name: string) => {
      if (!normalizedQuery) {
        return name;
      }
      const lower = name.toLowerCase();
      const parts: React.ReactNode[] = [];
      let cursor = 0;
      let matchIndex = lower.indexOf(normalizedQuery, cursor);

      while (matchIndex !== -1) {
        if (matchIndex > cursor) {
          parts.push(name.slice(cursor, matchIndex));
        }
        parts.push(
          <span key={`${matchIndex}-${cursor}`} className="workspace-name-match">
            {name.slice(matchIndex, matchIndex + normalizedQuery.length)}
          </span>,
        );
        cursor = matchIndex + normalizedQuery.length;
        matchIndex = lower.indexOf(normalizedQuery, cursor);
      }

      if (cursor < name.length) {
        parts.push(name.slice(cursor));
      }

      return parts.length ? parts : name;
    },
    [normalizedQuery],
  );

  const accountEmail = accountInfo?.email?.trim() ?? "";
  const accountButtonLabel = accountEmail
    ? accountEmail
    : accountInfo?.type === "apikey"
      ? "API key"
      : "Sign in to Codex";
  const accountActionLabel = accountEmail ? "Switch account" : "Sign in";
  const showAccountSwitcher = Boolean(activeWorkspaceId);
  const accountSwitchDisabled = accountSwitching || !activeWorkspaceId;
  const accountCancelDisabled = !accountSwitching || !activeWorkspaceId;
  const refreshDisabled = workspaces.length === 0 || workspaces.every((workspace) => !workspace.connected);
  const refreshInProgress = workspaces.some(
    (workspace) => threadListLoadingByWorkspace[workspace.id] ?? false,
  );

  const pinnedThreadRows = useMemo(() => {
    type ThreadRow = { thread: ThreadSummary; depth: number; hasChildren: boolean };
    const groups: Array<{
      pinTime: number;
      workspaceId: string;
      rows: ThreadRow[];
    }> = [];

    workspaces.forEach((workspace) => {
      if (!isWorkspaceMatch(workspace)) {
        return;
      }
      const threads = threadsByWorkspace[workspace.id] ?? [];
      if (!threads.length) {
        return;
      }
      const { pinnedRows } = getThreadRows(
        threads,
        true,
        workspace.id,
        getPinTimestamp,
        pinnedThreadsVersion,
        {
          showSubagentSessions,
          collapsedParentThreadIds: collapsedThreadIdsByWorkspace[workspace.id],
        },
      );
      if (!pinnedRows.length) {
        return;
      }
      let currentRows: ThreadRow[] = [];
      let currentPinTime: number | null = null;

      pinnedRows.forEach((row) => {
        if (row.depth === 0) {
          if (currentRows.length && currentPinTime !== null) {
            groups.push({
              pinTime: currentPinTime,
              workspaceId: workspace.id,
              rows: currentRows,
            });
          }
          currentRows = [row];
          currentPinTime = getPinTimestamp(workspace.id, row.thread.id);
        } else {
          currentRows.push(row);
        }
      });

      if (currentRows.length && currentPinTime !== null) {
        groups.push({
          pinTime: currentPinTime,
          workspaceId: workspace.id,
          rows: currentRows,
        });
      }
    });

    return groups
      .sort((a, b) => a.pinTime - b.pinTime)
      .flatMap((group) =>
        group.rows.map((row) => ({
          ...row,
          workspaceId: group.workspaceId,
        })),
      );
  }, [
    workspaces,
    threadsByWorkspace,
    getThreadRows,
    getPinTimestamp,
    pinnedThreadsVersion,
    isWorkspaceMatch,
    showSubagentSessions,
    collapsedThreadIdsByWorkspace,
  ]);

  const cloneSourceIdsMatchingQuery = useMemo(() => {
    if (!normalizedQuery) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    workspaces.forEach((workspace) => {
      const sourceId = workspace.settings.cloneSourceWorkspaceId?.trim();
      if (!sourceId) {
        return;
      }
      if (isWorkspaceMatch(workspace)) {
        ids.add(sourceId);
      }
    });
    return ids;
  }, [isWorkspaceMatch, normalizedQuery, workspaces]);

  const filteredGroupedWorkspaces = useMemo(
    () =>
      groupedWorkspaces
        .map((group) => ({
          ...group,
          workspaces: group.workspaces.filter(
            (workspace) =>
              isWorkspaceMatch(workspace) ||
              cloneSourceIdsMatchingQuery.has(workspace.id),
          ),
        }))
        .filter((group) => group.workspaces.length > 0),
    [cloneSourceIdsMatchingQuery, groupedWorkspaces, isWorkspaceMatch],
  );

  const getSortTimestamp = useCallback(
    (thread: ThreadSummary | undefined) => {
      if (!thread) {
        return 0;
      }
      if (threadListSortKey === "created_at") {
        return thread.createdAt ?? thread.updatedAt ?? 0;
      }
      return thread.updatedAt ?? thread.createdAt ?? 0;
    },
    [threadListSortKey],
  );

  const workspaceActivityById = useMemo(() => {
    const activityById = new Map<
      string,
      {
        hasThreads: boolean;
        timestamp: number;
      }
    >();
    const workspaceById = new Map<string, WorkspaceInfo>();
    workspaces.forEach((workspace) => {
      workspaceById.set(workspace.id, workspace);
    });

    const cloneWorkspacesBySourceId = new Map<string, WorkspaceInfo[]>();
    workspaces
      .filter((entry) => (entry.kind ?? "main") === "main")
      .forEach((entry) => {
        const sourceId = entry.settings.cloneSourceWorkspaceId?.trim();
        if (!sourceId || sourceId === entry.id || !workspaceById.has(sourceId)) {
          return;
        }
        const list = cloneWorkspacesBySourceId.get(sourceId) ?? [];
        list.push(entry);
        cloneWorkspacesBySourceId.set(sourceId, list);
      });

    filteredGroupedWorkspaces.forEach((group) => {
      group.workspaces.forEach((workspace) => {
        const rootThreads = threadsByWorkspace[workspace.id] ?? [];
        const visibleClones =
          normalizedQuery && !isWorkspaceMatch(workspace)
            ? (cloneWorkspacesBySourceId.get(workspace.id) ?? []).filter((clone) =>
                isWorkspaceMatch(clone),
              )
            : (cloneWorkspacesBySourceId.get(workspace.id) ?? []);
        let hasThreads = rootThreads.length > 0;
        let timestamp = getSortTimestamp(rootThreads[0]);

        visibleClones.forEach((clone) => {
          const cloneThreads = threadsByWorkspace[clone.id] ?? [];
          if (!cloneThreads.length) {
            return;
          }
          hasThreads = true;
          timestamp = Math.max(timestamp, getSortTimestamp(cloneThreads[0]));
        });

        activityById.set(workspace.id, {
          hasThreads,
          timestamp,
        });
      });
    });
    return activityById;
  }, [
    filteredGroupedWorkspaces,
    getSortTimestamp,
    isWorkspaceMatch,
    normalizedQuery,
    threadsByWorkspace,
    workspaces,
  ]);

  const sortedGroupedWorkspaces = useMemo(() => {
    if (threadListOrganizeMode !== "by_project_activity") {
      return filteredGroupedWorkspaces;
    }
    return filteredGroupedWorkspaces.map((group) => ({
      ...group,
      workspaces: group.workspaces.slice().sort((a, b) => {
        const aActivity = workspaceActivityById.get(a.id) ?? {
          hasThreads: false,
          timestamp: 0,
        };
        const bActivity = workspaceActivityById.get(b.id) ?? {
          hasThreads: false,
          timestamp: 0,
        };
        if (aActivity.hasThreads !== bActivity.hasThreads) {
          return aActivity.hasThreads ? -1 : 1;
        }
        const timestampDiff = bActivity.timestamp - aActivity.timestamp;
        if (timestampDiff !== 0) {
          return timestampDiff;
        }
        return a.name.localeCompare(b.name);
      }),
    }));
  }, [filteredGroupedWorkspaces, threadListOrganizeMode, workspaceActivityById]);

  const flatThreadRows = useMemo(() => {
    if (threadListOrganizeMode !== "threads_only") {
      return [] as FlatThreadRow[];
    }

    const rootGroups: Array<{
      rootTimestamp: number;
      workspaceName: string;
      rootIndex: number;
      rows: FlatThreadRow[];
    }> = [];

    filteredGroupedWorkspaces.forEach((group) => {
      group.workspaces.forEach((workspace) => {
        const threads = threadsByWorkspace[workspace.id] ?? [];
        if (!threads.length) {
          return;
        }
        const { unpinnedRows } = getThreadRows(
          threads,
          true,
          workspace.id,
          getPinTimestamp,
          pinnedThreadsVersion,
          {
            showSubagentSessions,
            collapsedParentThreadIds: collapsedThreadIdsByWorkspace[workspace.id],
          },
        );
        if (!unpinnedRows.length) {
          return;
        }

        let currentRows: FlatThreadRow[] = [];
        let currentRootTimestamp = 0;
        let currentRootIndex = 0;
        unpinnedRows.forEach((row, rowIndex) => {
          if (row.depth === 0) {
            if (currentRows.length > 0) {
              rootGroups.push({
                rootTimestamp: currentRootTimestamp,
                workspaceName: workspace.name,
                rootIndex: currentRootIndex,
                rows: currentRows,
              });
            }
            currentRows = [
              {
                ...row,
                workspaceId: workspace.id,
                workspaceName: workspace.name,
              },
            ];
            currentRootTimestamp = getSortTimestamp(row.thread);
            currentRootIndex = rowIndex;
            return;
          }
          currentRows.push({
            ...row,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
          });
        });
        if (currentRows.length > 0) {
          rootGroups.push({
            rootTimestamp: currentRootTimestamp,
            workspaceName: workspace.name,
            rootIndex: currentRootIndex,
            rows: currentRows,
          });
        }
      });
    });

    return rootGroups
      .sort((a, b) => {
        const timestampDiff = b.rootTimestamp - a.rootTimestamp;
        if (timestampDiff !== 0) {
          return timestampDiff;
        }
        const workspaceNameDiff = a.workspaceName.localeCompare(b.workspaceName);
        if (workspaceNameDiff !== 0) {
          return workspaceNameDiff;
        }
        return a.rootIndex - b.rootIndex;
      })
      .flatMap((group) => group.rows);
  }, [
    filteredGroupedWorkspaces,
    getPinTimestamp,
    getSortTimestamp,
    getThreadRows,
    pinnedThreadsVersion,
    threadListOrganizeMode,
    threadsByWorkspace,
    showSubagentSessions,
    collapsedThreadIdsByWorkspace,
  ]);

  const scrollFadeDeps = useMemo(
    () => [
      sortedGroupedWorkspaces,
      flatThreadRows,
      threadsByWorkspace,
      expandedWorkspaces,
      normalizedQuery,
      threadListOrganizeMode,
    ],
    [
      sortedGroupedWorkspaces,
      flatThreadRows,
      threadsByWorkspace,
      expandedWorkspaces,
      normalizedQuery,
      threadListOrganizeMode,
    ],
  );
  const { sidebarBodyRef, scrollFade, updateScrollFade } =
    useSidebarScrollFade(scrollFadeDeps);

  const workspaceNameById = useMemo(() => {
    const byId = new Map<string, string>();
    workspaces.forEach((workspace) => {
      byId.set(workspace.id, workspace.name);
    });
    return byId;
  }, [workspaces]);
  const getWorkspaceLabel = useCallback(
    (workspaceId: string) => workspaceNameById.get(workspaceId) ?? null,
    [workspaceNameById],
  );

  const groupedWorkspacesForRender =
    threadListOrganizeMode === "by_project_activity"
      ? sortedGroupedWorkspaces
      : filteredGroupedWorkspaces;
  const isThreadsOnlyMode = threadListOrganizeMode === "threads_only";

  const handleAllThreadsAddMenuToggle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (allThreadsAddMenuOpen) {
        setAllThreadsAddMenuAnchor(null);
        return;
      }
      setAddMenuAnchor(null);
      const rect = event.currentTarget.getBoundingClientRect();
      const left = Math.min(
        Math.max(rect.left, 12),
        window.innerWidth - ALL_THREADS_ADD_MENU_WIDTH - 12,
      );
      const top = rect.bottom + 8;
      setAllThreadsAddMenuAnchor({
        top,
        left,
        width: ALL_THREADS_ADD_MENU_WIDTH,
      });
    },
    [allThreadsAddMenuOpen],
  );

  const handleCreateThreadInProject = useCallback(
    (workspace: WorkspaceInfo) => {
      setAllThreadsAddMenuAnchor(null);
      onAddAgent(workspace);
    },
    [onAddAgent],
  );
  const isSearchActive = Boolean(normalizedQuery);

  const worktreesByParent = useMemo(() => {
    const worktrees = new Map<string, WorkspaceInfo[]>();
    workspaces
      .filter((entry) => (entry.kind ?? "main") === "worktree" && entry.parentId)
      .forEach((entry) => {
        const parentId = entry.parentId as string;
        const list = worktrees.get(parentId) ?? [];
        list.push(entry);
        worktrees.set(parentId, list);
      });
    worktrees.forEach((entries) => {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    });
    return worktrees;
  }, [workspaces]);

  const { clonesBySource, cloneChildIds } = useMemo(() => {
    const workspaceById = new Map<string, WorkspaceInfo>();
    workspaces.forEach((workspace) => {
      workspaceById.set(workspace.id, workspace);
    });

    const clones = new Map<string, WorkspaceInfo[]>();
    const cloneIds = new Set<string>();
    workspaces
      .filter((entry) => (entry.kind ?? "main") === "main")
      .forEach((entry) => {
        const sourceId = entry.settings.cloneSourceWorkspaceId?.trim();
        if (!sourceId || sourceId === entry.id || !workspaceById.has(sourceId)) {
          return;
        }
        const list = clones.get(sourceId) ?? [];
        list.push(entry);
        clones.set(sourceId, list);
        cloneIds.add(entry.id);
      });

    clones.forEach((entries) => {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    });

    return { clonesBySource: clones, cloneChildIds: cloneIds };
  }, [workspaces]);

  const projectOptionsForNewThread = useMemo(() => {
    const seen = new Set<string>();
    const projects: WorkspaceInfo[] = [];
    groupedWorkspacesForRender.forEach((group) => {
      group.workspaces.forEach((entry) => {
        if ((entry.kind ?? "main") !== "main") {
          return;
        }
        if (cloneChildIds.has(entry.id) || seen.has(entry.id)) {
          return;
        }
        seen.add(entry.id);
        projects.push(entry);
      });
    });
    return projects;
  }, [cloneChildIds, groupedWorkspacesForRender]);

  const handleToggleExpanded = useCallback((workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  }, []);

  const handleToggleThreadChildren = useCallback((workspaceId: string, threadId: string) => {
    setCollapsedThreadIdsByWorkspace((prev) => {
      const next = { ...prev };
      const existing = new Set(next[workspaceId] ?? []);
      if (existing.has(threadId)) {
        existing.delete(threadId);
      } else {
        existing.add(threadId);
      }
      if (existing.size === 0) {
        delete next[workspaceId];
      } else {
        next[workspaceId] = existing;
      }
      return next;
    });
  }, []);

  const getThreadTime = useCallback(
    (thread: ThreadSummary) => {
      const timestamp = thread.updatedAt ?? null;
      return timestamp ? formatRelativeTimeShort(timestamp) : null;
    },
    [],
  );

  useEffect(() => {
    if (!addMenuAnchor) {
      return;
    }
    function handleScroll() {
      setAddMenuAnchor(null);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [addMenuAnchor]);

  useEffect(() => {
    if (!allThreadsAddMenuAnchor) {
      return;
    }
    function handleScroll() {
      setAllThreadsAddMenuAnchor(null);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [allThreadsAddMenuAnchor]);

  useEffect(() => {
    if (!isSearchOpen && searchQuery) {
      setSearchQuery("");
    }
  }, [isSearchOpen, searchQuery]);

  return (
    <aside
      className={`sidebar${isSearchOpen ? " search-open" : ""}`}
      ref={workspaceDropTargetRef}
      onDragOver={onWorkspaceDragOver}
      onDragEnter={onWorkspaceDragEnter}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={onWorkspaceDrop}
    >
      <div className="sidebar-drag-strip" />
      <SidebarHeader
        onSelectHome={onSelectHome}
        onAddWorkspace={onAddWorkspace}
        onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
        isSearchOpen={isSearchOpen}
        threadListSortKey={threadListSortKey}
        onSetThreadListSortKey={onSetThreadListSortKey}
        threadListOrganizeMode={threadListOrganizeMode}
        onSetThreadListOrganizeMode={onSetThreadListOrganizeMode}
        onRefreshAllThreads={onRefreshAllThreads}
        refreshDisabled={refreshDisabled || refreshInProgress}
        refreshInProgress={refreshInProgress}
      />
      <div className={`sidebar-search${isSearchOpen ? " is-open" : ""}`}>
        {isSearchOpen && (
          <input
            className="sidebar-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            data-tauri-drag-region="false"
            autoFocus
          />
        )}
        {isSearchOpen && searchQuery.length > 0 && (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            data-tauri-drag-region="false"
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </div>
      <div
        className={`workspace-drop-overlay${
          isWorkspaceDropActive ? " is-active" : ""
        }`}
        aria-hidden
      >
        <div
          className={`workspace-drop-overlay-text${
            workspaceDropText === "Adding Project..." ? " is-busy" : ""
          }`}
        >
          {workspaceDropText === "Drop Project Here" && (
            <FolderOpen className="workspace-drop-overlay-icon" aria-hidden />
          )}
          {workspaceDropText}
        </div>
      </div>
      <div
        className={`sidebar-body${scrollFade.top ? " fade-top" : ""}${
          scrollFade.bottom ? " fade-bottom" : ""
        }`}
        onScroll={updateScrollFade}
        ref={sidebarBodyRef}
      >
        <div className="workspace-list">
          {pinnedThreadRows.length > 0 && (
            <div className="pinned-section">
              <div className="workspace-group-header">
                <div className="workspace-group-label">Pinned</div>
              </div>
              <PinnedThreadList
                rows={pinnedThreadRows}
                activeWorkspaceId={activeWorkspaceId}
                activeThreadId={activeThreadId}
                threadStatusById={threadStatusById}
                pendingUserInputKeys={pendingUserInputKeys}
                getThreadTime={getThreadTime}
                getThreadArgsBadge={getThreadArgsBadge}
                isThreadPinned={isThreadPinned}
                onSelectThread={onSelectThread}
                onShowThreadMenu={showThreadMenu}
                getWorkspaceLabel={isThreadsOnlyMode ? getWorkspaceLabel : undefined}
                collapsedThreadIdsByWorkspace={collapsedThreadIdsByWorkspace}
                onToggleThreadChildren={handleToggleThreadChildren}
              />
            </div>
          )}
          {isThreadsOnlyMode
            ? groupedWorkspacesForRender.length > 0 && (
                <div className="workspace-group">
                  <div className="workspace-group-header workspace-group-header-all-threads">
                    <div className="workspace-group-label">All threads</div>
                    <button
                      className="ghost all-threads-add"
                      onClick={handleAllThreadsAddMenuToggle}
                      data-tauri-drag-region="false"
                      aria-label="New thread in project"
                      title="New thread in project"
                      aria-expanded={allThreadsAddMenuOpen}
                      disabled={projectOptionsForNewThread.length === 0}
                    >
                      <Plus aria-hidden />
                    </button>
                  </div>
                  {flatThreadRows.length > 0 && (
                    <PinnedThreadList
                      rows={flatThreadRows}
                      activeWorkspaceId={activeWorkspaceId}
                      activeThreadId={activeThreadId}
                      threadStatusById={threadStatusById}
                      pendingUserInputKeys={pendingUserInputKeys}
                      getThreadTime={getThreadTime}
                      getThreadArgsBadge={getThreadArgsBadge}
                      isThreadPinned={isThreadPinned}
                      onSelectThread={onSelectThread}
                      onShowThreadMenu={showThreadMenu}
                      getWorkspaceLabel={getWorkspaceLabel}
                      collapsedThreadIdsByWorkspace={collapsedThreadIdsByWorkspace}
                      onToggleThreadChildren={handleToggleThreadChildren}
                    />
                  )}
                  {allThreadsAddMenuAnchor &&
                    createPortal(
                      <PopoverSurface
                        className="workspace-add-menu all-threads-add-menu"
                        ref={allThreadsAddMenuRef}
                        style={{
                          top: allThreadsAddMenuAnchor.top,
                          left: allThreadsAddMenuAnchor.left,
                          width: allThreadsAddMenuAnchor.width,
                        }}
                      >
                        {projectOptionsForNewThread.map((workspace) => (
                          <PopoverMenuItem
                            key={workspace.id}
                            className="workspace-add-option"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCreateThreadInProject(workspace);
                            }}
                            icon={<Plus aria-hidden />}
                          >
                            {workspace.name}
                          </PopoverMenuItem>
                        ))}
                      </PopoverSurface>,
                      document.body,
                    )}
                </div>
              )
            : groupedWorkspacesForRender.map((group) => {
                const groupId = group.id;
                const showGroupHeader = Boolean(groupId) || hasWorkspaceGroups;
                const toggleId = groupId ?? (showGroupHeader ? UNGROUPED_COLLAPSE_ID : null);
                const isGroupCollapsed = Boolean(
                  toggleId && collapsedGroups.has(toggleId),
                );

                return (
                  <WorkspaceGroup
                    key={group.id ?? "ungrouped"}
                    toggleId={toggleId}
                    name={group.name}
                    showHeader={showGroupHeader}
                    isCollapsed={isGroupCollapsed}
                    onToggleCollapse={toggleGroupCollapse}
                  >
                    {group.workspaces
                      .filter((entry) => !cloneChildIds.has(entry.id))
                      .map((entry) => {
                      const threads = threadsByWorkspace[entry.id] ?? [];
                      const isCollapsed = entry.settings.sidebarCollapsed;
                      const isExpanded = expandedWorkspaces.has(entry.id);
                      const {
                        unpinnedRows,
                        totalRoots: totalThreadRoots,
                      } = getThreadRows(
                        threads,
                        isExpanded,
                        entry.id,
                        getPinTimestamp,
                        pinnedThreadsVersion,
                        {
                          showSubagentSessions,
                          collapsedParentThreadIds: collapsedThreadIdsByWorkspace[entry.id],
                        },
                      );
                      const nextCursor =
                        threadListCursorByWorkspace[entry.id] ?? null;
                      const showThreadList =
                        threads.length > 0 || Boolean(nextCursor);
                      const isLoadingThreads =
                        threadListLoadingByWorkspace[entry.id] ?? false;
                      const showThreadLoader =
                        isLoadingThreads && threads.length === 0;
                      const isPaging = threadListPagingByWorkspace[entry.id] ?? false;
                      const clones = clonesBySource.get(entry.id) ?? [];
                      const visibleClones =
                        isSearchActive && !isWorkspaceMatch(entry)
                          ? clones.filter((clone) => isWorkspaceMatch(clone))
                          : clones;
                      const worktrees = worktreesByParent.get(entry.id) ?? [];
                      const addMenuOpen = addMenuAnchor?.workspaceId === entry.id;
                      const isDraftNewAgent = newAgentDraftWorkspaceId === entry.id;
                      const isDraftRowActive =
                        isDraftNewAgent &&
                        entry.id === activeWorkspaceId &&
                        !activeThreadId;
                      const draftStatusClass =
                        startingDraftThreadWorkspaceId === entry.id
                          ? "processing"
                          : "ready";

                      return (
                        <WorkspaceCard
                          key={entry.id}
                          workspace={entry}
                          workspaceName={renderHighlightedName(entry.name)}
                          isActive={entry.id === activeWorkspaceId}
                          isCollapsed={isCollapsed}
                          addMenuOpen={addMenuOpen}
                          addMenuWidth={ADD_MENU_WIDTH}
                          onSelectWorkspace={onSelectWorkspace}
                          onShowWorkspaceMenu={showWorkspaceMenu}
                          onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                          onConnectWorkspace={onConnectWorkspace}
                          onToggleAddMenu={setAddMenuAnchor}
                        >
                          {addMenuOpen && addMenuAnchor &&
                            createPortal(
                              <PopoverSurface
                                className="workspace-add-menu"
                                ref={addMenuRef}
                                style={{
                                  top: addMenuAnchor.top,
                                  left: addMenuAnchor.left,
                                  width: addMenuAnchor.width,
                                }}
                              >
                                <PopoverMenuItem
                                  className="workspace-add-option"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setAddMenuAnchor(null);
                                    onAddAgent(entry);
                                  }}
                                  icon={<Plus aria-hidden />}
                                >
                                  New agent
                                </PopoverMenuItem>
                                <PopoverMenuItem
                                  className="workspace-add-option"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setAddMenuAnchor(null);
                                    onAddWorktreeAgent(entry);
                                  }}
                                  icon={<GitBranch aria-hidden />}
                                >
                                  New worktree agent
                                </PopoverMenuItem>
                                <PopoverMenuItem
                                  className="workspace-add-option"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setAddMenuAnchor(null);
                                    onAddCloneAgent(entry);
                                  }}
                                  icon={<Copy aria-hidden />}
                                >
                                  New clone agent
                                </PopoverMenuItem>
                              </PopoverSurface>,
                              document.body,
                            )}
                          {isDraftNewAgent && (
                            <div
                              className={`thread-row thread-row-draft${
                                isDraftRowActive ? " active" : ""
                              }`}
                              onClick={() => onSelectWorkspace(entry.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelectWorkspace(entry.id);
                                }
                              }}
                            >
                              <span className={`thread-status ${draftStatusClass}`} aria-hidden />
                              <span className="thread-name">New Agent</span>
                            </div>
                          )}
                          {visibleClones.length > 0 && (
                            <WorktreeSection
                              worktrees={visibleClones}
                              deletingWorktreeIds={deletingWorktreeIds}
                              threadsByWorkspace={threadsByWorkspace}
                              threadStatusById={threadStatusById}
                              threadListLoadingByWorkspace={threadListLoadingByWorkspace}
                              threadListPagingByWorkspace={threadListPagingByWorkspace}
                              threadListCursorByWorkspace={threadListCursorByWorkspace}
                              expandedWorkspaces={expandedWorkspaces}
                              activeWorkspaceId={activeWorkspaceId}
                              activeThreadId={activeThreadId}
                              pendingUserInputKeys={pendingUserInputKeys}
                              getThreadRows={getThreadRows}
                              getThreadTime={getThreadTime}
                              getThreadArgsBadge={getThreadArgsBadge}
                              isThreadPinned={isThreadPinned}
                              getPinTimestamp={getPinTimestamp}
                              pinnedThreadsVersion={pinnedThreadsVersion}
                              showSubagentSessions={showSubagentSessions}
                              collapsedThreadIdsByWorkspace={collapsedThreadIdsByWorkspace}
                              onToggleThreadChildren={handleToggleThreadChildren}
                              onSelectWorkspace={onSelectWorkspace}
                              onConnectWorkspace={onConnectWorkspace}
                              onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                              onSelectThread={onSelectThread}
                              onShowThreadMenu={showThreadMenu}
                              onShowWorktreeMenu={showCloneMenu}
                              onToggleExpanded={handleToggleExpanded}
                              onLoadOlderThreads={onLoadOlderThreads}
                              sectionLabel="Clone agents"
                              sectionIcon={
                                <Copy className="worktree-header-icon" aria-hidden />
                              }
                              className="clone-section"
                            />
                          )}
                          {worktrees.length > 0 && (
                            <WorktreeSection
                              worktrees={worktrees}
                              deletingWorktreeIds={deletingWorktreeIds}
                              threadsByWorkspace={threadsByWorkspace}
                              threadStatusById={threadStatusById}
                              threadListLoadingByWorkspace={threadListLoadingByWorkspace}
                              threadListPagingByWorkspace={threadListPagingByWorkspace}
                              threadListCursorByWorkspace={threadListCursorByWorkspace}
                              expandedWorkspaces={expandedWorkspaces}
                              activeWorkspaceId={activeWorkspaceId}
                              activeThreadId={activeThreadId}
                              pendingUserInputKeys={pendingUserInputKeys}
                              getThreadRows={getThreadRows}
                              getThreadTime={getThreadTime}
                              getThreadArgsBadge={getThreadArgsBadge}
                              isThreadPinned={isThreadPinned}
                              getPinTimestamp={getPinTimestamp}
                              pinnedThreadsVersion={pinnedThreadsVersion}
                              showSubagentSessions={showSubagentSessions}
                              collapsedThreadIdsByWorkspace={collapsedThreadIdsByWorkspace}
                              onToggleThreadChildren={handleToggleThreadChildren}
                              onSelectWorkspace={onSelectWorkspace}
                              onConnectWorkspace={onConnectWorkspace}
                              onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                              onSelectThread={onSelectThread}
                              onShowThreadMenu={showThreadMenu}
                              onShowWorktreeMenu={showWorktreeMenu}
                              onToggleExpanded={handleToggleExpanded}
                              onLoadOlderThreads={onLoadOlderThreads}
                            />
                          )}
                          {showThreadList && (
                            <ThreadList
                              workspaceId={entry.id}
                              pinnedRows={[]}
                              unpinnedRows={unpinnedRows}
                              totalThreadRoots={totalThreadRoots}
                              isExpanded={isExpanded}
                              nextCursor={nextCursor}
                              isPaging={isPaging}
                              activeWorkspaceId={activeWorkspaceId}
                              activeThreadId={activeThreadId}
                              threadStatusById={threadStatusById}
                              pendingUserInputKeys={pendingUserInputKeys}
                              getThreadTime={getThreadTime}
                              getThreadArgsBadge={getThreadArgsBadge}
                              isThreadPinned={isThreadPinned}
                              collapsedThreadIds={collapsedThreadIdsByWorkspace[entry.id]}
                              onToggleThreadChildren={handleToggleThreadChildren}
                              onToggleExpanded={handleToggleExpanded}
                              onLoadOlderThreads={onLoadOlderThreads}
                              onSelectThread={onSelectThread}
                              onShowThreadMenu={showThreadMenu}
                            />
                          )}
                          {showThreadLoader && <ThreadLoading />}
                        </WorkspaceCard>
                      );
                    })}
                  </WorkspaceGroup>
                );
              })}
          {!groupedWorkspacesForRender.length && (
            <div className="empty">
              {isSearchActive
                ? "No projects match your search."
                : "Add a workspace to start."}
            </div>
          )}
          {isThreadsOnlyMode &&
            groupedWorkspacesForRender.length > 0 &&
            flatThreadRows.length === 0 &&
            pinnedThreadRows.length === 0 && (
              <div className="empty">No threads yet.</div>
            )}
        </div>
      </div>
      <SidebarFooter
        sessionPercent={sessionPercent}
        weeklyPercent={weeklyPercent}
        sessionResetLabel={sessionResetLabel}
        weeklyResetLabel={weeklyResetLabel}
        creditsLabel={creditsLabel}
        showWeekly={showWeekly}
      />
      <SidebarCornerActions
        onOpenSettings={onOpenSettings}
        onOpenDebug={onOpenDebug}
        showDebugButton={showDebugButton}
        showAccountSwitcher={showAccountSwitcher}
        accountLabel={accountButtonLabel}
        accountActionLabel={accountActionLabel}
        accountDisabled={accountSwitchDisabled}
        accountSwitching={accountSwitching}
        accountCancelDisabled={accountCancelDisabled}
        onSwitchAccount={onSwitchAccount}
        onCancelSwitchAccount={onCancelSwitchAccount}
      />
    </aside>
  );
});

Sidebar.displayName = "Sidebar";
