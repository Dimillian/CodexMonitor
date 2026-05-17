import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { pushErrorToast } from "@/services/toasts";
import type {
  AccessMode,
  AppMention,
  AppSettings,
  ComposerSendIntent,
  ServiceTier,
} from "@/types";
import { normalizeOpenCodeArgsInput } from "@/utils/opencodeArgsInput";
import { useThreadOpenCodeParams } from "@threads/hooks/useThreadOpenCodeParams";
import { getIgnoredOpenCodeArgsFlagsMetadata } from "@threads/utils/opencodeArgsProfiles";
import {
  buildThreadOpenCodeSeedPatch,
  createPendingThreadSeed,
  NO_THREAD_SCOPE_SUFFIX,
  resolveThreadOpenCodeState,
  type PendingNewThreadSeed,
} from "@threads/utils/threadOpenCodeParamsSeed";
import { makeThreadOpenCodeParamsKey } from "@threads/utils/threadStorage";
import { useThreadOpenCodeOrchestration } from "./useThreadOpenCodeOrchestration";

type SetState<T> = Dispatch<SetStateAction<T>>;

type PersistThreadOpenCodeParams = (
  patch: {
    modelId?: string | null;
    effort?: string | null;
    serviceTier?: ServiceTier | null | undefined;
    accessMode?: AccessMode | null;
    collaborationModeId?: string | null;
    opencodeArgsOverride?: string | null;
  },
) => void;

type UseThreadSelectionHandlersOrchestrationParams = {
  appSettingsLoading: boolean;
  setAppSettings: SetState<AppSettings>;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings | void>;
  activeThreadIdRef: MutableRefObject<string | null>;
  setSelectedModelId: (id: string | null) => void;
  setSelectedEffort: (effort: string | null) => void;
  setSelectedServiceTier: (tier: ServiceTier | null | undefined) => void;
  setSelectedCollaborationModeId: (id: string | null) => void;
  setAccessMode: SetState<AccessMode>;
  setSelectedOpenCodeArgsOverride?: (value: string | null) => void;
  persistThreadOpenCodeParams: PersistThreadOpenCodeParams;
};

type UseThreadOpenCodeBootstrapOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
};

type UseThreadOpenCodeSyncOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
  activeThreadId: string | null;
  appSettings: Pick<
    AppSettings,
    "defaultAccessMode" | "lastComposerModelId" | "lastComposerReasoningEffort"
  >;
  threadOpenCodeParamsVersion: number;
  getThreadOpenCodeParams: ReturnType<typeof useThreadOpenCodeParams>["getThreadOpenCodeParams"];
  patchThreadOpenCodeParams: ReturnType<typeof useThreadOpenCodeParams>["patchThreadOpenCodeParams"];
  setThreadOpenCodeSelectionKey: SetState<string | null>;
  setAccessMode: SetState<AccessMode>;
  setPreferredModelId: SetState<string | null>;
  setPreferredEffort: SetState<string | null>;
  setPreferredServiceTier: SetState<ServiceTier | null | undefined>;
  setPreferredCollabModeId: SetState<string | null>;
  setPreferredOpenCodeArgsOverride?: SetState<string | null>;
  activeThreadIdRef: MutableRefObject<string | null>;
  pendingNewThreadSeedRef: MutableRefObject<PendingNewThreadSeed | null>;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  selectedServiceTier: ServiceTier | null | undefined;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  selectedOpenCodeArgsOverride?: string | null;
};

type MainTab = "home" | "projects" | "opencode" | "git" | "log";

type SendOrQueueHandler = (
  text: string,
  images: string[],
  appMentions?: AppMention[],
  submitIntent?: ComposerSendIntent,
) => Promise<void>;

type UseThreadUiOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
  activeThreadId: string | null;
  accessMode: AccessMode;
  selectedServiceTier: ServiceTier | null | undefined;
  selectedCollaborationModeId: string | null;
  selectedOpenCodeArgsOverride?: string | null;
  pendingNewThreadSeedRef: MutableRefObject<PendingNewThreadSeed | null>;
  runWithDraftStart: (runner: () => Promise<void>) => Promise<void>;
  handleComposerSend: SendOrQueueHandler;
  clearDraftState: () => void;
  exitDiffView: () => void;
  resetPullRequestSelection: () => void;
  selectWorkspace: (workspaceId: string) => void;
  setActiveThreadId: (threadId: string | null, workspaceId?: string) => void;
  setActiveTab: SetState<MainTab>;
  isCompact: boolean;
  removeThread: (workspaceId: string, threadId: string) => void;
  clearDraftForThread: (threadId: string) => void;
  removeImagesForThread: (threadId: string) => void;
};

