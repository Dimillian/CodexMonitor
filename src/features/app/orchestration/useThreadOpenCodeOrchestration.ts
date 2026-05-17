import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AccessMode, ServiceTier } from "@/types";
import { useThreadOpenCodeParams } from "@threads/hooks/useThreadOpenCodeParams";
import {
  type PendingNewThreadSeed,
  NO_THREAD_SCOPE_SUFFIX,
} from "@threads/utils/threadOpenCodeParamsSeed";

type ThreadOpenCodeOrchestration = {
  accessMode: AccessMode;
  setAccessMode: Dispatch<SetStateAction<AccessMode>>;
  preferredModelId: string | null;
  setPreferredModelId: Dispatch<SetStateAction<string | null>>;
  preferredEffort: string | null;
  setPreferredEffort: Dispatch<SetStateAction<string | null>>;
  preferredServiceTier: ServiceTier | null | undefined;
  setPreferredServiceTier: Dispatch<SetStateAction<ServiceTier | null | undefined>>;
  preferredCollabModeId: string | null;
  setPreferredCollabModeId: Dispatch<SetStateAction<string | null>>;
  preferredOpenCodeArgsOverride: string | null;
  setPreferredOpenCodeArgsOverride: Dispatch<SetStateAction<string | null>>;
  threadOpenCodeSelectionKey: string | null;
  setThreadOpenCodeSelectionKey: Dispatch<SetStateAction<string | null>>;
  threadOpenCodeParamsVersion: number;
  getThreadOpenCodeParams: ReturnType<typeof useThreadOpenCodeParams>["getThreadOpenCodeParams"];
  patchThreadOpenCodeParams: ReturnType<typeof useThreadOpenCodeParams>["patchThreadOpenCodeParams"];
  persistThreadOpenCodeParams: (patch: {
    modelId?: string | null;
    effort?: string | null;
    serviceTier?: ServiceTier | null | undefined;
    accessMode?: AccessMode | null;
    collaborationModeId?: string | null;
    opencodeArgsOverride?: string | null;
  }) => void;
  activeThreadIdRef: MutableRefObject<string | null>;
  pendingNewThreadSeedRef: MutableRefObject<PendingNewThreadSeed | null>;
};

type UseThreadOpenCodeOrchestrationParams = {
  activeWorkspaceIdForParamsRef: MutableRefObject<string | null>;
};

export function useThreadOpenCodeOrchestration({
  activeWorkspaceIdForParamsRef,
}: UseThreadOpenCodeOrchestrationParams): ThreadOpenCodeOrchestration {
  const {
    version: threadOpenCodeParamsVersion,
    getThreadOpenCodeParams,
    patchThreadOpenCodeParams,
  } = useThreadOpenCodeParams();
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [preferredModelId, setPreferredModelId] = useState<string | null>(null);
  const [preferredEffort, setPreferredEffort] = useState<string | null>(null);
  const [preferredServiceTier, setPreferredServiceTier] = useState<
    ServiceTier | null | undefined
  >(undefined);
  const [preferredCollabModeId, setPreferredCollabModeId] = useState<string | null>(
    null,
  );
  const [preferredOpenCodeArgsOverride, setPreferredOpenCodeArgsOverride] = useState<string | null>(
    null,
  );
  const [threadOpenCodeSelectionKey, setThreadOpenCodeSelectionKey] = useState<string | null>(
    null,
  );
  const activeThreadIdRef = useRef<string | null>(null);
  const pendingNewThreadSeedRef = useRef<PendingNewThreadSeed | null>(null);

  const persistThreadOpenCodeParams = useCallback(
    (patch: {
      modelId?: string | null;
      effort?: string | null;
      serviceTier?: ServiceTier | null | undefined;
      accessMode?: AccessMode | null;
      collaborationModeId?: string | null;
      opencodeArgsOverride?: string | null;
    }) => {
      const workspaceId = activeWorkspaceIdForParamsRef.current;
      const threadId = activeThreadIdRef.current ?? NO_THREAD_SCOPE_SUFFIX;
      if (!workspaceId) {
        return;
      }
      patchThreadOpenCodeParams(workspaceId, threadId, patch);
      if (
        activeThreadIdRef.current &&
        Object.prototype.hasOwnProperty.call(patch, "serviceTier")
      ) {
        patchThreadOpenCodeParams(workspaceId, NO_THREAD_SCOPE_SUFFIX, {
          serviceTier: patch.serviceTier,
        });
      }
    },
    [activeWorkspaceIdForParamsRef, patchThreadOpenCodeParams],
  );

  return useMemo(
    () => ({
      accessMode,
      setAccessMode,
      preferredModelId,
      setPreferredModelId,
      preferredEffort,
      setPreferredEffort,
      preferredServiceTier,
      setPreferredServiceTier,
      preferredCollabModeId,
      setPreferredCollabModeId,
      preferredOpenCodeArgsOverride,
      setPreferredOpenCodeArgsOverride,
      threadOpenCodeSelectionKey,
      setThreadOpenCodeSelectionKey,
      threadOpenCodeParamsVersion,
      getThreadOpenCodeParams,
      patchThreadOpenCodeParams,
      persistThreadOpenCodeParams,
      activeThreadIdRef,
      pendingNewThreadSeedRef,
    }),
    [
      accessMode,
      preferredCollabModeId,
      preferredOpenCodeArgsOverride,
      preferredEffort,
      preferredModelId,
      preferredServiceTier,
      threadOpenCodeSelectionKey,
      threadOpenCodeParamsVersion,
      setPreferredOpenCodeArgsOverride,
      getThreadOpenCodeParams,
      patchThreadOpenCodeParams,
      persistThreadOpenCodeParams,
    ],
  );
}
