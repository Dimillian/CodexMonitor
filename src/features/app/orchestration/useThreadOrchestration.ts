import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AccessMode, AppMention, AppSettings } from "@/types";
import { useThreadCodexParams } from "@threads/hooks/useThreadCodexParams";
import {
  buildThreadCodexSeedPatch,
  createPendingThreadSeed,
  resolveThreadCodexState,
  type PendingNewThreadSeed,
} from "@threads/utils/threadCodexParamsSeed";
import { makeThreadCodexParamsKey } from "@threads/utils/threadStorage";
import { useThreadCodexOrchestration } from "./useThreadCodexOrchestration";

type SetState<T> = Dispatch<SetStateAction<T>>;

type PersistThreadCodexParams = (
  patch: {
    modelId?: string | null;
    effort?: string | null;
    accessMode?: AccessMode | null;
    collaborationModeId?: string | null;
  },
) => void;

type UseThreadSelectionHandlersOrchestrationParams = {
  appSettingsLoading: boolean;
  setAppSettings: SetState<AppSettings>;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings | void>;
  activeThreadIdRef: MutableRefObject<string | null>;
  setSelectedModelId: (id: string | null) => void;
  setSelectedEffort: (effort: string | null) => void;
  setSelectedCollaborationModeId: (id: string | null) => void;
  setAccessMode: SetState<AccessMode>;
  persistThreadCodexParams: PersistThreadCodexParams;
};

type UseThreadCodexBootstrapOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
};

type UseThreadCodexSyncOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
  activeThreadId: string | null;
  appSettings: Pick<
    AppSettings,
    "defaultAccessMode" | "lastComposerModelId" | "lastComposerReasoningEffort"
  >;
  threadCodexParamsVersion: number;
  getThreadCodexParams: ReturnType<typeof useThreadCodexParams>["getThreadCodexParams"];
  patchThreadCodexParams: ReturnType<typeof useThreadCodexParams>["patchThreadCodexParams"];
  setThreadCodexSelectionKey: SetState<string | null>;
  setAccessMode: SetState<AccessMode>;
  setPreferredModelId: SetState<string | null>;
  setPreferredEffort: SetState<string | null>;
  setPreferredCollabModeId: SetState<string | null>;
  activeThreadIdRef: MutableRefObject<string | null>;
  pendingNewThreadSeedRef: MutableRefObject<PendingNewThreadSeed | null>;
  selectedModelId: string | null;
  resolvedEffort: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
};

type MainTab = "home" | "projects" | "codex" | "git" | "log";

type SendOrQueueHandler = (
  text: string,
  images: string[],
  appMentions?: AppMention[],
) => Promise<void>;

