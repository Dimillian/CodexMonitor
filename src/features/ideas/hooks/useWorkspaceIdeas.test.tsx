// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceIdeas } from "./useWorkspaceIdeas";

const baseWorkspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false, ideas: [] },
};

describe("useWorkspaceIdeas", () => {
  it("creates, updates, and deletes ideas", async () => {
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(baseWorkspace);

    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useWorkspaceIdeas({
          activeWorkspace: workspace,
          updateWorkspaceSettings,
        }),
      { initialProps: { workspace: baseWorkspace } },
    );

    await result.current.createIdea("", "Idea body");

    let updated = updateWorkspaceSettings.mock.calls[0][1].ideas;
    expect(updated).toHaveLength(1);
    expect(updated[0].title).toBe("");
    expect(updated[0].body).toBe("Idea body");

    const createdId = updated[0].id;

    rerender({
      workspace: { ...baseWorkspace, settings: { ...baseWorkspace.settings, ideas: updated } },
    });

    await result.current.updateIdea(createdId, "New title", "New body");

    updated = updateWorkspaceSettings.mock.calls[1][1].ideas;
    expect(updated).toHaveLength(1);
    expect(updated[0].title).toBe("New title");
    expect(updated[0].body).toBe("New body");

    rerender({
      workspace: { ...baseWorkspace, settings: { ...baseWorkspace.settings, ideas: updated } },
    });

    await result.current.deleteIdea(createdId);

    updated = updateWorkspaceSettings.mock.calls[2][1].ideas;
    expect(updated).toHaveLength(0);
  });
});
