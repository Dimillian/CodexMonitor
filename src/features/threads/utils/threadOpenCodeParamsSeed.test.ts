import { describe, expect, it } from "vitest";
import {
  buildThreadOpenCodeSeedPatch,
  createPendingThreadSeed,
  resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel,
  resolveWorkspaceRuntimeOpenCodeArgsOverride,
  resolveThreadOpenCodeState,
} from "./threadOpenCodeParamsSeed";
import type { ThreadOpenCodeParams } from "./threadStorage";

describe("threadCodexParamsSeed", () => {
  it("creates a pending seed only for first-message no-thread composer", () => {
    expect(
      createPendingThreadSeed({
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        selectedServiceTier: "fast",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile dev",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: null,
        selectedServiceTier: "fast",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile dev",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: "ws-1",
        selectedServiceTier: "fast",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile dev",
      }),
    ).toEqual({
      workspaceId: "ws-1",
      serviceTier: "fast",
      collaborationModeId: "plan",
      accessMode: "full-access",
      opencodeArgsOverride: "--profile dev",
    });
  });

  it("resolves thread state from stored params, then pending seed, then global defaults", () => {
    const storedResolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-1",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: "gpt-4.1",
        effort: "low",
        serviceTier: null,
        accessMode: "read-only",
        collaborationModeId: "default",
        opencodeArgsOverride: "--profile stored",
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        serviceTier: "fast",
        collaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile pending",
      },
    });

    expect(storedResolved).toEqual({
      scopeKey: "ws-1:thread-1",
      accessMode: "read-only",
      preferredModelId: "gpt-4.1",
      preferredEffort: "low",
      preferredServiceTier: null,
      preferredCollabModeId: "default",
      preferredOpenCodeArgsOverride: "--profile stored",
    });

    const seededResolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-2",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: null,
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        serviceTier: undefined,
        collaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile pending",
      },
    });

    expect(seededResolved).toEqual({
      scopeKey: "ws-1:thread-2",
      accessMode: "full-access",
      preferredModelId: "gpt-5",
      preferredEffort: "medium",
      preferredServiceTier: undefined,
      preferredCollabModeId: "plan",
      preferredOpenCodeArgsOverride: "--profile pending",
    });

    const explicitDefaultResolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-3",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        serviceTier: null,
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: null,
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        serviceTier: undefined,
        collaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile pending",
      },
    });

    expect(explicitDefaultResolved.preferredOpenCodeArgsOverride).toBeNull();

    const legacyMissingResolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-4",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        serviceTier: null,
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: undefined,
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        serviceTier: undefined,
        collaborationModeId: "plan",
        accessMode: "full-access",
        opencodeArgsOverride: "--profile pending",
      },
    });

    expect(legacyMissingResolved.preferredOpenCodeArgsOverride).toBe("--profile pending");

    const inheritedFromNoThreadResolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-5",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        serviceTier: null,
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: undefined,
        updatedAt: 100,
      },
      noThreadStored: {
        modelId: null,
        effort: null,
        serviceTier: null,
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: "--profile inherited",
        updatedAt: 200,
      },
      pendingSeed: null,
    });

    expect(inheritedFromNoThreadResolved.preferredOpenCodeArgsOverride).toBe(
      "--profile inherited",
    );
  });

  it("resolves no-thread state from stored no-thread params before defaults", () => {
    const resolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: null,
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: "gpt-4.1",
        effort: "low",
        serviceTier: null,
        accessMode: "read-only",
        collaborationModeId: "plan",
        opencodeArgsOverride: "--profile stored",
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: null,
    });

    expect(resolved).toEqual({
      scopeKey: "ws-1:__no_thread__",
      accessMode: "read-only",
      preferredModelId: "gpt-4.1",
      preferredEffort: "low",
      preferredServiceTier: null,
      preferredCollabModeId: "plan",
      preferredOpenCodeArgsOverride: "--profile stored",
    });
  });

  it("keeps explicit thread-scoped Fast off when no-thread scope is fast", () => {
    const resolved = resolveThreadOpenCodeState({
      workspaceId: "ws-1",
      threadId: "thread-1",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        serviceTier: null,
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: undefined,
        updatedAt: 100,
      },
      noThreadStored: {
        modelId: null,
        effort: null,
        serviceTier: "fast",
        accessMode: null,
        collaborationModeId: null,
        opencodeArgsOverride: undefined,
        updatedAt: 200,
      },
      pendingSeed: null,
    });

    expect(resolved.preferredServiceTier).toBeNull();
  });

  it("falls back to no-thread runtime args until thread-scoped params are seeded", () => {
    const entry = (
      opencodeArgsOverride: string | null | undefined,
    ): ThreadOpenCodeParams => ({
      modelId: null,
      effort: null,
      serviceTier: null,
      accessMode: null,
      collaborationModeId: null,
      opencodeArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadOpenCodeParams | undefined> = {
      "ws-1:__no_thread__": entry("--profile no-thread"),
      "ws-1:thread-with-null": entry(null),
      "ws-1:thread-with-legacy-missing": entry(undefined),
      "ws-1:thread-with-ignored-only": entry("--model gpt-5 --full-auto"),
      "ws-1:thread-with-sanitized-value": entry("--profile thread --model gpt-5"),
    };

    const getThreadOpenCodeParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: null,
        getThreadOpenCodeParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-missing",
        getThreadOpenCodeParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-null",
        getThreadOpenCodeParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-legacy-missing",
        getThreadOpenCodeParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-ignored-only",
        getThreadOpenCodeParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-sanitized-value",
        getThreadOpenCodeParams,
      }),
    ).toBe("--profile thread");
  });

  it("returns null for no-thread ignored-only overrides and sanitized args otherwise", () => {
    const entry = (
      opencodeArgsOverride: string | null | undefined,
    ): ThreadOpenCodeParams => ({
      modelId: null,
      effort: null,
      serviceTier: null,
      accessMode: null,
      collaborationModeId: null,
      opencodeArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadOpenCodeParams | undefined> = {
      "ws-1:__no_thread__": entry("--model gpt-5 --sandbox workspace-write"),
      "ws-1:thread-1": entry("--profile dev --model gpt-5"),
    };

    const getThreadOpenCodeParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: null,
        getThreadOpenCodeParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-1",
        getThreadOpenCodeParams,
      }),
    ).toBe("--profile dev");
  });

  it("builds badges from effective runtime codex args, including no-thread fallback", () => {
    const entry = (
      opencodeArgsOverride: string | null | undefined,
    ): ThreadOpenCodeParams => ({
      modelId: null,
      effort: null,
      serviceTier: null,
      accessMode: null,
      collaborationModeId: null,
      opencodeArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadOpenCodeParams | undefined> = {
      "ws-1:__no_thread__": entry("--profile inherited"),
      "ws-1:thread-legacy-inherit": entry(undefined),
      "ws-1:thread-explicit-default": entry(null),
    };

    const getThreadOpenCodeParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel({
        workspaceId: "ws-1",
        threadId: "thread-legacy-inherit",
        getThreadOpenCodeParams,
      }),
    ).toBe("profile:inherited");

    expect(
      resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel({
        workspaceId: "ws-1",
        threadId: "thread-explicit-default",
        getThreadOpenCodeParams,
      }),
    ).toBeNull();
  });

  it("builds first-message seed patch with pending workspace snapshot", () => {
    expect(
      buildThreadOpenCodeSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        opencodeArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-1",
          serviceTier: null,
          collaborationModeId: "plan",
          accessMode: "full-access",
          opencodeArgsOverride: "--profile pending",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      serviceTier: null,
      accessMode: "full-access",
      collaborationModeId: "plan",
      opencodeArgsOverride: "--profile pending",
    });

    expect(
      buildThreadOpenCodeSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        opencodeArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-1",
          serviceTier: "fast",
          collaborationModeId: "plan",
          accessMode: "full-access",
          opencodeArgsOverride: "--profile pending",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      serviceTier: "fast",
      accessMode: "full-access",
      collaborationModeId: "plan",
      opencodeArgsOverride: "--profile pending",
    });

    expect(
      buildThreadOpenCodeSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        opencodeArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-other",
          serviceTier: "fast",
          collaborationModeId: "plan",
          accessMode: "full-access",
          opencodeArgsOverride: "--profile pending",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      serviceTier: undefined,
      accessMode: "current",
      collaborationModeId: "default",
      opencodeArgsOverride: "--profile composer",
    });

    expect(
      buildThreadOpenCodeSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        pendingSeed: null,
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      serviceTier: undefined,
      accessMode: "current",
      collaborationModeId: "default",
      opencodeArgsOverride: undefined,
    });

    expect(
      buildThreadOpenCodeSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        opencodeArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-1",
          serviceTier: null,
          collaborationModeId: null,
          accessMode: "full-access",
          opencodeArgsOverride: null,
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      serviceTier: null,
      accessMode: "full-access",
      collaborationModeId: null,
      opencodeArgsOverride: null,
    });
  });
});