export function useThreadOpenCodeBootstrapOrchestration({
  activeWorkspaceId,
}: UseThreadOpenCodeBootstrapOrchestrationParams) {
  const activeWorkspaceIdForParamsRef = useRef<string | null>(activeWorkspaceId ?? null);

  useEffect(() => {
    activeWorkspaceIdForParamsRef.current = activeWorkspaceId ?? null;
  }, [activeWorkspaceId]);

  return useThreadOpenCodeOrchestration({ activeWorkspaceIdForParamsRef });
}

export function useThreadOpenCodeSyncOrchestration({
  activeWorkspaceId,
  activeThreadId,
  appSettings,
  threadOpenCodeParamsVersion,
  getThreadOpenCodeParams,
  patchThreadOpenCodeParams,
  setThreadOpenCodeSelectionKey,
  setAccessMode,
  setPreferredModelId,
  setPreferredEffort,
  setPreferredServiceTier,
  setPreferredCollabModeId,
  setPreferredOpenCodeArgsOverride,
  activeThreadIdRef,
  pendingNewThreadSeedRef,
  selectedModelId,
  resolvedEffort,
  selectedServiceTier,
  accessMode,
  selectedCollaborationModeId,
  selectedOpenCodeArgsOverride,
}: UseThreadOpenCodeSyncOrchestrationParams) {
  useLayoutEffect(() => {
    const workspaceId = activeWorkspaceId ?? null;
    const threadId = activeThreadId ?? null;
    activeThreadIdRef.current = threadId;

    if (!workspaceId) {
      return;
    }

    const stored = getThreadOpenCodeParams(
      workspaceId,
      threadId ?? NO_THREAD_SCOPE_SUFFIX,
    );
    const noThreadStored = getThreadOpenCodeParams(workspaceId, NO_THREAD_SCOPE_SUFFIX);
    const resolved = resolveThreadOpenCodeState({
      workspaceId,
      threadId,
      defaultAccessMode: appSettings.defaultAccessMode,
      lastComposerModelId: appSettings.lastComposerModelId,
      lastComposerReasoningEffort: appSettings.lastComposerReasoningEffort,
      stored,
      noThreadStored,
      pendingSeed: pendingNewThreadSeedRef.current,
    });

    setThreadOpenCodeSelectionKey(resolved.scopeKey);
    setAccessMode(resolved.accessMode);
    setPreferredModelId(resolved.preferredModelId);
    setPreferredEffort(resolved.preferredEffort);
    setPreferredServiceTier(resolved.preferredServiceTier);
    setPreferredCollabModeId(resolved.preferredCollabModeId);
    setPreferredOpenCodeArgsOverride?.(resolved.preferredOpenCodeArgsOverride);
  }, [
    activeThreadId,
    activeWorkspaceId,
    appSettings.defaultAccessMode,
    appSettings.lastComposerModelId,
    appSettings.lastComposerReasoningEffort,
    getThreadOpenCodeParams,
    setPreferredCollabModeId,
    setPreferredOpenCodeArgsOverride,
    setPreferredEffort,
    setPreferredModelId,
    setPreferredServiceTier,
    setThreadOpenCodeSelectionKey,
    threadOpenCodeParamsVersion,
    setAccessMode,
    activeThreadIdRef,
    pendingNewThreadSeedRef,
  ]);

  const seededThreadParamsRef = useRef(new Set<string>());
  useEffect(() => {
    const workspaceId = activeWorkspaceId ?? null;
    const threadId = activeThreadId ?? null;
    if (!workspaceId || !threadId) {
      return;
    }

    const key = makeThreadOpenCodeParamsKey(workspaceId, threadId);
    if (seededThreadParamsRef.current.has(key)) {
      return;
    }

    const stored = getThreadOpenCodeParams(workspaceId, threadId);
    if (stored) {
      seededThreadParamsRef.current.add(key);
      return;
    }

    seededThreadParamsRef.current.add(key);
    const pendingSeed = pendingNewThreadSeedRef.current;
    patchThreadOpenCodeParams(
      workspaceId,
      threadId,
      buildThreadOpenCodeSeedPatch({
        workspaceId,
        selectedModelId,
        resolvedEffort,
        accessMode,
        selectedCollaborationModeId,
        opencodeArgsOverride:
          selectedOpenCodeArgsOverride === undefined
            ? undefined
            : selectedOpenCodeArgsOverride,
        pendingSeed,
      }),
    );
    if (pendingSeed?.workspaceId === workspaceId) {
      pendingNewThreadSeedRef.current = null;
    }
  }, [
    activeThreadId,
    activeWorkspaceId,
    accessMode,
    getThreadOpenCodeParams,
    patchThreadOpenCodeParams,
    resolvedEffort,
    selectedCollaborationModeId,
    selectedOpenCodeArgsOverride,
    selectedModelId,
    pendingNewThreadSeedRef,
  ]);

  useEffect(() => {
    const workspaceId = activeWorkspaceId ?? null;
    const threadId = activeThreadId ?? null;
    if (!workspaceId || !threadId || selectedServiceTier === undefined) {
      return;
    }

    const noThreadStored = getThreadOpenCodeParams(workspaceId, NO_THREAD_SCOPE_SUFFIX);
    if (noThreadStored?.serviceTier !== undefined) {
      return;
    }

    patchThreadOpenCodeParams(workspaceId, NO_THREAD_SCOPE_SUFFIX, {
      serviceTier: selectedServiceTier,
    });
  }, [
    activeThreadId,
    activeWorkspaceId,
    getThreadOpenCodeParams,
    patchThreadOpenCodeParams,
    selectedServiceTier,
  ]);
}

