import type { AccessMode, ServiceTier } from "@/types";
import {
  buildEffectiveOpenCodeArgsBadgeLabel,
  sanitizeRuntimeOpenCodeArgs,
} from "./opencodeArgsProfiles";
import type { ThreadOpenCodeParams } from "./threadStorage";
import { makeThreadOpenCodeParamsKey } from "./threadStorage";

export const NO_THREAD_SCOPE_SUFFIX = "__no_thread__";

export type PendingNewThreadSeed = {
  workspaceId: string;
  serviceTier: ServiceTier | null | undefined;
  collaborationModeId: string | null;
  accessMode: AccessMode;
  opencodeArgsOverride: string | null;
};

type ResolveThreadOpenCodeStateInput = {
  workspaceId: string;
  threadId: string | null;
  defaultAccessMode: AccessMode;
  lastComposerModelId: string | null;
  lastComposerReasoningEffort: string | null;
  stored: ThreadOpenCodeParams | null;
  noThreadStored: ThreadOpenCodeParams | null;
  pendingSeed: PendingNewThreadSeed | null;
};

type ResolvedThreadOpenCodeState = {
  scopeKey: string;
  accessMode: AccessMode;
  preferredModelId: string | null;
  preferredEffort: string | null;
  preferredServiceTier: ServiceTier | null | undefined;
  preferredCollabModeId: string | null;
  preferredOpenCodeArgsOverride: string | null;
};

type ThreadOpenCodeSeedPatch = {
  modelId: string | null;
  effort: string | null;
  serviceTier: ServiceTier | null | undefined;
  accessMode: AccessMode;
  collaborationModeId: string | null;
  opencodeArgsOverride: string | null | undefined;
};

export function resolveWorkspaceRuntimeOpenCodeArgsOverride(options: {
  workspaceId: string;
  threadId: string | null;
  getThreadOpenCodeParams: (workspaceId: string, threadId: string) => ThreadOpenCodeParams | null;
}): string | null {
  const { workspaceId, threadId, getThreadOpenCodeParams } = options;
  const getNoThreadArgs = () =>
    getThreadOpenCodeParams(workspaceId, NO_THREAD_SCOPE_SUFFIX)?.opencodeArgsOverride ?? null;

  if (!threadId) {
    return sanitizeRuntimeOpenCodeArgs(getNoThreadArgs());
  }

  const threadScoped = getThreadOpenCodeParams(workspaceId, threadId);
  if (threadScoped) {
    if (threadScoped.opencodeArgsOverride !== undefined) {
      return sanitizeRuntimeOpenCodeArgs(threadScoped.opencodeArgsOverride);
    }
    return sanitizeRuntimeOpenCodeArgs(getNoThreadArgs());
  }

  return sanitizeRuntimeOpenCodeArgs(getNoThreadArgs());
}

export function resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel(options: {
  workspaceId: string;
  threadId: string;
  getThreadOpenCodeParams: (workspaceId: string, threadId: string) => ThreadOpenCodeParams | null;
}): string | null {
  const effectiveArgs = resolveWorkspaceRuntimeOpenCodeArgsOverride({
    workspaceId: options.workspaceId,
    threadId: options.threadId,
    getThreadOpenCodeParams: options.getThreadOpenCodeParams,
  });
  return buildEffectiveOpenCodeArgsBadgeLabel(effectiveArgs);
}

export function createPendingThreadSeed(options: {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  selectedServiceTier: ServiceTier | null | undefined;
  selectedCollaborationModeId: string | null;
  accessMode: AccessMode;
  opencodeArgsOverride?: string | null;
}): PendingNewThreadSeed | null {
  const {
    activeThreadId,
    activeWorkspaceId,
    selectedServiceTier,
    selectedCollaborationModeId,
    accessMode,
    opencodeArgsOverride = null,
  } = options;
  if (activeThreadId || !activeWorkspaceId) {
    return null;
  }
  return {
    workspaceId: activeWorkspaceId,
    serviceTier: selectedServiceTier,
    collaborationModeId: selectedCollaborationModeId,
    accessMode,
    opencodeArgsOverride,
  };
}

export function resolveThreadOpenCodeState(
  input: ResolveThreadOpenCodeStateInput,
): ResolvedThreadOpenCodeState {
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
      preferredServiceTier: stored?.serviceTier,
      preferredCollabModeId: stored?.collaborationModeId ?? null,
      preferredOpenCodeArgsOverride: stored?.opencodeArgsOverride ?? null,
    };
  }

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    scopeKey: makeThreadOpenCodeParamsKey(workspaceId, threadId),
    accessMode: stored?.accessMode ?? pendingForWorkspace?.accessMode ?? defaultAccessMode,
    preferredModelId: stored?.modelId ?? lastComposerModelId ?? null,
    preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
    preferredServiceTier:
      stored?.serviceTier !== undefined
        ? stored.serviceTier
        : noThreadStored?.serviceTier,
    preferredCollabModeId:
      stored?.collaborationModeId ??
      (pendingForWorkspace
        ? pendingForWorkspace.collaborationModeId
        : null),
    preferredOpenCodeArgsOverride:
      stored && stored.opencodeArgsOverride !== undefined
        ? stored.opencodeArgsOverride
        : pendingForWorkspace
          ? pendingForWorkspace.opencodeArgsOverride
          : noThreadStored?.opencodeArgsOverride ?? null,
  };
}

export function buildThreadOpenCodeSeedPatch(options: {
  workspaceId: string;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  opencodeArgsOverride?: string | null | undefined;
  pendingSeed: PendingNewThreadSeed | null;
}): ThreadOpenCodeSeedPatch {
  const {
    workspaceId,
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
    opencodeArgsOverride,
    pendingSeed,
  } = options;

  const pendingForWorkspace =
    pendingSeed && pendingSeed.workspaceId === workspaceId ? pendingSeed : null;

  return {
    modelId: selectedModelId,
    effort: resolvedEffort,
    serviceTier: pendingForWorkspace ? pendingForWorkspace.serviceTier : undefined,
    accessMode: pendingForWorkspace?.accessMode ?? accessMode,
    collaborationModeId: pendingForWorkspace
      ? pendingForWorkspace.collaborationModeId
      : selectedCollaborationModeId,
    opencodeArgsOverride: pendingForWorkspace
      ? pendingForWorkspace.opencodeArgsOverride
      : opencodeArgsOverride,
  };
}
