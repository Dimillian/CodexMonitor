// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getCollaborationModes } from "../../../services/tauri";
import { useCollaborationModes } from "./useCollaborationModes";

vi.mock("../../../services/tauri", () => ({
  getCollaborationModes: vi.fn(),
}));

const workspaceOne: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace One",
  path: "/tmp/workspace-one",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const workspaceTwoDisconnected: WorkspaceInfo = {
  id: "workspace-2",
  name: "Workspace Two",
  path: "/tmp/workspace-two",
  connected: false,
  settings: { sidebarCollapsed: false },
};

const workspaceTwoConnected: WorkspaceInfo = {
  ...workspaceTwoDisconnected,
  connected: true,
};

const makeModesResponse = () => ({
  result: {
    data: [{ mode: "plan" }, { mode: "code" }],
  },
});

describe("useCollaborationModes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the last selected mode across workspace switches and reconnects", async () => {
    vi.mocked(getCollaborationModes).mockImplementation(async () => makeModesResponse());

    const { result, rerender } = renderHook(
      ({ workspace, enabled }: { workspace: WorkspaceInfo | null; enabled: boolean }) =>
        useCollaborationModes({ activeWorkspace: workspace, enabled }),
      {
        initialProps: { workspace: workspaceOne, enabled: true },
      },
    );

    await waitFor(() => expect(result.current.selectedCollaborationModeId).toBe("code"));

    act(() => {
      result.current.setSelectedCollaborationModeId("plan");
    });
    expect(result.current.selectedCollaborationModeId).toBe("plan");

    rerender({ workspace: workspaceTwoDisconnected, enabled: true });
    expect(result.current.selectedCollaborationModeId).toBe("plan");
    expect(result.current.collaborationModes).toEqual([]);

    rerender({ workspace: workspaceTwoConnected, enabled: true });

    await waitFor(() => {
      expect(getCollaborationModes).toHaveBeenCalledWith("workspace-2");
      expect(result.current.selectedCollaborationModeId).toBe("plan");
    });
  });

  it("resets the selection when the feature is disabled", async () => {
    vi.mocked(getCollaborationModes).mockResolvedValue(makeModesResponse());

    const { result, rerender } = renderHook(
      ({ workspace, enabled }: { workspace: WorkspaceInfo | null; enabled: boolean }) =>
        useCollaborationModes({ activeWorkspace: workspace, enabled }),
      {
        initialProps: { workspace: workspaceOne, enabled: true },
      },
    );

    await waitFor(() => expect(result.current.selectedCollaborationModeId).toBe("code"));

    act(() => {
      result.current.setSelectedCollaborationModeId("plan");
    });
    expect(result.current.selectedCollaborationModeId).toBe("plan");

    rerender({ workspace: workspaceOne, enabled: false });

    expect(result.current.selectedCollaborationModeId).toBeNull();
    expect(result.current.collaborationModes).toEqual([]);
  });
});

