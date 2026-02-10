import type { AccessMode } from "../../../types";
import type { ThreadCodexParams } from "./threadStorage";
import { makeThreadCodexParamsKey } from "./threadStorage";

export const NO_THREAD_SCOPE_SUFFIX = "__no_thread__";

export type PendingNewThreadSeed = {
  workspaceId: string;
  collaborationModeId: string | null;
  accessMode: AccessMode;
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

export type ResolvedThreadCodexState = {
  scopeKey: string;
  accessMode: AccessMode;
  preferredModelId: string | null;
  preferredEffort: string | null;
  preferredCollabModeId: string | null;
};

export type ThreadCodexSeedPatch = {
  modelId: string | null;
  effort: string | null;
  accessMode: AccessMode;
  collaborationModeId: string | null;
};

export function createPendingThreadSeed(options: {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  selectedCollaborationModeId: string | null;
  accessMode: AccessMode;
}): PendingNewThreadSeed | null {
  const { activeThreadId, activeWorkspaceId, selectedCollaborationModeId, accessMode } = options;
  if (activeThreadId || !activeWorkspaceId) {
    return null;
  }
  return {
    workspaceId: activeWorkspaceId,
    collaborationModeId: selectedCollaborationModeId,
    accessMode,
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
      accessMode: defaultAccessMode,
      preferredModelId: lastComposerModelId,
      preferredEffort: lastComposerReasoningEffort,
      preferredCollabModeId: null,
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

  return {
    scopeKey: makeThreadCodexParamsKey(workspaceId, threadId),
    accessMode: stored?.accessMode ?? pendingAccessMode ?? defaultAccessMode,
    preferredModelId: stored?.modelId ?? lastComposerModelId ?? null,
    preferredEffort: stored?.effort ?? lastComposerReasoningEffort ?? null,
    preferredCollabModeId: stored?.collaborationModeId ?? pendingCollabModeId ?? null,
  };
}

export function buildThreadCodexSeedPatch(options: {
  workspaceId: string;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  pendingSeed: PendingNewThreadSeed | null;
}): ThreadCodexSeedPatch {
  const {
    workspaceId,
    selectedModelId,
    resolvedEffort,
    accessMode,
    selectedCollaborationModeId,
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
  };
}
