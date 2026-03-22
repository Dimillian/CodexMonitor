import { describe, expect, it } from "vitest";
import { isKnownLocalWorkspaceRoutePath } from "./workspaceRoutePaths";

describe("isKnownLocalWorkspaceRoutePath", () => {
  it("matches exact mounted settings and reviews routes", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews")).toBe(true);
  });

  it("keeps explicit nested settings and reviews app routes out of file resolution", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/profile")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/overview")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/profile")).toBe(true);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/overview")).toBe(true);
  });

  it("still allows file-like descendants under reserved workspace names", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/src/App.tsx")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/src/App.tsx")).toBe(
      false,
    );
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/src/App.tsx")).toBe(
      false,
    );
  });

  it("treats extensionless descendants under reserved workspace names as mounted files", () => {
    expect(isKnownLocalWorkspaceRoutePath("/workspace/settings/LICENSE")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspace/reviews/bin/tool")).toBe(false);
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/settings/Makefile")).toBe(
      false,
    );
    expect(isKnownLocalWorkspaceRoutePath("/workspaces/team/reviews/bin/tool")).toBe(
      false,
    );
  });
});
