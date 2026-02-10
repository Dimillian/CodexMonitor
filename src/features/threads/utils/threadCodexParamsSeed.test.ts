import { describe, expect, it } from "vitest";
import {
  buildThreadCodexSeedPatch,
  createPendingThreadSeed,
  resolveThreadCodexState,
} from "./threadCodexParamsSeed";

describe("threadCodexParamsSeed", () => {
  it("creates a pending seed only for first-message no-thread composer", () => {
    expect(
      createPendingThreadSeed({
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: null,
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: "ws-1",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
      }),
    ).toEqual({
      workspaceId: "ws-1",
      collaborationModeId: "plan",
      accessMode: "full-access",
    });
  });

  it("resolves thread state from stored params, then pending seed, then global defaults", () => {
    const storedResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-1",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: "gpt-4.1",
        effort: "low",
        accessMode: "read-only",
        collaborationModeId: "default",
        updatedAt: 100,
      },
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
      },
    });

    expect(storedResolved).toEqual({
      scopeKey: "ws-1:thread-1",
      accessMode: "read-only",
      preferredModelId: "gpt-4.1",
      preferredEffort: "low",
      preferredCollabModeId: "default",
    });

    const seededResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-2",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
      },
    });

    expect(seededResolved).toEqual({
      scopeKey: "ws-1:thread-2",
      accessMode: "full-access",
      preferredModelId: "gpt-5",
      preferredEffort: "medium",
      preferredCollabModeId: "plan",
    });
  });

  it("builds first-message seed patch with pending workspace snapshot", () => {
    expect(
      buildThreadCodexSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        pendingSeed: {
          workspaceId: "ws-1",
          collaborationModeId: "plan",
          accessMode: "full-access",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      accessMode: "full-access",
      collaborationModeId: "plan",
    });

    expect(
      buildThreadCodexSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        pendingSeed: {
          workspaceId: "ws-other",
          collaborationModeId: "plan",
          accessMode: "full-access",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      accessMode: "current",
      collaborationModeId: "default",
    });
  });
});
