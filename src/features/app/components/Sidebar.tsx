import type {
  AccountSnapshot,
<<<<<<< HEAD
=======
  RequestUserInputRequest,
  RateLimitSnapshot,
>>>>>>> origin/main
  ThreadListSortKey,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
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
import { SidebarHeader } from "./SidebarHeader";
import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorktreeSection } from "./WorktreeSection";
import { PinnedThreadList } from "./PinnedThreadList";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useSidebarMenus } from "../hooks/useSidebarMenus";
import { useSidebarScrollFade } from "../hooks/useSidebarScrollFade";
import { useThreadRows } from "../hooks/useThreadRows";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { formatRelativeTimeShort } from "../../../utils/time";
import { setWorkspaceReorderDragging } from "../../../services/dragDrop";

const COLLAPSED_GROUPS_STORAGE_KEY = "codexmonitor.collapsedGroups";
const THREAD_ORDER_STORAGE_KEY = "codexmonitor.threadOrderByWorkspace";
const WORKSPACE_ORDER_STORAGE_KEY = "codexmonitor.workspaceOrderByGroup";
const UNGROUPED_COLLAPSE_ID = "__ungrouped__";
const UNGROUPED_WORKSPACE_GROUP_KEY = "__ungrouped_workspace_group__";
const ADD_MENU_WIDTH = 200;

type ThreadOrderByWorkspace = Record<string, string[]>;
type WorkspaceOrderByGroup = Record<string, string[]>;
type WorkspaceDropPosition = "before" | "after";
type WorkspacePointerDragContext = {
  sourceWorkspaceId: string;
  sourceGroupKey: string;
  startX: number;
  startY: number;
  isActive: boolean;
};

type ThreadSelectionState = {
  workspaceId: string | null;
  threadIds: Set<string>;
  anchorThreadId: string | null;
};

type ThreadSelectionChange = {
  workspaceId: string;
  threadId: string;
  orderedThreadIds: string[];
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
};

function areThreadIdSetsEqual(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function loadThreadOrderByWorkspace(): ThreadOrderByWorkspace {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(THREAD_ORDER_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const next: ThreadOrderByWorkspace = {};
    Object.entries(parsed).forEach(([workspaceId, value]) => {
      if (!Array.isArray(value)) {
        return;
      }
      const ids = value.filter((entry): entry is string => typeof entry === "string");
      if (ids.length > 0) {
        next[workspaceId] = ids;
      }
    });
    return next;
  } catch {
    return {};
  }
}

function saveThreadOrderByWorkspace(orderByWorkspace: ThreadOrderByWorkspace): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      THREAD_ORDER_STORAGE_KEY,
      JSON.stringify(orderByWorkspace),
    );
  } catch {
    // Best-effort persistence.
  }
}

function resolveWorkspaceGroupKey(groupId: string | null): string {
  return groupId ?? UNGROUPED_WORKSPACE_GROUP_KEY;
}

function loadWorkspaceOrderByGroup(): WorkspaceOrderByGroup {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_ORDER_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const next: WorkspaceOrderByGroup = {};
    Object.entries(parsed).forEach(([groupId, value]) => {
      if (!Array.isArray(value)) {
        return;
      }
      const ids = value.filter((entry): entry is string => typeof entry === "string");
      if (ids.length > 0) {
        next[groupId] = ids;
      }
    });
    return next;
  } catch {
    return {};
  }
}

function saveWorkspaceOrderByGroup(orderByGroup: WorkspaceOrderByGroup): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(WORKSPACE_ORDER_STORAGE_KEY, JSON.stringify(orderByGroup));
  } catch {
    // Best-effort persistence.
  }
}

function buildOrderedIds(baseOrder: string[], storedOrder: string[] | undefined): string[] {
  if (!storedOrder || storedOrder.length === 0) {
    return baseOrder;
  }
  const validIds = new Set(baseOrder);
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  storedOrder.forEach((id) => {
    if (!validIds.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    orderedIds.push(id);
  });

  baseOrder.forEach((id) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    orderedIds.push(id);
  });

  return orderedIds;
}

function applyWorkspaceOrderForGroup(
  workspaces: WorkspaceInfo[],
  groupKey: string,
  orderByGroup: WorkspaceOrderByGroup,
): WorkspaceInfo[] {
  if (workspaces.length <= 1) {
    return workspaces;
  }
  const baseOrder = workspaces.map((workspace) => workspace.id);
  const orderedIds = buildOrderedIds(baseOrder, orderByGroup[groupKey]);
  if (orderedIds.every((id, index) => id === baseOrder[index])) {
    return workspaces;
  }
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  return orderedIds
    .map((workspaceId) => workspaceById.get(workspaceId))
    .filter((workspace): workspace is WorkspaceInfo => Boolean(workspace));
}

function resolveRootThreadId(
  threadId: string,
  threadParentById: Record<string, string>,
  visibleThreadIds: Set<string>,
): string {
  let current = threadId;
  const visited = new Set<string>([threadId]);
  let parentId = threadParentById[current];
  while (parentId && !visited.has(parentId) && visibleThreadIds.has(parentId)) {
    visited.add(parentId);
    current = parentId;
    parentId = threadParentById[current];
  }
  return current;
}

function buildRootThreadGroups(
  threads: ThreadSummary[],
  threadParentById: Record<string, string>,
): { rootOrder: string[]; threadsByRoot: Map<string, ThreadSummary[]> } {
  const visibleThreadIds = new Set(threads.map((thread) => thread.id));
  const rootOrder: string[] = [];
  const threadsByRoot = new Map<string, ThreadSummary[]>();

  threads.forEach((thread) => {
    const rootId = resolveRootThreadId(thread.id, threadParentById, visibleThreadIds);
    const existing = threadsByRoot.get(rootId);
    if (!existing) {
      rootOrder.push(rootId);
      threadsByRoot.set(rootId, [thread]);
      return;
    }
    existing.push(thread);
  });

  return { rootOrder, threadsByRoot };
}