export function useThreadSelectionHandlersOrchestration({
  appSettingsLoading,
  setAppSettings,
  queueSaveSettings,
  activeThreadIdRef,
  setSelectedModelId,
  setSelectedEffort,
  setSelectedServiceTier,
  setSelectedCollaborationModeId,
  setAccessMode,
  setSelectedOpenCodeArgsOverride,
  persistThreadOpenCodeParams,
}: UseThreadSelectionHandlersOrchestrationParams) {
  const handleSelectModel = useCallback(
    (id: string | null) => {
      setSelectedModelId(id);
      const hasActiveThread = Boolean(activeThreadIdRef.current);
      if (!appSettingsLoading && !hasActiveThread) {
        setAppSettings((current) => {
          if (current.lastComposerModelId === id) {
            return current;
          }
          const nextSettings = { ...current, lastComposerModelId: id };
          void queueSaveSettings(nextSettings);
          return nextSettings;
        });
      }
      persistThreadOpenCodeParams({ modelId: id });
    },
    [
      activeThreadIdRef,
      appSettingsLoading,
      persistThreadOpenCodeParams,
      queueSaveSettings,
      setAppSettings,
      setSelectedModelId,
    ],
  );

  const handleSelectEffort = useCallback(
    (raw: string | null) => {
      const next = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
      setSelectedEffort(next);
      const hasActiveThread = Boolean(activeThreadIdRef.current);
      if (!appSettingsLoading && !hasActiveThread) {
        setAppSettings((current) => {
          if (current.lastComposerReasoningEffort === next) {
            return current;
          }
          const nextSettings = { ...current, lastComposerReasoningEffort: next };
          void queueSaveSettings(nextSettings);
          return nextSettings;
        });
      }
      persistThreadOpenCodeParams({ effort: next });
    },
    [
      activeThreadIdRef,
      appSettingsLoading,
      persistThreadOpenCodeParams,
      queueSaveSettings,
      setAppSettings,
      setSelectedEffort,
    ],
  );

  const handleSelectServiceTier = useCallback(
    (tier: ServiceTier | null | undefined) => {
      setSelectedServiceTier(tier);
      persistThreadOpenCodeParams({ serviceTier: tier });
    },
    [persistThreadOpenCodeParams, setSelectedServiceTier],
  );

  const handleSelectCollaborationMode = useCallback(
    (id: string | null) => {
      setSelectedCollaborationModeId(id);
      persistThreadOpenCodeParams({ collaborationModeId: id });
    },
    [persistThreadOpenCodeParams, setSelectedCollaborationModeId],
  );

  const handleSelectAccessMode = useCallback(
    (mode: AccessMode) => {
      setAccessMode(mode);
      persistThreadOpenCodeParams({ accessMode: mode });
    },
    [persistThreadOpenCodeParams, setAccessMode],
  );

  const handleSelectOpenCodeArgsOverride = useCallback(
    (value: string | null) => {
      const next = normalizeOpenCodeArgsInput(value);
      if (next && getIgnoredOpenCodeArgsFlagsMetadata(next).hasIgnoredFlags) {
        pushErrorToast({
          title: "Some opencode args are ignored",
          message: "Selected flags are ignored for per-thread overrides.",
        });
      }
      setSelectedOpenCodeArgsOverride?.(next);
      persistThreadOpenCodeParams({ opencodeArgsOverride: next });
    },
    [persistThreadOpenCodeParams, setSelectedOpenCodeArgsOverride],
  );

  return {
    handleSelectModel,
    handleSelectEffort,
    handleSelectServiceTier,
    handleSelectCollaborationMode,
    handleSelectAccessMode,
    handleSelectOpenCodeArgsOverride,
  };
}

