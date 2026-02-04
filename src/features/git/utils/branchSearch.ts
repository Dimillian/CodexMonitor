import type { BranchInfo } from "../../../types";

export type BranchMatchMode = "fuzzy" | "includes";

export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

export function includesMatch(query: string, target: string): boolean {
  return target.toLowerCase().includes(query.toLowerCase());
}

export function filterBranches(
  branches: BranchInfo[],
  query: string,
  options?: { mode?: BranchMatchMode; whenEmptyLimit?: number },
): BranchInfo[] {
  const trimmed = query.trim();
  const mode = options?.mode ?? "includes";
  if (trimmed.length === 0) {
    const limit = options?.whenEmptyLimit;
    return typeof limit === "number" ? branches.slice(0, limit) : branches;
  }

  const matcher = mode === "fuzzy" ? fuzzyMatch : includesMatch;
  return branches.filter((branch) => matcher(trimmed, branch.name));
}

export function findExactBranch(
  branches: BranchInfo[],
  query: string,
): BranchInfo | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }
  return branches.find((branch) => branch.name === trimmed) ?? null;
}
