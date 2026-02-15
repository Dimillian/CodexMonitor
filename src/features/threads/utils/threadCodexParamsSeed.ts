import type { AccessMode } from "@/types";
import { sanitizeRuntimeCodexArgs } from "./codexArgsProfiles";
import type { ThreadCodexParams } from "./threadStorage";
import { makeThreadCodexParamsKey } from "./threadStorage";

export const NO_THREAD_SCOPE_SUFFIX = "__no_thread__";

export type PendingNewThreadSeed = {
  workspaceId: string;
  collaborationModeId: string | null;
  accessMode: AccessMode;
  codexArgsOverride: string | null;
};

type ResolveThreadCodexStateInput = {
  workspaceId: string;
  threadId: string | null;
  defaultAccessMode: AccessMode;
  lastComposerModelId: string | null;
  lastComposerReasoningEffort: string | null;
  stored: ThreadCodexParams | null;
  pendingSeed: PendingNewThreadSeed | null;
};

type ResolvedThreadCodexState = {
  scopeKey: string;
  accessMode: AccessMode;
  preferredModelId: string | null;
  preferredEffort: string | null;
  preferredCollabModeId: string | null;
  preferredCodexArgsOverride: string | null;
};

type ThreadCodexSeedPatch = {
  modelId: string | null;
  effort: string | null;
  accessMode: AccessMode;
  collaborationModeId: string | null;
  codexArgsOverride: string | null;
};

export function resolveWorkspaceRuntimeCodexArgsOverride(options: {
  workspaceId: string;
  threadId: string | null;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
}): string | null {
  const { workspaceId, threadId, getThreadCodexParams } = options;
  if (!threadId) {
    const noThreadArgs =
      getThreadCodexParams(workspaceId, NO_THREAD_SCOPE_SUFFIX)?.codexArgsOverride ?? null;
    return sanitizeRuntimeCodexArgs(noThreadArgs);
  }

  const threadScoped = getThreadCodexParams(workspaceId, threadId);
  if (threadScoped) {
    return sanitizeRuntimeCodexArgs(threadScoped.codexArgsOverride ?? null);
  }

  const noThreadArgs =
    getThreadCodexParams(workspaceId, NO_THREAD_SCOPE_SUFFIX)?.codexArgsOverride ?? null;
  return sanitizeRuntimeCodexArgs(noThreadArgs);
}

export function createPendingThreadSeed(options: {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  selectedCollaborationModeId: string | null;
  accessMode: AccessMode;
  codexArgsOverride?: string | null;
}): PendingNewThreadSeed | null {
  const {
    activeThreadId,
    activeWorkspaceId,
    selectedCollaborationModeId,
    accessMode,
    codexArgsOverride = null,
  } = options;
  if (activeThreadId || !activeWorkspaceId) {
    return null;
  }
  return {
    workspaceId: activeWorkspaceId,
    collaborationModeId: selectedCollaborationModeId,
    accessMode,
    codexArgsOverride,
  };
}

export function resolveThreadCodexState(
  input: ResolveThreadCodexStateInput,
): ResolvedThreadCodexState {
  const {
    workspaceId,
    threadId,
    defaultAccessMode,
    lastComposerModelId,
    lastComposerReasoningEffort,
    stored,
    pendingSeed,
  } = input;

  if (!threadId) {
    return {
      scopeKey: `${workspaceId}:${NO_THREAD_SCOPE_SUFFIX}`,
      accessMode: stored?.accessMode ?? defaultAccessMode,
      preferredModelId: stored?.modelId ?? lastComposerModelId ?? null,
      preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
      preferredCollabModeId: stored?.collaborationModeId ?? null,
      preferredCodexArgsOverride: stored?.codexArgsOverride ?? null,
    };
  }

  const pendingAccessMode =
    pendingSeed && pendingSeed.workspaceId === workspaceId
      ? pendingSeed.accessMode
      : null;
  const pendingCollabModeId =
    pendingSeed && pendingSeed.workspaceId === workspaceId
      ? pendingSeed.collaborationModeId
      : null;
  const pendingCodexArgsOverride =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed.codexArgsOverride : null;

  return {
    scopeKey: makeThreadCodexParamsKey(workspaceId, threadId),
    accessMode: stored?.accessMode ?? pendingAccessMode ?? defaultAccessMode,
    preferredModelId: stored?.modelId ?? lastComposerModelId ?? null,
    preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
    preferredCollabModeId: stored?.collaborationModeId ?? pendingCollabModeId ?? null,
    preferredCodexArgsOverride: stored?.codexArgsOverride ?? pendingCodexArgsOverride ?? null,
  };
}

export function buildThreadCodexSeedPatch(options: {
  workspaceId: string;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  codexArgsOverride?: string | null;
  pendingSeed: PendingNewThreadSeed | null;
}): ThreadCodexSeedPatch {
  const {
    workspaceId,
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
    codexArgsOverride = null,
    pendingSeed,
  } = options;

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    modelId: selectedModelId,
    effort: resolvedEffort,
    accessMode: pendingForWorkspace?.accessMode ?? accessMode,
    collaborationModeId:
      pendingForWorkspace?.collaborationModeId ?? selectedCollaborationModeId,
    codexArgsOverride: pendingForWorkspace?.codexArgsOverride ?? codexArgsOverride,
  };
}
