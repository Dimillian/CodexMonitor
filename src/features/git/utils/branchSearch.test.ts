import { describe, expect, it } from "vitest";
import type { BranchInfo } from "../../../types";
import { filterBranches, findExactBranch, fuzzyMatch } from "./branchSearch";

const branches: BranchInfo[] = [
  { name: "main", lastCommit: 1 },
  { name: "develop", lastCommit: 2 },
  { name: "feature/add-login", lastCommit: 3 },
];

describe("branchSearch", () => {
  it("supports fuzzy matching", () => {
    expect(fuzzyMatch("fal", "feature/add-login")).toBe(true);
    expect(fuzzyMatch("fzl", "feature/add-login")).toBe(false);
  });

  it("filters with includes mode and empty limit", () => {
    expect(
      filterBranches(branches, "dev", { mode: "includes" }).map((branch) => branch.name),
    ).toEqual(["develop"]);
    expect(
      filterBranches(branches, "", { mode: "includes", whenEmptyLimit: 2 }).map(
        (branch) => branch.name,
      ),
    ).toEqual(["main", "develop"]);
  });

  it("finds exact branch by trimmed query", () => {
    expect(findExactBranch(branches, " develop ")?.name).toBe("develop");
    expect(findExactBranch(branches, "missing")).toBeNull();
  });
});
