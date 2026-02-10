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
    data: [{ mode: "plan" }, { mode: "default" }],
  },
});

const makeModesResponseArrayResult = () => ({
  result: [{ mode: "plan" }, { mode: "default" }],
});

const makeModesResponseTopLevelArray = () => [{ mode: "plan" }, { mode: "default" }];

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

    await waitFor(() => expect(result.current.selectedCollaborationModeId).toBe("default"));

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

    await waitFor(() => expect(result.current.selectedCollaborationModeId).toBe("default"));

    act(() => {
      result.current.setSelectedCollaborationModeId("plan");
    });
    expect(result.current.selectedCollaborationModeId).toBe("plan");

    rerender({ workspace: workspaceOne, enabled: false });

    expect(result.current.selectedCollaborationModeId).toBeNull();
    expect(result.current.collaborationModes).toEqual([]);
  });

  it("accepts alternate response shapes from the backend", async () => {
    vi.mocked(getCollaborationModes)
      .mockResolvedValueOnce(makeModesResponseArrayResult() as any)
      .mockResolvedValueOnce(makeModesResponseTopLevelArray() as any);

    const { result, rerender } = renderHook(
      ({ workspace }: { workspace: WorkspaceInfo | null }) =>
        useCollaborationModes({ activeWorkspace: workspace, enabled: true }),
      {
        initialProps: { workspace: workspaceOne },
      },
    );

    await waitFor(() =>
      expect(result.current.collaborationModes.map((mode) => mode.id)).toEqual([
        "plan",
        "default",
      ]),
    );

    rerender({ workspace: { ...workspaceOne, id: "workspace-1b" } });

    await waitFor(() =>
      expect(result.current.collaborationModes.map((mode) => mode.id)).toEqual([
        "plan",
        "default",
      ]),
    );
  });

  it("resets to the workspace default when selectionKey changes and preferredModeId is null", async () => {
    vi.mocked(getCollaborationModes).mockResolvedValue(makeModesResponse());

    const { result, rerender } = renderHook(
      ({
        workspace,
        enabled,
        preferredModeId,
        selectionKey,
      }: {
        workspace: WorkspaceInfo | null;
        enabled: boolean;
        preferredModeId: string | null;
        selectionKey: string | null;
      }) =>
        useCollaborationModes({
          activeWorkspace: workspace,
          enabled,
          preferredModeId,
          selectionKey,
        }),
      {
        initialProps: {
          workspace: workspaceOne,
          enabled: true,
          preferredModeId: "default" as string | null,
          selectionKey: "thread-a",
        },
      },
    );

    await waitFor(() => expect(result.current.selectedCollaborationModeId).toBe("default"));

    act(() => {
      result.current.setSelectedCollaborationModeId("plan");
    });
    expect(result.current.selectedCollaborationModeId).toBe("plan");

    // Thread switch with no stored override: preferredModeId is null.
    rerender({
      workspace: workspaceOne,
      enabled: true,
      preferredModeId: null,
      selectionKey: "thread-b",
    });

    expect(result.current.selectedCollaborationModeId).toBe("default");
  });

  it("falls back to the workspace default when the preferredModeId is stale", async () => {
    vi.mocked(getCollaborationModes).mockResolvedValue(makeModesResponse());

    const { result, rerender } = renderHook(
      (props: {
        enabled: boolean;
        preferredModeId: string | null;
        selectionKey: string;
      }) =>
        useCollaborationModes({
          activeWorkspace: workspaceOne,
          enabled: props.enabled,
          preferredModeId: props.preferredModeId,
          selectionKey: props.selectionKey,
        }),
      {
        initialProps: {
          enabled: true,
          preferredModeId: "plan",
          selectionKey: "thread-a",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.collaborationModes.length).toBeGreaterThan(0);
    });
    expect(result.current.selectedCollaborationModeId).toBe("plan");

    rerender({
      enabled: true,
      preferredModeId: "stale-mode-id",
      selectionKey: "thread-b",
    });

    await waitFor(() => {
      expect(result.current.selectedCollaborationModeId).toBe("default");
    });
  });

  it("reapplies preferred mode when collaboration is re-enabled on the same thread", async () => {
    vi.mocked(getCollaborationModes).mockResolvedValue(makeModesResponse());

    const { result, rerender } = renderHook(
      (props: {
        enabled: boolean;
        preferredModeId: string | null;
        selectionKey: string;
      }) =>
        useCollaborationModes({
          activeWorkspace: workspaceOne,
          enabled: props.enabled,
          preferredModeId: props.preferredModeId,
          selectionKey: props.selectionKey,
        }),
      {
        initialProps: {
          enabled: true,
          preferredModeId: "plan",
          selectionKey: "thread-a",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.selectedCollaborationModeId).toBe("plan");
    });

    rerender({
      enabled: false,
      preferredModeId: "plan",
      selectionKey: "thread-a",
    });
    expect(result.current.selectedCollaborationModeId).toBeNull();

    rerender({
      enabled: true,
      preferredModeId: "plan",
      selectionKey: "thread-a",
    });

    await waitFor(() => {
      expect(result.current.selectedCollaborationModeId).toBe("plan");
    });
  });
});
