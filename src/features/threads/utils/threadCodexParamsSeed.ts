import type { AccessMode } from "@/types";
import {
  buildEffectiveCodexArgsBadgeLabel,
  sanitizeRuntimeCodexArgs,
} from "./codexArgsProfiles";
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
  noThreadStored: ThreadCodexParams | null;
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
  codexArgsOverride: string | null | undefined;
};

export function resolveWorkspaceRuntimeCodexArgsOverride(options: {
  workspaceId: string;
  threadId: string | null;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
}): string | null {
  const { workspaceId, threadId, getThreadCodexParams } = options;
  const getNoThreadArgs = () =>
    getThreadCodexParams(workspaceId, NO_THREAD_SCOPE_SUFFIX)?.codexArgsOverride ?? null;

  if (!threadId) {
    return sanitizeRuntimeCodexArgs(getNoThreadArgs());
  }

  const threadScoped = getThreadCodexParams(workspaceId, threadId);
  if (threadScoped) {
    if (threadScoped.codexArgsOverride !== undefined) {
      return sanitizeRuntimeCodexArgs(threadScoped.codexArgsOverride);
    }
    return sanitizeRuntimeCodexArgs(getNoThreadArgs());
  }

  return sanitizeRuntimeCodexArgs(getNoThreadArgs());
}

export function resolveWorkspaceRuntimeCodexArgsBadgeLabel(options: {
  workspaceId: string;
  threadId: string;
  getThreadCodexParams: (workspaceId: string, threadId: string) => ThreadCodexParams | null;
}): string | null {
  const effectiveArgs = resolveWorkspaceRuntimeCodexArgsOverride({
    workspaceId: options.workspaceId,
    threadId: options.threadId,
    getThreadCodexParams: options.getThreadCodexParams,
  });
  return buildEffectiveCodexArgsBadgeLabel(effectiveArgs);
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
    noThreadStored,
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

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    scopeKey: makeThreadCodexParamsKey(workspaceId, threadId),
    accessMode: stored?.accessMode ?? pendingForWorkspace?.accessMode ?? defaultAccessMode,
    preferredModelId: stored?.modelId ?? lastComposerModelId ?? null,
    preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
    preferredCollabModeId:
      stored?.collaborationModeId ??
      (pendingForWorkspace
        ? pendingForWorkspace.collaborationModeId
        : null),
    preferredCodexArgsOverride:
      stored && stored.codexArgsOverride !== undefined
        ? stored.codexArgsOverride
        : pendingForWorkspace
          ? pendingForWorkspace.codexArgsOverride
          : noThreadStored?.codexArgsOverride ?? null,
  };
}

export function buildThreadCodexSeedPatch(options: {
  workspaceId: string;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  codexArgsOverride?: string | null | undefined;
  pendingSeed: PendingNewThreadSeed | null;
}): ThreadCodexSeedPatch {
  const {
    workspaceId,
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
    codexArgsOverride,
    pendingSeed,
  } = options;

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    modelId: selectedModelId,
    effort: resolvedEffort,
    accessMode: pendingForWorkspace?.accessMode ?? accessMode,
    collaborationModeId: pendingForWorkspace
      ? pendingForWorkspace.collaborationModeId
      : selectedCollaborationModeId,
    codexArgsOverride: pendingForWorkspace
      ? pendingForWorkspace.codexArgsOverride
      : codexArgsOverride,
  };
}
