/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceActions } from "./useWorkspaceActions";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

describe("useWorkspaceActions telemetry", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records agent_created exactly once when adding an agent", async () => {
    const setActiveThreadId = vi.fn();
    const startNewAgentDraft = vi.fn();

    const { result } = renderHook(() =>
      useWorkspaceActions({
        isCompact: false,
        addWorkspace: vi.fn(async () => null),
        addWorkspaceFromPath: vi.fn(async () => null),
        addWorkspacesFromPaths: vi.fn(async () => null),
        setActiveThreadId,
        setActiveTab: vi.fn(),
        exitDiffView: vi.fn(),
        selectWorkspace: vi.fn(),
        onStartNewAgentDraft: startNewAgentDraft,
        openWorktreePrompt: vi.fn(),
        openClonePrompt: vi.fn(),
        composerInputRef: { current: null },
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddAgent(workspace);
    });

    expect(setActiveThreadId).toHaveBeenCalledWith(null, "ws-1");
    expect(startNewAgentDraft).toHaveBeenCalledWith("ws-1");
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledWith("agent_created", 1, {
      attributes: {
        workspace_id: "ws-1",
        thread_id: "draft",
      },
    });
  });
});