function buildOrderedRootIds(
  rootOrder: string[],
  storedRootOrder: string[] | undefined,
): string[] {
  return buildOrderedIds(rootOrder, storedRootOrder);
}

function applyThreadOrderForWorkspace(
  threads: ThreadSummary[],
  workspaceId: string,
  orderByWorkspace: ThreadOrderByWorkspace,
  threadParentById: Record<string, string>,
): ThreadSummary[] {
  if (threads.length <= 1) {
    return threads;
  }
  const { rootOrder, threadsByRoot } = buildRootThreadGroups(threads, threadParentById);
  const orderedRootIds = buildOrderedRootIds(rootOrder, orderByWorkspace[workspaceId]);

  if (
    orderedRootIds.length === rootOrder.length &&
    orderedRootIds.every((rootId, index) => rootId === rootOrder[index])
  ) {
    return threads;
  }

  const orderedThreads: ThreadSummary[] = [];
  orderedRootIds.forEach((rootId) => {
    const rootThreads = threadsByRoot.get(rootId);
    if (!rootThreads || rootThreads.length === 0) {
      return;
    }
    orderedThreads.push(...rootThreads);
  });
  return orderedThreads;
}

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
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
  threadStatusById: Record<
    string,
    {
      isProcessing: boolean;
      hasUnread: boolean;
      isReviewing: boolean;
      processingStartedAt?: number | null;
      lastDurationMs?: number | null;
      lastActivityAt?: number | null;
      lastErrorAt?: number | null;
      lastErrorMessage?: string | null;
    }
  >;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  threadListSortKey: ThreadListSortKey;
  onSetThreadListSortKey: (sortKey: ThreadListSortKey) => void;
  onRefreshAllThreads: () => void;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
<<<<<<< HEAD
=======
  userInputRequests?: RequestUserInputRequest[];
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
>>>>>>> origin/main
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
  onUpdateWorkspaceDisplayName?: (
    workspaceId: string,
    displayName: string | null,
  ) => void | Promise<void>;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onDeleteThreads?: (workspaceId: string, threadIds: string[]) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
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
  onReorderWorkspaceGroup?: (
    groupId: string | null,
    orderedWorkspaceIds: string[],
  ) => void | Promise<void>;
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
  threadListSortKey,
  onSetThreadListSortKey,
  onRefreshAllThreads,
  activeWorkspaceId,
  activeThreadId,
<<<<<<< HEAD
=======
  userInputRequests = [],
  accountRateLimits,
  usageShowRemaining,
