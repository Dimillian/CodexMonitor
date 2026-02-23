import type { WorkspaceGroup, WorkspaceInfo } from "../../../types";

const GROUP_ID_RANDOM_MODULUS = 1_000_000;
const SORT_ORDER_FALLBACK = Number.MAX_SAFE_INTEGER;

export const RESERVED_GROUP_NAME = "Ungrouped";

export type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

export function normalizeGroupName(name: string) {
  return name.trim();
}

export function getSortOrderValue(value: number | null | undefined) {
  return typeof value === "number" ? value : SORT_ORDER_FALLBACK;
}

export function isReservedGroupName(name: string) {
  return normalizeGroupName(name).toLowerCase() === RESERVED_GROUP_NAME.toLowerCase();
}

export function isDuplicateGroupName(
  name: string,
  groups: WorkspaceGroup[],
  excludeId?: string,
) {
  const normalized = normalizeGroupName(name).toLowerCase();
  return groups.some(
    (group) =>
      group.id !== excludeId &&
      normalizeGroupName(group.name).toLowerCase() === normalized,
  );
}

export function createGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * GROUP_ID_RANDOM_MODULUS)}`;
}

export function sortWorkspaceGroups(groups: WorkspaceGroup[]) {
  return groups.slice().sort((a, b) => {
    const orderDiff = getSortOrderValue(a.sortOrder) - getSortOrderValue(b.sortOrder);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return a.name.localeCompare(b.name);
  });
}

export function buildWorkspaceById(workspaces: WorkspaceInfo[]) {
  const map = new Map<string, WorkspaceInfo>();
  workspaces.forEach((workspace) => {
    map.set(workspace.id, workspace);
  });
  return map;
}

export function buildWorkspaceGroupById(workspaceGroups: WorkspaceGroup[]) {
  const map = new Map<string, WorkspaceGroup>();
  workspaceGroups.forEach((group) => {
    map.set(group.id, group);
  });
  return map;
}

export function getWorkspaceGroupId(
  workspace: WorkspaceInfo,
  workspaceById: Map<string, WorkspaceInfo>,
) {
  if ((workspace.kind ?? "main") === "worktree" && workspace.parentId) {
    const parent = workspaceById.get(workspace.parentId);
    return parent?.settings.groupId ?? null;
  }
  return workspace.settings.groupId ?? null;
}

export function getWorkspaceGroupNameById(
  workspaceId: string,
  workspaceById: Map<string, WorkspaceInfo>,
  workspaceGroupById: Map<string, WorkspaceGroup>,
) {
  const workspace = workspaceById.get(workspaceId);
  if (!workspace) {
    return null;
  }
  const groupId = getWorkspaceGroupId(workspace, workspaceById);
  if (!groupId) {
    return null;
  }
  return workspaceGroupById.get(groupId)?.name ?? null;
}

function sortWorkspacesByOrderAndName(workspaces: WorkspaceInfo[]) {
  return workspaces.slice().sort((a, b) => {
    const orderDiff =
      getSortOrderValue(a.settings.sortOrder) - getSortOrderValue(b.settings.sortOrder);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return a.name.localeCompare(b.name);
  });
}

export function buildGroupedWorkspaces(
  workspaces: WorkspaceInfo[],
  workspaceGroups: WorkspaceGroup[],
): WorkspaceGroupSection[] {
  const rootWorkspaces = workspaces.filter(
    (entry) => (entry.kind ?? "main") !== "worktree" && !entry.parentId,
  );
  const buckets = new Map<string | null, WorkspaceInfo[]>();
  workspaceGroups.forEach((group) => {
    buckets.set(group.id, []);
  });
  const ungrouped: WorkspaceInfo[] = [];

  rootWorkspaces.forEach((workspace) => {
    const groupId = workspace.settings.groupId ?? null;
    const bucket = groupId ? buckets.get(groupId) : null;
    if (bucket) {
      bucket.push(workspace);
    } else {
      ungrouped.push(workspace);
    }
  });

  const sections: WorkspaceGroupSection[] = workspaceGroups.map((group) => ({
    id: group.id,
    name: group.name,
    workspaces: sortWorkspacesByOrderAndName(buckets.get(group.id) ?? []),
  }));

  if (ungrouped.length > 0) {
    sections.push({
      id: null,
      name: RESERVED_GROUP_NAME,
      workspaces: sortWorkspacesByOrderAndName(ungrouped),
    });
  }

  return sections.filter((section) => section.workspaces.length > 0);
}
