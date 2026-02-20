import { useCallback } from "react";
import type { CollaborationModeOption, WorkspaceInfo } from "../../../types";
import {
  makePlanReadyAcceptMessage,
  makePlanReadyChangesMessage,
} from "../../../utils/internalPlanReadyMessages";

type SendUserMessageOptions = {
  collaborationMode?: Record<string, unknown> | null;
};

type SendUserMessageToThread = (
  workspace: WorkspaceInfo,
  threadId: string,
  message: string,
  imageIds: string[],
  options?: SendUserMessageOptions,
) => Promise<void>;

type UsePlanReadyActionsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  collaborationModes: CollaborationModeOption[];
  resolvedModel: string | null;
  resolvedEffort: string | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  sendUserMessageToThread: SendUserMessageToThread;
  setSelectedCollaborationModeId: (modeId: string | null) => void;
  persistThreadCodexParams: (patch: { collaborationModeId?: string | null }) => void;
};

export function usePlanReadyActions({
  activeWorkspace,
  activeThreadId,
  collaborationModes,
  resolvedModel,
  resolvedEffort,
  connectWorkspace,
  sendUserMessageToThread,
  setSelectedCollaborationModeId,
  persistThreadCodexParams,
}: UsePlanReadyActionsOptions) {
  const findCollaborationMode = useCallback(
    (wanted: string) => {
      const normalized = wanted.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      return (
        collaborationModes.find(
          (mode) => mode.id.trim().toLowerCase() === normalized,
        ) ??
        collaborationModes.find(
          (mode) => (mode.mode || mode.id).trim().toLowerCase() === normalized,
        ) ??
        null
      );
    },
    [collaborationModes],
  );

  const isPlanMode = useCallback((mode: CollaborationModeOption | null) => {
    if (!mode) {
      return false;
    }
    const modeValue = (mode.mode || mode.id).trim().toLowerCase();
    return modeValue === "plan";
  }, []);

  const findImplementationMode = useCallback(() => {
    const defaultMode = findCollaborationMode("default");
    if (defaultMode && !isPlanMode(defaultMode)) {
      return defaultMode;
    }

    const codeMode = findCollaborationMode("code");
    if (codeMode && !isPlanMode(codeMode)) {
      return codeMode;
    }

    return collaborationModes.find((mode) => !isPlanMode(mode)) ?? null;
  }, [collaborationModes, findCollaborationMode, isPlanMode]);

  const buildCollaborationModePayloadFor = useCallback(
    (mode: CollaborationModeOption | null) => {
      if (!mode) {
        return null;
      }

      const modeValue = mode.mode || mode.id;
      if (!modeValue) {
        return null;
      }

      const settings: Record<string, unknown> = {
        developer_instructions: mode.developerInstructions ?? null,
      };

      if (resolvedModel) {
        settings.model = resolvedModel;
      }
      if (resolvedEffort !== null) {
        settings.reasoning_effort = resolvedEffort;
      }

      return { mode: modeValue, settings };
    },
    [resolvedEffort, resolvedModel],
  );

  const handlePlanAccept = useCallback(async () => {
    if (!activeWorkspace || !activeThreadId) {
      return;
    }

    if (!activeWorkspace.connected) {
      await connectWorkspace(activeWorkspace);
    }

    const implementationMode = findImplementationMode();
    const implementationModeId = implementationMode?.id ?? null;
    setSelectedCollaborationModeId(implementationModeId);
    persistThreadCodexParams({
      collaborationModeId: implementationModeId,
    });

    const collaborationMode = buildCollaborationModePayloadFor(implementationMode);
    await sendUserMessageToThread(
      activeWorkspace,
      activeThreadId,
      makePlanReadyAcceptMessage(),
      [],
      { collaborationMode: collaborationMode ?? null },
    );
  }, [
    activeThreadId,
    activeWorkspace,
    buildCollaborationModePayloadFor,
    connectWorkspace,
    findImplementationMode,
    persistThreadCodexParams,
    sendUserMessageToThread,
    setSelectedCollaborationModeId,
  ]);

  const handlePlanSubmitChanges = useCallback(
    async (changes: string) => {
      const trimmed = changes.trim();
      if (!activeWorkspace || !activeThreadId || !trimmed) {
        return;
      }

      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }

      const planMode = findCollaborationMode("plan");
      if (planMode?.id) {
        setSelectedCollaborationModeId(planMode.id);
        persistThreadCodexParams({
          collaborationModeId: planMode.id,
        });
      }
      const collaborationMode = buildCollaborationModePayloadFor(planMode);
      const message = makePlanReadyChangesMessage(trimmed);
      await sendUserMessageToThread(
        activeWorkspace,
        activeThreadId,
        message,
        [],
        { collaborationMode: collaborationMode ?? null },
      );
    },
    [
      activeThreadId,
      activeWorkspace,
      buildCollaborationModePayloadFor,
      connectWorkspace,
      findCollaborationMode,
      persistThreadCodexParams,
      sendUserMessageToThread,
      setSelectedCollaborationModeId,
    ],
  );

  return {
    handlePlanAccept,
    handlePlanSubmitChanges,
  };
}
