// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CollaborationModeOption, WorkspaceInfo } from "@/types";
import { usePlanReadyActions } from "@app/hooks/usePlanReadyActions";

function makeMode(id: string): CollaborationModeOption {
  return {
    id,
    label: id,
    mode: id,
    model: "",
    reasoningEffort: null,
    developerInstructions: null,
    value: {},
  };
}

const connectedWorkspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const disconnectedWorkspace: WorkspaceInfo = {
  ...connectedWorkspace,
  connected: false,
};

function renderPlanReadyActions(overrides?: {
  activeWorkspace?: WorkspaceInfo | null;
  collaborationModes?: CollaborationModeOption[];
  resolvedModel?: string | null;
  resolvedEffort?: string | null;
}) {
  const connectWorkspace = vi.fn().mockResolvedValue(undefined);
  const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
  const setSelectedCollaborationModeId = vi.fn();
  const persistThreadCodexParams = vi.fn();

  const options = {
    activeWorkspace: connectedWorkspace as WorkspaceInfo | null,
    activeThreadId: "thread-1" as string | null,
    collaborationModes: [makeMode("plan"), makeMode("default"), makeMode("code")],
    resolvedModel: "gpt-5.2" as string | null,
    resolvedEffort: "high" as string | null,
    ...overrides,
    connectWorkspace,
    sendUserMessageToThread,
    setSelectedCollaborationModeId,
    persistThreadCodexParams,
  };

  const hook = renderHook(() => usePlanReadyActions(options));
  return {
    ...hook,
    connectWorkspace,
    sendUserMessageToThread,
    setSelectedCollaborationModeId,
    persistThreadCodexParams,
  };
}

describe("usePlanReadyActions", () => {
  it("uses default mode when implementing a plan and persists selection", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions();

    await act(async () => {
      await result.current.handlePlanAccept();
    });

    expect(setSelectedCollaborationModeId).toHaveBeenCalledWith("default");
    expect(persistThreadCodexParams).toHaveBeenCalledWith({
      collaborationModeId: "default",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:accept]] Implement this plan.",
      [],
      {
        collaborationMode: {
          mode: "default",
          settings: {
            developer_instructions: null,
            model: "gpt-5.2",
            reasoning_effort: "high",
          },
        },
      },
    );
  });

  it("falls back to first non-plan mode when default/code are unavailable", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions({
      collaborationModes: [makeMode("plan"), makeMode("review")],
    });

    await act(async () => {
      await result.current.handlePlanAccept();
    });

    expect(setSelectedCollaborationModeId).toHaveBeenCalledWith("review");
    expect(persistThreadCodexParams).toHaveBeenCalledWith({
      collaborationModeId: "review",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:accept]] Implement this plan.",
      [],
      expect.objectContaining({
        collaborationMode: expect.objectContaining({
          mode: "review",
        }),
      }),
    );
  });

  it("forces neutral mode override when only plan mode is available", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions({
      collaborationModes: [makeMode("plan")],
    });

    await act(async () => {
      await result.current.handlePlanAccept();
    });

    expect(setSelectedCollaborationModeId).toHaveBeenCalledWith(null);
    expect(persistThreadCodexParams).toHaveBeenCalledWith({
      collaborationModeId: null,
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:accept]] Implement this plan.",
      [],
      { collaborationMode: null },
    );
  });

  it("forces neutral mode override when no collaboration modes are available", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions({
      collaborationModes: [],
    });

    await act(async () => {
      await result.current.handlePlanAccept();
    });

    expect(setSelectedCollaborationModeId).toHaveBeenCalledWith(null);
    expect(persistThreadCodexParams).toHaveBeenCalledWith({
      collaborationModeId: null,
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:accept]] Implement this plan.",
      [],
      { collaborationMode: null },
    );
  });

  it("connects workspace before sending plan accept message", async () => {
    const { result, connectWorkspace, sendUserMessageToThread } =
      renderPlanReadyActions({
        activeWorkspace: disconnectedWorkspace,
      });

    await act(async () => {
      await result.current.handlePlanAccept();
    });

    expect(connectWorkspace).toHaveBeenCalledWith(disconnectedWorkspace);
    expect(sendUserMessageToThread).toHaveBeenCalledTimes(1);
  });

  it("keeps plan mode for plan-change follow-up and persists it", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions({
      collaborationModes: [makeMode("default"), makeMode("plan")],
    });

    await act(async () => {
      await result.current.handlePlanSubmitChanges("  Add tests  ");
    });

    expect(setSelectedCollaborationModeId).toHaveBeenCalledWith("plan");
    expect(persistThreadCodexParams).toHaveBeenCalledWith({
      collaborationModeId: "plan",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:changes]] Update the plan with these changes:\n\nAdd tests",
      [],
      {
        collaborationMode: {
          mode: "plan",
          settings: {
            developer_instructions: null,
            model: "gpt-5.2",
            reasoning_effort: "high",
          },
        },
      },
    );
  });

  it("uses neutral mode override for plan-change follow-up when plan mode is unavailable", async () => {
    const {
      result,
      setSelectedCollaborationModeId,
      persistThreadCodexParams,
      sendUserMessageToThread,
    } = renderPlanReadyActions({
      collaborationModes: [makeMode("default")],
    });

    await act(async () => {
      await result.current.handlePlanSubmitChanges("  Add tests  ");
    });

    expect(setSelectedCollaborationModeId).not.toHaveBeenCalled();
    expect(persistThreadCodexParams).not.toHaveBeenCalled();
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-1",
      "[[cm_plan_ready:changes]] Update the plan with these changes:\n\nAdd tests",
      [],
      { collaborationMode: null },
    );
  });
});