type UseThreadUiOrchestrationParams = {
  activeWorkspaceId: string | null | undefined;
  activeThreadId: string | null;
  accessMode: AccessMode;
  selectedCollaborationModeId: string | null;
  pendingNewThreadSeedRef: MutableRefObject<PendingNewThreadSeed | null>;
  runWithDraftStart: (runner: () => Promise<void>) => Promise<void>;
  handleComposerSend: SendOrQueueHandler;
  handleComposerQueue: SendOrQueueHandler;
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

export function useThreadCodexBootstrapOrchestration({
  activeWorkspaceId,
}: UseThreadCodexBootstrapOrchestrationParams) {
  const activeWorkspaceIdForParamsRef = useRef<string | null>(activeWorkspaceId ?? null);

  useEffect(() => {
    activeWorkspaceIdForParamsRef.current = activeWorkspaceId ?? null;
  }, [activeWorkspaceId]);

  return useThreadCodexOrchestration({ activeWorkspaceIdForParamsRef });
}

export function useThreadCodexSyncOrchestration({
  activeWorkspaceId,
  activeThreadId,
  appSettings,
  threadCodexParamsVersion,
  getThreadCodexParams,
  patchThreadCodexParams,
  setThreadCodexSelectionKey,
  setAccessMode,
  setPreferredModelId,
  setPreferredEffort,
  setPreferredCollabModeId,
  activeThreadIdRef,
  pendingNewThreadSeedRef,
  selectedModelId,
  resolvedEffort,
  accessMode,
  selectedCollaborationModeId,
}: UseThreadCodexSyncOrchestrationParams) {
  useLayoutEffect(() => {
    const workspaceId = activeWorkspaceId ?? null;
    const threadId = activeThreadId ?? null;
    activeThreadIdRef.current = threadId;

    if (!workspaceId) {
      return;
    }

    const stored = threadId ? getThreadCodexParams(workspaceId, threadId) : null;
    const resolved = resolveThreadCodexState({
      workspaceId,
      threadId,
      defaultAccessMode: appSettings.defaultAccessMode,
      lastComposerModelId: appSettings.lastComposerModelId,
      lastComposerReasoningEffort: appSettings.lastComposerReasoningEffort,
      stored,
      pendingSeed: pendingNewThreadSeedRef.current,
    });

    setThreadCodexSelectionKey(resolved.scopeKey);
    setAccessMode(resolved.accessMode);
    setPreferredModelId(resolved.preferredModelId);
    setPreferredEffort(resolved.preferredEffort);
    setPreferredCollabModeId(resolved.preferredCollabModeId);
  }, [
    activeThreadId,
    activeWorkspaceId,
    appSettings.defaultAccessMode,
    appSettings.lastComposerModelId,
    appSettings.lastComposerReasoningEffort,
    getThreadCodexParams,
    setPreferredCollabModeId,
    setPreferredEffort,
    setPreferredModelId,
    setThreadCodexSelectionKey,
    threadCodexParamsVersion,
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

    const key = makeThreadCodexParamsKey(workspaceId, threadId);
    if (seededThreadParamsRef.current.has(key)) {
      return;
    }

    const stored = getThreadCodexParams(workspaceId, threadId);
    if (stored) {
      seededThreadParamsRef.current.add(key);
      return;
    }

    seededThreadParamsRef.current.add(key);
    const pendingSeed = pendingNewThreadSeedRef.current;
    patchThreadCodexParams(
      workspaceId,
      threadId,
      buildThreadCodexSeedPatch({
        workspaceId,
        selectedModelId,
        resolvedEffort,
        accessMode,
        selectedCollaborationModeId,
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
    getThreadCodexParams,
    patchThreadCodexParams,
    resolvedEffort,
    selectedCollaborationModeId,
    selectedModelId,
    pendingNewThreadSeedRef,
  ]);
}

export function useThreadSelectionHandlersOrchestration({
  appSettingsLoading,
  setAppSettings,
  queueSaveSettings,
  activeThreadIdRef,
  setSelectedModelId,
  setSelectedEffort,
  setSelectedCollaborationModeId,
  setAccessMode,
  persistThreadCodexParams,
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
      persistThreadCodexParams({ modelId: id });
    },
    [
      activeThreadIdRef,
      appSettingsLoading,
      persistThreadCodexParams,
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
      persistThreadCodexParams({ effort: next });
    },
    [
      activeThreadIdRef,
      appSettingsLoading,
      persistThreadCodexParams,
      queueSaveSettings,
      setAppSettings,
      setSelectedEffort,
    ],
  );

  const handleSelectCollaborationMode = useCallback(
    (id: string | null) => {
      setSelectedCollaborationModeId(id);
      persistThreadCodexParams({ collaborationModeId: id });
    },
    [persistThreadCodexParams, setSelectedCollaborationModeId],
  );

  const handleSelectAccessMode = useCallback(
    (mode: AccessMode) => {
      setAccessMode(mode);
      persistThreadCodexParams({ accessMode: mode });
    },
    [persistThreadCodexParams, setAccessMode],
  );

  return {
    handleSelectModel,
    handleSelectEffort,
    handleSelectCollaborationMode,
    handleSelectAccessMode,
  };
}

export function useThreadUiOrchestration({
  activeWorkspaceId,
  activeThreadId,
  accessMode,
  selectedCollaborationModeId,
  pendingNewThreadSeedRef,
  runWithDraftStart,
  handleComposerSend,
  handleComposerQueue,
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
      selectedCollaborationModeId,
      accessMode,
    });
  }, [
    accessMode,
    activeThreadId,
    activeWorkspaceId,
    pendingNewThreadSeedRef,
    selectedCollaborationModeId,
  ]);

  const handleComposerSendWithDraftStart = useCallback(
    (text: string, images: string[], appMentions?: AppMention[]) => {
      rememberPendingNewThreadSeed();
      return runWithDraftStart(() =>
        appMentions && appMentions.length > 0
          ? handleComposerSend(text, images, appMentions)
          : handleComposerSend(text, images),
      );
    },
    [handleComposerSend, rememberPendingNewThreadSeed, runWithDraftStart],
  );

  const handleComposerQueueWithDraftStart = useCallback(
    (text: string, images: string[], appMentions?: AppMention[]) => {
      const runner = activeThreadId
        ? () =>
            appMentions && appMentions.length > 0
              ? handleComposerQueue(text, images, appMentions)
              : handleComposerQueue(text, images)
        : () =>
            appMentions && appMentions.length > 0
              ? handleComposerSend(text, images, appMentions)
              : handleComposerSend(text, images);

      if (!activeThreadId) {
        rememberPendingNewThreadSeed();
      }
      return runWithDraftStart(runner);
    },
    [
      activeThreadId,
      handleComposerQueue,
      handleComposerSend,
      rememberPendingNewThreadSeed,
      runWithDraftStart,
    ],
  );

  const handleSelectWorkspaceInstance = useCallback(
    (workspaceId: string, threadId: string) => {
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("codex");
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
    (threadId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      exitDiffView();
      resetPullRequestSelection();
      clearDraftState();
      setActiveThreadId(threadId, activeWorkspaceId);
    },
    [
      activeWorkspaceId,
      clearDraftState,
      exitDiffView,
      resetPullRequestSelection,
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
    handleComposerQueueWithDraftStart,
    handleSelectWorkspaceInstance,
    handleOpenThreadLink,
    handleArchiveActiveThread,
  };
}