export function useThreadUiOrchestration({
  activeWorkspaceId,
  activeThreadId,
  accessMode,
  selectedServiceTier,
  selectedCollaborationModeId,
  selectedOpenCodeArgsOverride,
  pendingNewThreadSeedRef,
  runWithDraftStart,
  handleComposerSend,
  clearDraftState,
  exitDiffView,
  resetPullRequestSelection,
  selectWorkspace,
  setActiveThreadId,
  setActiveTab,
  isCompact,
  removeThread,
  clearDraftForThread,
  removeImagesForThread,
}: UseThreadUiOrchestrationParams) {
  const rememberPendingNewThreadSeed = useCallback(() => {
    pendingNewThreadSeedRef.current = createPendingThreadSeed({
      activeThreadId: activeThreadId ?? null,
      activeWorkspaceId: activeWorkspaceId ?? null,
      selectedServiceTier,
      selectedCollaborationModeId,
      accessMode,
      opencodeArgsOverride: selectedOpenCodeArgsOverride ?? null,
    });
  }, [
    accessMode,
    activeThreadId,
    activeWorkspaceId,
    pendingNewThreadSeedRef,
    selectedServiceTier,
    selectedCollaborationModeId,
    selectedOpenCodeArgsOverride,
  ]);

  const handleComposerSendWithDraftStart = useCallback(
    (
      text: string,
      images: string[],
      appMentions?: AppMention[],
      submitIntent?: ComposerSendIntent,
    ) => {
      rememberPendingNewThreadSeed();
      return runWithDraftStart(() =>
        appMentions && appMentions.length > 0
          ? handleComposerSend(text, images, appMentions, submitIntent)
          : handleComposerSend(text, images, undefined, submitIntent),
      );
    },
    [handleComposerSend, rememberPendingNewThreadSeed, runWithDraftStart],
  );

  const handleSelectWorkspaceInstance = useCallback(
    (workspaceId: string, threadId: string) => {
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("opencode");
      }
    },
    [
      clearDraftState,
      exitDiffView,
      isCompact,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveTab,
      setActiveThreadId,
    ],
  );

  const handleOpenThreadLink = useCallback(
    (threadId: string, workspaceId?: string | null) => {
      const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
      if (!targetWorkspaceId) {
        return;
      }
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      if (targetWorkspaceId !== activeWorkspaceId) {
        selectWorkspace(targetWorkspaceId);
      }
      setActiveThreadId(threadId, targetWorkspaceId);
    },
    [
      activeWorkspaceId,
      clearDraftState,
      exitDiffView,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveThreadId,
    ],
  );

  const handleArchiveActiveThread = useCallback(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    removeThread(activeWorkspaceId, activeThreadId);
    clearDraftForThread(activeThreadId);
    removeImagesForThread(activeThreadId);
  }, [
    activeThreadId,
    activeWorkspaceId,
    clearDraftForThread,
    removeImagesForThread,
    removeThread,
  ]);

  return {
    handleComposerSendWithDraftStart,
    handleSelectWorkspaceInstance,
    handleOpenThreadLink,
    handleArchiveActiveThread,
  };
}
