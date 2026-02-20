import { describe, expect, it } from "vitest";
import {
  buildThreadCodexSeedPatch,
  createPendingThreadSeed,
  resolveWorkspaceRuntimeCodexArgsBadgeLabel,
  resolveWorkspaceRuntimeCodexArgsOverride,
  resolveThreadCodexState,
} from "./threadCodexParamsSeed";
import type { ThreadCodexParams } from "./threadStorage";

describe("threadCodexParamsSeed", () => {
  it("creates a pending seed only for first-message no-thread composer", () => {
    expect(
      createPendingThreadSeed({
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile dev",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: null,
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile dev",
      }),
    ).toBeNull();

    expect(
      createPendingThreadSeed({
        activeThreadId: null,
        activeWorkspaceId: "ws-1",
        selectedCollaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile dev",
      }),
    ).toEqual({
      workspaceId: "ws-1",
      collaborationModeId: "plan",
      accessMode: "full-access",
      codexArgsOverride: "--profile dev",
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
        codexArgsOverride: "--profile stored",
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile pending",
      },
    });

    expect(storedResolved).toEqual({
      scopeKey: "ws-1:thread-1",
      accessMode: "read-only",
      preferredModelId: "gpt-4.1",
      preferredEffort: "low",
      preferredCollabModeId: "default",
      preferredCodexArgsOverride: "--profile stored",
    });

    const seededResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-2",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: null,
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile pending",
      },
    });

    expect(seededResolved).toEqual({
      scopeKey: "ws-1:thread-2",
      accessMode: "full-access",
      preferredModelId: "gpt-5",
      preferredEffort: "medium",
      preferredCollabModeId: "plan",
      preferredCodexArgsOverride: "--profile pending",
    });

    const explicitDefaultResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-3",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        accessMode: null,
        collaborationModeId: null,
        codexArgsOverride: null,
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile pending",
      },
    });

    expect(explicitDefaultResolved.preferredCodexArgsOverride).toBeNull();

    const legacyMissingResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-4",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        accessMode: null,
        collaborationModeId: null,
        codexArgsOverride: undefined,
        updatedAt: 100,
      },
      noThreadStored: null,
      pendingSeed: {
        workspaceId: "ws-1",
        collaborationModeId: "plan",
        accessMode: "full-access",
        codexArgsOverride: "--profile pending",
      },
    });

    expect(legacyMissingResolved.preferredCodexArgsOverride).toBe("--profile pending");

    const inheritedFromNoThreadResolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: "thread-5",
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: null,
        effort: null,
        accessMode: null,
        collaborationModeId: null,
        codexArgsOverride: undefined,
        updatedAt: 100,
      },
      noThreadStored: {
        modelId: null,
        effort: null,
        accessMode: null,
        collaborationModeId: null,
        codexArgsOverride: "--profile inherited",
        updatedAt: 200,
      },
      pendingSeed: null,
    });

    expect(inheritedFromNoThreadResolved.preferredCodexArgsOverride).toBe(
      "--profile inherited",
    );
  });

  it("resolves no-thread state from stored no-thread params before defaults", () => {
    const resolved = resolveThreadCodexState({
      workspaceId: "ws-1",
      threadId: null,
      defaultAccessMode: "current",
      lastComposerModelId: "gpt-5",
      lastComposerReasoningEffort: "medium",
      stored: {
        modelId: "gpt-4.1",
        effort: "low",
        accessMode: "read-only",
        collaborationModeId: "plan",
        codexArgsOverride: "--profile stored",
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
      preferredCollabModeId: "plan",
      preferredCodexArgsOverride: "--profile stored",
    });
  });

  it("falls back to no-thread runtime args until thread-scoped params are seeded", () => {
    const entry = (
      codexArgsOverride: string | null | undefined,
    ): ThreadCodexParams => ({
      modelId: null,
      effort: null,
      accessMode: null,
      collaborationModeId: null,
      codexArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadCodexParams | undefined> = {
      "ws-1:__no_thread__": entry("--profile no-thread"),
      "ws-1:thread-with-null": entry(null),
      "ws-1:thread-with-legacy-missing": entry(undefined),
      "ws-1:thread-with-ignored-only": entry("--model gpt-5 --full-auto"),
      "ws-1:thread-with-sanitized-value": entry("--profile thread --model gpt-5"),
    };

    const getThreadCodexParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: null,
        getThreadCodexParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-missing",
        getThreadCodexParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-null",
        getThreadCodexParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-legacy-missing",
        getThreadCodexParams,
      }),
    ).toBe("--profile no-thread");

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-ignored-only",
        getThreadCodexParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-with-sanitized-value",
        getThreadCodexParams,
      }),
    ).toBe("--profile thread");
  });

  it("returns null for no-thread ignored-only overrides and sanitized args otherwise", () => {
    const entry = (
      codexArgsOverride: string | null | undefined,
    ): ThreadCodexParams => ({
      modelId: null,
      effort: null,
      accessMode: null,
      collaborationModeId: null,
      codexArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadCodexParams | undefined> = {
      "ws-1:__no_thread__": entry("--model gpt-5 --sandbox workspace-write"),
      "ws-1:thread-1": entry("--profile dev --model gpt-5"),
    };

    const getThreadCodexParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: null,
        getThreadCodexParams,
      }),
    ).toBeNull();

    expect(
      resolveWorkspaceRuntimeCodexArgsOverride({
        workspaceId: "ws-1",
        threadId: "thread-1",
        getThreadCodexParams,
      }),
    ).toBe("--profile dev");
  });

  it("builds badges from effective runtime codex args, including no-thread fallback", () => {
    const entry = (
      codexArgsOverride: string | null | undefined,
    ): ThreadCodexParams => ({
      modelId: null,
      effort: null,
      accessMode: null,
      collaborationModeId: null,
      codexArgsOverride,
      updatedAt: 0,
    });

    const paramsMap: Record<string, ThreadCodexParams | undefined> = {
      "ws-1:__no_thread__": entry("--profile inherited"),
      "ws-1:thread-legacy-inherit": entry(undefined),
      "ws-1:thread-explicit-default": entry(null),
    };

    const getThreadCodexParams = (workspaceId: string, threadId: string) =>
      paramsMap[`${workspaceId}:${threadId}`] ?? null;

    expect(
      resolveWorkspaceRuntimeCodexArgsBadgeLabel({
        workspaceId: "ws-1",
        threadId: "thread-legacy-inherit",
        getThreadCodexParams,
      }),
    ).toBe("profile:inherited");

    expect(
      resolveWorkspaceRuntimeCodexArgsBadgeLabel({
        workspaceId: "ws-1",
        threadId: "thread-explicit-default",
        getThreadCodexParams,
      }),
    ).toBeNull();
  });

  it("builds first-message seed patch with pending workspace snapshot", () => {
    expect(
      buildThreadCodexSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        codexArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-1",
          collaborationModeId: "plan",
          accessMode: "full-access",
          codexArgsOverride: "--profile pending",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      accessMode: "full-access",
      collaborationModeId: "plan",
      codexArgsOverride: "--profile pending",
    });

    expect(
      buildThreadCodexSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        codexArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-other",
          collaborationModeId: "plan",
          accessMode: "full-access",
          codexArgsOverride: "--profile pending",
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      accessMode: "current",
      collaborationModeId: "default",
      codexArgsOverride: "--profile composer",
    });

    expect(
      buildThreadCodexSeedPatch({
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
      accessMode: "current",
      collaborationModeId: "default",
      codexArgsOverride: undefined,
    });

    expect(
      buildThreadCodexSeedPatch({
        workspaceId: "ws-1",
        selectedModelId: "gpt-5",
        resolvedEffort: "high",
        accessMode: "current",
        selectedCollaborationModeId: "default",
        codexArgsOverride: "--profile composer",
        pendingSeed: {
          workspaceId: "ws-1",
          collaborationModeId: null,
          accessMode: "full-access",
          codexArgsOverride: null,
        },
      }),
    ).toEqual({
      modelId: "gpt-5",
      effort: "high",
      accessMode: "full-access",
      collaborationModeId: null,
      codexArgsOverride: null,
    });
  });
});
