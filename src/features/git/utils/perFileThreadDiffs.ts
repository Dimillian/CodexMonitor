import type { ConversationItem } from "../../../types";

export type PerFileDiffEdit = {
  id: string;
  path: string;
  label: string;
  status: string;
  diff: string;
  sourceItemId: string;
  additions: number;
  deletions: number;
};

export type PerFileDiffGroup = {
  path: string;
  edits: PerFileDiffEdit[];
};

export type PerFileDiffViewerEntry = {
  path: string;
  status: string;
  diff: string;
  displayPath?: string;
};

function normalizePath(rawPath: string): string {
  let normalized = rawPath.trim().replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\/+/, "");
  normalized = normalized.replace(/^(?:a|b)\//, "");
  normalized = normalized.replace(/\/+/g, "/");
  return normalized;
}

function extractPathFromDiff(diff: string): string | null {
  if (!diff.trim()) {
    return null;
  }

  const lines = diff.split("\n");

  for (const line of lines) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line.trim());
    if (match?.[2]) {
      return normalizePath(match[2]);
    }
  }

  for (const line of lines) {
    const match = /^\+\+\+ (?:b\/)?(.+)$/.exec(line.trim());
    if (!match?.[1]) {
      continue;
    }
    const path = normalizePath(match[1]);
    if (path && path !== "/dev/null") {
      return path;
    }
  }

  return null;
}

function mapChangeKindToStatus(kind?: string) {
  const normalized = (kind ?? "").trim().toLowerCase();
  if (normalized === "add" || normalized === "added" || normalized === "create") {
    return "A";
  }
  if (normalized === "delete" || normalized === "deleted" || normalized === "remove") {
    return "D";
  }
  if (normalized === "rename" || normalized === "renamed") {
    return "R";
  }
  return "M";
}

function countDiffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (!line) {
      continue;
    }
    if (
      line.startsWith("+++")
      || line.startsWith("---")
      || line.startsWith("diff --git")
      || line.startsWith("@@")
      || line.startsWith("index ")
      || line.startsWith("\\ No newline")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

export function buildPerFileThreadDiffs(items: ConversationItem[]): {
  groups: PerFileDiffGroup[];
  viewerEntries: PerFileDiffViewerEntry[];
} {
  const groupsByPath = new Map<string, PerFileDiffGroup>();
  const editCountByPath = new Map<string, number>();

  for (const item of items) {
    if (item.kind !== "tool" || item.toolType !== "fileChange") {
      continue;
    }

    const changes = Array.isArray(item.changes) ? item.changes : [];
    for (const [changeIndex, change] of changes.entries()) {
      const pathFromChange = normalizePath(change.path ?? "");
      const diff = change.diff ?? "";
      if (!pathFromChange || !diff.trim()) {
        continue;
      }
      const path = extractPathFromDiff(diff) ?? pathFromChange;

      const nextCount = (editCountByPath.get(path) ?? 0) + 1;
      editCountByPath.set(path, nextCount);
      const id = `${path}@@item-${item.id}@@change-${changeIndex}`;
      const { additions, deletions } = countDiffStats(diff);

      const edit: PerFileDiffEdit = {
        id,
        path,
        label: `Edit ${nextCount}`,
        status: mapChangeKindToStatus(change.kind),
        diff,
        sourceItemId: item.id,
        additions,
        deletions,
      };

      const existingGroup = groupsByPath.get(path);
      if (existingGroup) {
        existingGroup.edits.push(edit);
      } else {
        groupsByPath.set(path, {
          path,
          edits: [edit],
        });
      }
    }
  }

  const groups = Array.from(groupsByPath.values());
  const viewerEntries = groups.flatMap((group) =>
    group.edits.map((edit) => ({
      path: edit.id,
      status: edit.status,
      diff: edit.diff,
      displayPath: edit.path,
    })),
  );

  return { groups, viewerEntries };
}
