import { describe, expect, it } from "vitest";
import { shouldApplyCommitMessage } from "./commitMessage";

describe("shouldApplyCommitMessage", () => {
  it("returns true when workspace ids match", () => {
    expect(shouldApplyCommitMessage("workspace-1", "workspace-1")).toBe(true);
  });

  it("returns false when workspace ids differ", () => {
    expect(shouldApplyCommitMessage("workspace-1", "workspace-2")).toBe(false);
  });

  it("returns false when active workspace is null", () => {
    expect(shouldApplyCommitMessage(null, "workspace-1")).toBe(false);
  });
});