>>>>>>> origin/main
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
  onUpdateWorkspaceDisplayName,
  onSelectThread,
  onDeleteThread,
  onDeleteThreads,
  pinThread,
  unpinThread,
  isThreadPinned,
  getPinTimestamp,
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
  onReorderWorkspaceGroup,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );
  const [threadOrderByWorkspace, setThreadOrderByWorkspace] =
    useState<ThreadOrderByWorkspace>(() => loadThreadOrderByWorkspace());
  const [workspaceOrderByGroup, setWorkspaceOrderByGroup] =
    useState<WorkspaceOrderByGroup>(() => loadWorkspaceOrderByGroup());
  const [editingWorkspaceAliasId, setEditingWorkspaceAliasId] = useState<string | null>(null);
  const [workspaceAliasDraft, setWorkspaceAliasDraft] = useState("");
  const [draggingWorkspaceId, setDraggingWorkspaceId] = useState<string | null>(null);
  const [dropWorkspaceId, setDropWorkspaceId] = useState<string | null>(null);
  const [dropWorkspacePosition, setDropWorkspacePosition] = useState<WorkspaceDropPosition | null>(null);
  const [dragWorkspaceGroupKey, setDragWorkspaceGroupKey] = useState<string | null>(null);
  const draggingWorkspaceIdRef = useRef<string | null>(null);
  const dragWorkspaceGroupKeyRef = useRef<string | null>(null);
  const pointerWorkspaceDragRef = useRef<WorkspacePointerDragContext | null>(null);
  const dropWorkspaceIdRef = useRef<string | null>(null);
  const dropWorkspacePositionRef = useRef<WorkspaceDropPosition | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<{
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [threadSelection, setThreadSelection] = useState<ThreadSelectionState>({
    workspaceId: null,
    threadIds: new Set<string>(),
    anchorThreadId: null,
  });
  const { collapsedGroups, toggleGroupCollapse } = useCollapsedGroups(
    COLLAPSED_GROUPS_STORAGE_KEY,
  );
  const { getThreadRows } = useThreadRows(threadParentById);
  const handleRenameWorkspaceAlias = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      if (!workspace) {
        return;
      }
      const currentAlias = workspace.settings.displayName?.trim() || workspace.name;
      setEditingWorkspaceAliasId(workspaceId);
      setWorkspaceAliasDraft(currentAlias);
    },
    [workspaces],
  );

  const commitWorkspaceAlias = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      if (!workspace) {
        setEditingWorkspaceAliasId(null);
        setWorkspaceAliasDraft("");
        return;
      }
      const nextAlias = workspaceAliasDraft.trim();
      const nextDisplayName =
        nextAlias && nextAlias !== workspace.name ? nextAlias : null;
      void Promise.resolve(
        onUpdateWorkspaceDisplayName?.(workspaceId, nextDisplayName),
      );
      setEditingWorkspaceAliasId(null);
      setWorkspaceAliasDraft("");
    },
    [onUpdateWorkspaceDisplayName, workspaceAliasDraft, workspaces],
  );

  const cancelWorkspaceAliasEdit = useCallback(() => {
    setEditingWorkspaceAliasId(null);
    setWorkspaceAliasDraft("");
  }, []);

  const getWorkspaceDisplayName = useCallback(
    (workspace: WorkspaceInfo) =>
      workspace.settings.displayName?.trim() || workspace.name,
    [],
  );
  const handleThreadSelectionChange = useCallback(
    ({
      workspaceId,
      threadId,
      orderedThreadIds,
      metaKey,
      ctrlKey,
      shiftKey,
    }: ThreadSelectionChange) => {
      const hasToggleModifier = metaKey || ctrlKey;
      const effectiveOrder = orderedThreadIds.length > 0 ? orderedThreadIds : [threadId];

      setThreadSelection((previous) => {
        const sameWorkspace = previous.workspaceId === workspaceId;
        const previousSelected = sameWorkspace
          ? new Set(previous.threadIds)
          : new Set<string>();
        const previousAnchor =
          sameWorkspace &&
          previous.anchorThreadId &&
          effectiveOrder.includes(previous.anchorThreadId)
            ? previous.anchorThreadId
            : null;

        let nextThreadIds: Set<string>;
        let nextAnchorThreadId: string | null;

        if (shiftKey && previousAnchor) {
          const anchorIndex = effectiveOrder.indexOf(previousAnchor);
          const targetIndex = effectiveOrder.indexOf(threadId);

          if (anchorIndex >= 0 && targetIndex >= 0) {
            const start = Math.min(anchorIndex, targetIndex);
            const end = Math.max(anchorIndex, targetIndex);
            const rangeIds = effectiveOrder.slice(start, end + 1);

            if (hasToggleModifier) {
              nextThreadIds = new Set(previousSelected);
              rangeIds.forEach((id) => {
                if (nextThreadIds.has(id)) {
                  nextThreadIds.delete(id);
                } else {
                  nextThreadIds.add(id);
                }
              });
            } else {
              nextThreadIds = new Set(rangeIds);
            }
            nextAnchorThreadId = previousAnchor;
          } else {
            nextThreadIds = new Set([threadId]);
            nextAnchorThreadId = threadId;
          }
        } else if (hasToggleModifier && sameWorkspace) {
          nextThreadIds = new Set(previousSelected);
          if (nextThreadIds.has(threadId)) {
            nextThreadIds.delete(threadId);
          } else {
            nextThreadIds.add(threadId);
          }
          nextAnchorThreadId = threadId;
        } else {
          nextThreadIds = new Set([threadId]);
          nextAnchorThreadId = threadId;
        }

        const normalizedAnchor =
          nextThreadIds.size > 0 ? nextAnchorThreadId : null;
        if (
          previous.workspaceId === workspaceId &&
          previous.anchorThreadId === normalizedAnchor &&
          areThreadIdSetsEqual(previous.threadIds, nextThreadIds)
        ) {
          return previous;
        }

        return {
          workspaceId,
          threadIds: nextThreadIds,
          anchorThreadId: normalizedAnchor,
        };
      });
    },
    [],
  );
  const getSelectedThreadIds = useCallback(
    (workspaceId: string): string[] => {
      if (threadSelection.workspaceId !== workspaceId) {
        return [];
      }
      return Array.from(threadSelection.threadIds);
    },
    [threadSelection],
  );
  const { showThreadMenu, showWorkspaceMenu, showWorktreeMenu } =
    useSidebarMenus({
      onDeleteThread,
      onDeleteThreads,
      getSelectedThreadIds,
      onPinThread: pinThread,
      onUnpinThread: unpinThread,
      isThreadPinned,
      onRenameThread,
      onRenameWorkspaceAlias: handleRenameWorkspaceAlias,
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onDeleteWorktree,
    });
  const debouncedQuery = useDebouncedValue(searchQuery, 150);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();

  const orderedThreadsByWorkspace = useMemo(() => {
    const next: Record<string, ThreadSummary[]> = {};
    Object.entries(threadsByWorkspace).forEach(([workspaceId, threads]) => {
      next[workspaceId] = applyThreadOrderForWorkspace(
        threads,
        workspaceId,
        threadOrderByWorkspace,
        threadParentById,
      );
    });
    return next;
  }, [threadOrderByWorkspace, threadParentById, threadsByWorkspace]);

  useEffect(() => {
    setThreadSelection((previous) => {
      if (!previous.workspaceId || previous.threadIds.size === 0) {
        return previous;
      }
      const visibleThreadIds = new Set(
        (orderedThreadsByWorkspace[previous.workspaceId] ?? []).map(
          (thread) => thread.id,
        ),
      );
      const nextThreadIds = new Set(
        Array.from(previous.threadIds).filter((threadId) =>
          visibleThreadIds.has(threadId),
        ),
      );
      const nextAnchorThreadId =
        previous.anchorThreadId && nextThreadIds.has(previous.anchorThreadId)
          ? previous.anchorThreadId
          : (nextThreadIds.values().next().value ?? null);

      if (
        previous.anchorThreadId === nextAnchorThreadId &&
        areThreadIdSetsEqual(previous.threadIds, nextThreadIds)
      ) {
        return previous;
      }

      return {
        workspaceId: previous.workspaceId,
        threadIds: nextThreadIds,
        anchorThreadId: nextAnchorThreadId,
      };
    });
  }, [orderedThreadsByWorkspace]);

  const handleReorderThreads = useCallback(
    (
      workspaceId: string,
      sourceThreadId: string,
      targetThreadId: string,
      position: "before" | "after",
    ) => {
      if (sourceThreadId === targetThreadId) {
        return;
      }
      const threads = threadsByWorkspace[workspaceId] ?? [];
      if (threads.length <= 1) {
        return;
      }
      const { rootOrder } = buildRootThreadGroups(threads, threadParentById);
      const orderedRootIds = buildOrderedRootIds(
        rootOrder,
        threadOrderByWorkspace[workspaceId],
      );

      if (
        !orderedRootIds.includes(sourceThreadId) ||
        !orderedRootIds.includes(targetThreadId)
      ) {
        return;
      }

      const nextRootOrder = orderedRootIds.filter((threadId) => threadId !== sourceThreadId);
      const targetIndex = nextRootOrder.indexOf(targetThreadId);
      if (targetIndex < 0) {
        return;
      }
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      nextRootOrder.splice(insertIndex, 0, sourceThreadId);

      if (nextRootOrder.every((threadId, index) => threadId === orderedRootIds[index])) {
        return;
      }

      setThreadOrderByWorkspace((previous) => {
        const next = {
          ...previous,
          [workspaceId]: nextRootOrder,
        };
        saveThreadOrderByWorkspace(next);
        return next;
      });
    },
    [threadOrderByWorkspace, threadParentById, threadsByWorkspace],
  );

  const isWorkspaceMatch = useCallback(
    (workspace: WorkspaceInfo) => {
      if (!normalizedQuery) {
        return true;
      }
      const displayName = getWorkspaceDisplayName(workspace).toLowerCase();
      if (displayName.includes(normalizedQuery)) {
        return true;
      }
      return workspace.name.toLowerCase().includes(normalizedQuery);
    },
    [getWorkspaceDisplayName, normalizedQuery],
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
      ? "API 密钥"
      : "登录 Codex";
  const accountActionLabel = accountEmail ? "切换账户" : "登录";
  const showAccountSwitcher = Boolean(activeWorkspaceId);
  const accountSwitchDisabled = accountSwitching || !activeWorkspaceId;
  const accountCancelDisabled = !accountSwitching || !activeWorkspaceId;
  const refreshDisabled = workspaces.length === 0 || workspaces.every((workspace) => !workspace.connected);
  const refreshInProgress = workspaces.some(
    (workspace) => threadListLoadingByWorkspace[workspace.id] ?? false,
  );

  const pinnedThreadRows = useMemo(() => {
    type ThreadRow = { thread: ThreadSummary; depth: number };
    const groups: Array<{
      pinTime: number;
      workspaceId: string;
      rows: ThreadRow[];
    }> = [];

    workspaces.forEach((workspace) => {
      if (!isWorkspaceMatch(workspace)) {
        return;
      }
      const threads = orderedThreadsByWorkspace[workspace.id] ?? [];
      if (!threads.length) {
        return;
      }
      const { pinnedRows } = getThreadRows(
        threads,
        true,
        workspace.id,
        getPinTimestamp,
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
    orderedThreadsByWorkspace,
    getThreadRows,
    getPinTimestamp,
    isWorkspaceMatch,
  ]);

  const orderedGroupedWorkspaces = useMemo(
    () =>
      groupedWorkspaces
        .map((group) => {
          const groupKey = resolveWorkspaceGroupKey(group.id);
          const visibleWorkspaces = group.workspaces.filter(isWorkspaceMatch);
          return {
            ...group,
            workspaces: applyWorkspaceOrderForGroup(
              visibleWorkspaces,
              groupKey,
              workspaceOrderByGroup,
            ),
          };
        })
        .filter((group) => group.workspaces.length > 0),
    [groupedWorkspaces, isWorkspaceMatch, workspaceOrderByGroup],
  );

  const scrollFadeDeps = useMemo(
    () => [orderedGroupedWorkspaces, orderedThreadsByWorkspace, expandedWorkspaces, normalizedQuery],
    [orderedGroupedWorkspaces, orderedThreadsByWorkspace, expandedWorkspaces, normalizedQuery],
  );
  const { sidebarBodyRef, scrollFade, updateScrollFade } =
    useSidebarScrollFade(scrollFadeDeps);

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

  const resetWorkspaceDragState = useCallback(() => {
    draggingWorkspaceIdRef.current = null;
    dragWorkspaceGroupKeyRef.current = null;
    pointerWorkspaceDragRef.current = null;
    dropWorkspaceIdRef.current = null;
    dropWorkspacePositionRef.current = null;
    setWorkspaceReorderDragging(false);
    setDraggingWorkspaceId(null);
    setDropWorkspaceId(null);
    setDropWorkspacePosition(null);
    setDragWorkspaceGroupKey(null);
  }, []);

  useEffect(() => () => setWorkspaceReorderDragging(false), []);

  const handleReorderWorkspaces = useCallback(
    (
      groupKey: string,
      sourceWorkspaceId: string,
      targetWorkspaceId: string,
      position: "before" | "after",
    ) => {
      if (sourceWorkspaceId === targetWorkspaceId) {
        return;
      }
      const group = groupedWorkspaces.find(
        (entry) => resolveWorkspaceGroupKey(entry.id) === groupKey,
      );
      if (!group) {
        return;
      }
      const baseOrder = group.workspaces.map((workspace) => workspace.id);
      if (baseOrder.length <= 1) {
        return;
      }
      const orderedIds = buildOrderedIds(baseOrder, workspaceOrderByGroup[groupKey]);
      if (
        !orderedIds.includes(sourceWorkspaceId) ||
        !orderedIds.includes(targetWorkspaceId)
      ) {
        return;
      }
      const nextIds = orderedIds.filter((workspaceId) => workspaceId !== sourceWorkspaceId);
      const targetIndex = nextIds.indexOf(targetWorkspaceId);
      if (targetIndex < 0) {
        return;
      }
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      nextIds.splice(insertIndex, 0, sourceWorkspaceId);
      if (nextIds.every((workspaceId, index) => workspaceId === orderedIds[index])) {
        return;
      }
      setWorkspaceOrderByGroup((previous) => {
        const next = {
          ...previous,
          [groupKey]: nextIds,
        };
        saveWorkspaceOrderByGroup(next);
        return next;
      });
      if (onReorderWorkspaceGroup) {
        void Promise.resolve(
          onReorderWorkspaceGroup(group.id ?? null, nextIds),
        ).catch((error) => {
          console.error("Failed to persist workspace reorder", error);
        });
      }
    },
    [groupedWorkspaces, onReorderWorkspaceGroup, workspaceOrderByGroup],
  );

  const handleWorkspaceCardDragStart = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      groupKey: string,
      workspaceId: string,
    ) => {
      pointerWorkspaceDragRef.current = null;
      draggingWorkspaceIdRef.current = workspaceId;
      dragWorkspaceGroupKeyRef.current = groupKey;
      setWorkspaceReorderDragging(true);
      setDraggingWorkspaceId(workspaceId);
      setDropWorkspaceId(null);
      setDragWorkspaceGroupKey(groupKey);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", workspaceId);
        event.dataTransfer.setData("application/x-codexmonitor-workspace-group", groupKey);
      }
    },
    [],
  );

  const handleWorkspaceCardDragOver = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      groupKey: string,
      targetWorkspaceId: string,
    ) => {
      const sourceWorkspaceId =
        draggingWorkspaceIdRef.current ??
        draggingWorkspaceId ??
        event.dataTransfer?.getData("text/plain") ??
        null;
      const sourceGroupKey =
        dragWorkspaceGroupKeyRef.current ??
        dragWorkspaceGroupKey ??
        event.dataTransfer?.getData("application/x-codexmonitor-workspace-group") ??
        null;
      if (
        !sourceWorkspaceId ||
        !sourceGroupKey ||
        sourceWorkspaceId === targetWorkspaceId ||
        sourceGroupKey !== groupKey
      ) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const position =
        event.clientY <= rect.top + rect.height / 2 ? "before" : "after";
      dropWorkspaceIdRef.current = targetWorkspaceId;
      dropWorkspacePositionRef.current = position;
      if (dropWorkspaceId !== targetWorkspaceId) {
        setDropWorkspaceId(targetWorkspaceId);
      }
      if (dropWorkspacePosition !== position) {
        setDropWorkspacePosition(position);
      }
    },
    [
      dragWorkspaceGroupKey,
      draggingWorkspaceId,
      dropWorkspaceId,
      dropWorkspacePosition,
    ],
  );

  const handleWorkspaceCardDragEnter = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      groupKey: string,
      targetWorkspaceId: string,
    ) => {
      handleWorkspaceCardDragOver(event, groupKey, targetWorkspaceId);
    },
    [handleWorkspaceCardDragOver],
  );

  const resolveWorkspaceDropTarget = useCallback(
    ({
      sourceWorkspaceId,
      sourceGroupKey,
      clientY,
      candidateElement,
      fallbackContainer,
    }: {
      sourceWorkspaceId: string;
      sourceGroupKey: string;
      clientY: number;
      candidateElement?: Element | null;
      fallbackContainer?: HTMLElement | null;
    }): { targetWorkspaceId: string | null; targetPosition: WorkspaceDropPosition | null } => {
      const targetRow = candidateElement?.closest<HTMLElement>(
        "[data-workspace-id][data-workspace-group-key]",
      );
      const targetId = targetRow?.dataset.workspaceId ?? null;
      const targetGroupKey = targetRow?.dataset.workspaceGroupKey ?? null;
      if (
        targetRow &&
        targetId &&
        targetGroupKey === sourceGroupKey &&
        targetId !== sourceWorkspaceId
      ) {
        const rect = targetRow.getBoundingClientRect();
        const position: WorkspaceDropPosition =
          clientY <= rect.top + rect.height / 2 ? "before" : "after";
        return {
          targetWorkspaceId: targetId,
          targetPosition: position,
        };
      }

      const rowContainer = fallbackContainer ?? sidebarBodyRef.current;
      if (!rowContainer) {
        return { targetWorkspaceId: null, targetPosition: null };
      }
      const workspaceRows = Array.from(
        rowContainer.querySelectorAll<HTMLElement>(
          "[data-workspace-id][data-workspace-group-key]",
        ),
      ).filter((row) => {
        const rowWorkspaceId = row.dataset.workspaceId;
        const rowGroupKey = row.dataset.workspaceGroupKey;
        return (
          Boolean(rowWorkspaceId) &&
          rowWorkspaceId !== sourceWorkspaceId &&
          rowGroupKey === sourceGroupKey
        );
      });
      if (workspaceRows.length === 0) {
        return { targetWorkspaceId: null, targetPosition: null };
      }

      let nearestRow: HTMLElement | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const row of workspaceRows) {
        const rect = row.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          nearestRow = row;
          break;
        }
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(clientY - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestRow = row;
        }
      }
      if (!nearestRow) {
        return { targetWorkspaceId: null, targetPosition: null };
      }
      const rect = nearestRow.getBoundingClientRect();
      const nearestWorkspaceId = nearestRow.dataset.workspaceId ?? null;
      if (!nearestWorkspaceId) {
        return { targetWorkspaceId: null, targetPosition: null };
      }
      let targetPosition: WorkspaceDropPosition;
      if (clientY < rect.top) {
        targetPosition = "before";
      } else if (clientY > rect.bottom) {
        targetPosition = "after";
      } else {
        targetPosition = clientY <= rect.top + rect.height / 2 ? "before" : "after";
      }
      return {
        targetWorkspaceId: nearestWorkspaceId,
        targetPosition,
      };
    },
    [sidebarBodyRef],
  );

  const handleWorkspaceCardPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      groupKey: string,
      workspaceId: string,
    ) => {
      if (isSearchActive || event.button !== 0) {
        return;
      }
      const targetElement = event.target as HTMLElement | null;
      const interactiveElement = targetElement?.closest(
        "button, input, textarea, select, a, [contenteditable='true'], .connect",
      );
      if (
        interactiveElement &&
        !interactiveElement.classList.contains("workspace-row-main")
      ) {
        return;
      }
      pointerWorkspaceDragRef.current = {
        sourceWorkspaceId: workspaceId,
        sourceGroupKey: groupKey,
        startX: event.clientX,
        startY: event.clientY,
        isActive: false,
      };
    },
    [isSearchActive],
  );

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const pointerContext = pointerWorkspaceDragRef.current;
      if (!pointerContext) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        pointerWorkspaceDragRef.current = null;
        if (pointerContext.isActive) {
          resetWorkspaceDragState();
        }
        return;
      }
      const dragDistance = Math.hypot(
        event.clientX - pointerContext.startX,
        event.clientY - pointerContext.startY,
      );
      if (!pointerContext.isActive) {
        if (dragDistance < 6) {
          return;
        }
        pointerContext.isActive = true;
        pointerWorkspaceDragRef.current = pointerContext;
        draggingWorkspaceIdRef.current = pointerContext.sourceWorkspaceId;
        dragWorkspaceGroupKeyRef.current = pointerContext.sourceGroupKey;
        setWorkspaceReorderDragging(true);
        setDraggingWorkspaceId(pointerContext.sourceWorkspaceId);
        setDragWorkspaceGroupKey(pointerContext.sourceGroupKey);
      }

      const resolvedTarget = resolveWorkspaceDropTarget({
        sourceWorkspaceId: pointerContext.sourceWorkspaceId,
        sourceGroupKey: pointerContext.sourceGroupKey,
        clientY: event.clientY,
        candidateElement:
          typeof document.elementFromPoint === "function"
            ? document.elementFromPoint(event.clientX, event.clientY)
            : null,
        fallbackContainer: sidebarBodyRef.current,
      });
      dropWorkspaceIdRef.current = resolvedTarget.targetWorkspaceId;
      dropWorkspacePositionRef.current = resolvedTarget.targetPosition;
      setDropWorkspaceId((previous) =>
        previous === resolvedTarget.targetWorkspaceId
          ? previous
          : resolvedTarget.targetWorkspaceId,
      );
      setDropWorkspacePosition((previous) =>
        previous === resolvedTarget.targetPosition
          ? previous
          : resolvedTarget.targetPosition,
      );
    }

    function finalizeWindowPointerDrag() {
      const pointerContext = pointerWorkspaceDragRef.current;
      if (!pointerContext) {
        return;
      }
      pointerWorkspaceDragRef.current = null;
      if (!pointerContext.isActive) {
        return;
      }
      const targetWorkspaceId = dropWorkspaceIdRef.current;
      const targetPosition = dropWorkspacePositionRef.current;
      if (targetWorkspaceId && targetPosition) {
        handleReorderWorkspaces(
          pointerContext.sourceGroupKey,
          pointerContext.sourceWorkspaceId,
          targetWorkspaceId,
          targetPosition,
        );
      }
      resetWorkspaceDragState();
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", finalizeWindowPointerDrag);
    window.addEventListener("pointercancel", finalizeWindowPointerDrag);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", finalizeWindowPointerDrag);
      window.removeEventListener("pointercancel", finalizeWindowPointerDrag);
    };
  }, [handleReorderWorkspaces, resetWorkspaceDragState, resolveWorkspaceDropTarget, sidebarBodyRef]);

  const handleWorkspaceCardDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      groupKey: string,
      targetWorkspaceId: string,
    ) => {
      const sourceWorkspaceId =
        draggingWorkspaceIdRef.current ??
        draggingWorkspaceId ??
        event.dataTransfer?.getData("text/plain") ??
        null;
      const sourceGroupKey =
        dragWorkspaceGroupKeyRef.current ??
        dragWorkspaceGroupKey ??
        event.dataTransfer?.getData("application/x-codexmonitor-workspace-group") ??
        null;
      if (!sourceWorkspaceId || !sourceGroupKey || sourceGroupKey !== groupKey) {
        resetWorkspaceDragState();
        return;
      }
      event.preventDefault();
      const position =
        dropWorkspaceId === targetWorkspaceId && dropWorkspacePosition
          ? dropWorkspacePosition
          : (() => {
              const rect = event.currentTarget.getBoundingClientRect();
              return event.clientY <= rect.top + rect.height / 2
                ? "before"
                : "after";
            })();
      handleReorderWorkspaces(
        groupKey,
        sourceWorkspaceId,
        targetWorkspaceId,
        position,
      );
      resetWorkspaceDragState();
    },
    [
      dragWorkspaceGroupKey,
      draggingWorkspaceId,
      dropWorkspaceId,
      dropWorkspacePosition,
      handleReorderWorkspaces,
      resetWorkspaceDragState,
    ],
  );

  useEffect(() => {
    if (isSearchActive) {
      resetWorkspaceDragState();
    }
  }, [isSearchActive, resetWorkspaceDragState]);

  const getThreadTime = useCallback(
    (thread: ThreadSummary) => {
      const timestamp = thread.updatedAt ?? null;
      return timestamp ? formatRelativeTimeShort(timestamp) : null;
    },
    [],
  );

  useDismissibleMenu({
    isOpen: Boolean(addMenuAnchor),
    containerRef: addMenuRef,
    onClose: () => setAddMenuAnchor(null),
  });

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

  useLayoutEffect(() => {
    if (!addMenuAnchor || !addMenuRef.current) {
      return;
    }
    addMenuRef.current.style.setProperty(
      "--workspace-add-menu-top",
      `${addMenuAnchor.top}px`,
    );
    addMenuRef.current.style.setProperty(
      "--workspace-add-menu-left",
      `${addMenuAnchor.left}px`,
    );
    addMenuRef.current.style.setProperty(
      "--workspace-add-menu-width",
      `${addMenuAnchor.width}px`,
    );
  }, [addMenuAnchor]);

  useEffect(() => {
    if (!isSearchOpen && searchQuery) {
      setSearchQuery("");
    }
  }, [isSearchOpen, searchQuery]);

  useEffect(() => {
    if (!editingWorkspaceAliasId) {
      return;
    }
    const exists = workspaces.some((workspace) => workspace.id === editingWorkspaceAliasId);
    if (!exists) {
      setEditingWorkspaceAliasId(null);
      setWorkspaceAliasDraft("");
    }
  }, [editingWorkspaceAliasId, workspaces]);

  const handleSidebarDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (draggingWorkspaceIdRef.current) {
        event.preventDefault();
        return;
      }
      onWorkspaceDragOver(event);
    },
    [onWorkspaceDragOver],
  );

  const handleSidebarDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const sourceWorkspaceId =
        draggingWorkspaceIdRef.current ?? draggingWorkspaceId ?? null;
      const sourceGroupKey =
        dragWorkspaceGroupKeyRef.current ?? dragWorkspaceGroupKey ?? null;
      if (sourceWorkspaceId && sourceGroupKey) {
        let targetWorkspaceId = dropWorkspaceId;
        let targetPosition = dropWorkspacePosition;
        if (!targetWorkspaceId || !targetPosition) {
          const resolvedTarget = resolveWorkspaceDropTarget({
            sourceWorkspaceId,
            sourceGroupKey,
            clientY: event.clientY,
            candidateElement: event.target as Element | null,
            fallbackContainer: event.currentTarget as HTMLElement,
          });
          targetWorkspaceId = resolvedTarget.targetWorkspaceId;
          targetPosition = resolvedTarget.targetPosition;
        }
        if (!targetWorkspaceId || !targetPosition) {
          resetWorkspaceDragState();
          return;
        }
        event.preventDefault();
        handleReorderWorkspaces(
          sourceGroupKey,
          sourceWorkspaceId,
          targetWorkspaceId,
          targetPosition,
        );
        resetWorkspaceDragState();
        return;
      }
      onWorkspaceDrop(event);
    },
    [
      dragWorkspaceGroupKey,
      draggingWorkspaceId,
      dropWorkspaceId,
      dropWorkspacePosition,
      handleReorderWorkspaces,
      onWorkspaceDrop,
      resetWorkspaceDragState,
      resolveWorkspaceDropTarget,
    ],
  );

  return (
    <aside
      className={`sidebar${isSearchOpen ? " search-open" : ""}`}
      ref={workspaceDropTargetRef}
      onDragOver={handleSidebarDragOver}
      onDragEnter={onWorkspaceDragEnter}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={handleSidebarDrop}
    >
      <SidebarHeader
        onSelectHome={onSelectHome}
        onAddWorkspace={onAddWorkspace}
        onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
        isSearchOpen={isSearchOpen}
        threadListSortKey={threadListSortKey}
        onSetThreadListSortKey={onSetThreadListSortKey}
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
            placeholder="搜索项目"
            aria-label="搜索项目"
            data-tauri-drag-region="false"
            autoFocus
          />
        )}
        {isSearchOpen && searchQuery.length > 0 && (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label="清除搜索"
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
            workspaceDropText === "正在添加项目..." ? " is-busy" : ""
          }`}
        >
          {workspaceDropText === "将项目拖放到此处" && (
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
                <div className="workspace-group-label">已置顶</div>
              </div>
              <PinnedThreadList
                rows={pinnedThreadRows}
                activeWorkspaceId={activeWorkspaceId}
                activeThreadId={activeThreadId}
                selectedWorkspaceId={threadSelection.workspaceId}
                selectedThreadIds={threadSelection.threadIds}
                threadStatusById={threadStatusById}
                getThreadTime={getThreadTime}
                isThreadPinned={isThreadPinned}
                onSelectThread={onSelectThread}
                onThreadSelectionChange={handleThreadSelectionChange}
                onShowThreadMenu={showThreadMenu}
              />
            </div>
          )}
          {orderedGroupedWorkspaces.map((group) => {
            const groupId = group.id;
            const groupKey = resolveWorkspaceGroupKey(group.id);
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
                {group.workspaces.map((entry) => {
                  const threads = orderedThreadsByWorkspace[entry.id] ?? [];
                  const isCollapsed = entry.settings.sidebarCollapsed;
                  const workspaceDisplayName = getWorkspaceDisplayName(entry);
                  const isWorkspaceDragging = draggingWorkspaceId === entry.id;
                  const isWorkspaceDropTarget =
                    dropWorkspaceId === entry.id &&
                    draggingWorkspaceId !== null &&
                    draggingWorkspaceId !== entry.id &&
                    dragWorkspaceGroupKey === groupKey;
                  const workspaceDropPosition =
                    isWorkspaceDropTarget && dropWorkspacePosition
                      ? dropWorkspacePosition
                      : null;
                  const isAliasEditing = editingWorkspaceAliasId === entry.id;
                  const isExpanded = expandedWorkspaces.has(entry.id);
                  const {
                    unpinnedRows,
                    totalRoots: totalThreadRoots,
                  } = getThreadRows(
                    threads,
                    isExpanded,
                    entry.id,
                    getPinTimestamp,
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
                  const worktrees = worktreesByParent.get(entry.id) ?? [];
                  const addMenuOpen = addMenuAnchor?.workspaceId === entry.id;
                  const isDraftNewAgent =
                    newAgentDraftWorkspaceId === entry.id ||
                    startingDraftThreadWorkspaceId === entry.id;
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
                      workspaceGroupKey={groupKey}
                      workspaceName={renderHighlightedName(workspaceDisplayName)}
                      isActive={entry.id === activeWorkspaceId}
                      isCollapsed={isCollapsed}
                      addMenuOpen={addMenuOpen}
                      addMenuWidth={ADD_MENU_WIDTH}
                      onSelectWorkspace={onSelectWorkspace}
                      onShowWorkspaceMenu={showWorkspaceMenu}
                      onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                      onConnectWorkspace={onConnectWorkspace}
                      onToggleAddMenu={setAddMenuAnchor}
                      isDraggable={!isSearchActive}
                      isDragging={isWorkspaceDragging}
                      isDropTarget={isWorkspaceDropTarget}
                      dropPosition={workspaceDropPosition}
                      onDragStart={(event) =>
                        handleWorkspaceCardDragStart(event, groupKey, entry.id)
                      }
                      onPointerDown={(event) =>
                        handleWorkspaceCardPointerDown(event, groupKey, entry.id)
                      }
                      onDragEnter={(event) =>
                        handleWorkspaceCardDragEnter(event, groupKey, entry.id)
                      }
                      onDragOver={(event) =>
                        handleWorkspaceCardDragOver(event, groupKey, entry.id)
                      }
                      onDrop={(event) =>
                        handleWorkspaceCardDrop(event, groupKey, entry.id)
                      }
                      onDragEnd={resetWorkspaceDragState}
                      isAliasEditing={isAliasEditing}
                      aliasDraft={workspaceAliasDraft}
                      onAliasDraftChange={setWorkspaceAliasDraft}
                      onAliasSubmit={() => commitWorkspaceAlias(entry.id)}
                      onAliasCancel={cancelWorkspaceAliasEdit}
                      onStartAliasEdit={handleRenameWorkspaceAlias}
                    >
                      {addMenuOpen && addMenuAnchor &&
                        createPortal(
                          <PopoverSurface
                            className="workspace-add-menu"
                            ref={addMenuRef}
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
                              新建对话
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
                              新建工作树对话
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
                              新建克隆对话
                            </PopoverMenuItem>
                          </PopoverSurface>,
                          document.body,
                        )}
                      {isDraftNewAgent && (
                        <button
                          type="button"
                          className={`thread-row thread-row-draft${
                            isDraftRowActive ? " active" : ""
                          }`}
                          onClick={() => onSelectWorkspace(entry.id)}
                        >
                          <span className={`thread-status ${draftStatusClass}`} aria-hidden />
                          <span className="thread-name">新建对话</span>
                        </button>
                      )}
                      {worktrees.length > 0 && (
                        <WorktreeSection
                          worktrees={worktrees}
                          deletingWorktreeIds={deletingWorktreeIds}
                          threadsByWorkspace={orderedThreadsByWorkspace}
                          threadStatusById={threadStatusById}
                          threadListLoadingByWorkspace={threadListLoadingByWorkspace}
                          threadListPagingByWorkspace={threadListPagingByWorkspace}
                          threadListCursorByWorkspace={threadListCursorByWorkspace}
                          expandedWorkspaces={expandedWorkspaces}
                          activeWorkspaceId={activeWorkspaceId}
                          activeThreadId={activeThreadId}
                          getThreadRows={getThreadRows}
                          getThreadTime={getThreadTime}
                          isThreadPinned={isThreadPinned}
                          getPinTimestamp={getPinTimestamp}
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
                          selectedThreadIds={
                            threadSelection.workspaceId === entry.id
                              ? threadSelection.threadIds
                              : undefined
                          }
                          threadStatusById={threadStatusById}
                          getThreadTime={getThreadTime}
                          isThreadPinned={isThreadPinned}
                          onToggleExpanded={handleToggleExpanded}
                          onLoadOlderThreads={onLoadOlderThreads}
                          onSelectThread={onSelectThread}
                          onThreadSelectionChange={handleThreadSelectionChange}
                          onShowThreadMenu={showThreadMenu}
                          onReorderThreads={handleReorderThreads}
                        />
                      )}
                      {showThreadLoader && <ThreadLoading />}
                    </WorkspaceCard>
                  );
                })}
              </WorkspaceGroup>
            );
          })}
          {!orderedGroupedWorkspaces.length && (
            <div className="empty">
              {isSearchActive
                ? "没有匹配的项目。"
                : "添加工作区以开始。"}
            </div>
          )}
        </div>
      </div>
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
