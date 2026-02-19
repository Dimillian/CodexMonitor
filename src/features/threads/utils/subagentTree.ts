export function getSubagentDescendantThreadIds(args: {
  rootThreadId: string;
  threadParentById: Record<string, string>;
  isSubagentThread: (threadId: string) => boolean;
}): string[] {
  const { rootThreadId, threadParentById, isSubagentThread } = args;
  if (!rootThreadId) {
    return [];
  }

  const childrenByParent = new Map<string, string[]>();
  Object.entries(threadParentById).forEach(([childId, parentId]) => {
    if (!childId || !parentId || childId === parentId) {
      return;
    }
    const list = childrenByParent.get(parentId) ?? [];
    list.push(childId);
    childrenByParent.set(parentId, list);
  });

  const visited = new Set<string>([rootThreadId]);
  const descendants: string[] = [];
  const queue = [...(childrenByParent.get(rootThreadId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (isSubagentThread(current)) {
      descendants.push(current);
    }
    const children = childrenByParent.get(current) ?? [];
    children.forEach((child) => queue.push(child));
  }

  return descendants;
}
