import { useCallback, useMemo } from "react";
import { setWorkspaceRuntimeOpenCodeArgs } from "@services/tauri";
import { buildOpenCodeArgsOptions } from "@threads/utils/opencodeArgsProfiles";
import {
  resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel,
  resolveWorkspaceRuntimeOpenCodeArgsOverride,
} from "@threads/utils/threadOpenCodeParamsSeed";
import type { ThreadOpenCodeParams } from "@threads/utils/threadStorage";

type ThreadOpenCodeParamsPatch = Partial<
  Pick<
    ThreadOpenCodeParams,
    | "modelId"
    | "effort"
    | "serviceTier"
    | "accessMode"
    | "collaborationModeId"
    | "opencodeArgsOverride"
  >
>;

type ThreadOpenCodeMetadata = {
  modelId: string | null;
  effort: string | null;
};

type UseMainAppThreadOpenCodeStateArgs = {
  appOpenCodeArgs: string | null | undefined;
  selectedOpenCodeArgsOverride: string | null;
  getThreadOpenCodeParams: (
    workspaceId: string,
    threadId: string,
  ) => ThreadOpenCodeParams | null;
  patchThreadOpenCodeParams: (
    workspaceId: string,
    threadId: string,
    patch: ThreadOpenCodeParamsPatch,
  ) => void;
};

export function useMainAppThreadOpenCodeState({
  appOpenCodeArgs,
  selectedOpenCodeArgsOverride,
  getThreadOpenCodeParams,
  patchThreadOpenCodeParams,
}: UseMainAppThreadOpenCodeStateArgs) {
  const handleThreadOpenCodeMetadataDetected = useCallback(
    (workspaceId: string, threadId: string, metadata: ThreadOpenCodeMetadata) => {
      if (!workspaceId || !threadId) {
        return;
      }

      const modelId =
        typeof metadata.modelId === "string" && metadata.modelId.trim().length > 0
          ? metadata.modelId.trim()
          : null;
      const effort =
        typeof metadata.effort === "string" && metadata.effort.trim().length > 0
          ? metadata.effort.trim().toLowerCase()
          : null;
      if (!modelId && !effort) {
        return;
      }

      const current = getThreadOpenCodeParams(workspaceId, threadId);
      const patch: ThreadOpenCodeParamsPatch = {};
      if (modelId && !current?.modelId) {
        patch.modelId = modelId;
      }
      if (effort && !current?.effort) {
        patch.effort = effort;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }
      patchThreadOpenCodeParams(workspaceId, threadId, patch);
    },
    [getThreadOpenCodeParams, patchThreadOpenCodeParams],
  );

  const opencodeArgsOptions = useMemo(
    () =>
      buildOpenCodeArgsOptions({
        appOpenCodeArgs: appOpenCodeArgs ?? null,
        additionalOpenCodeArgs: [selectedOpenCodeArgsOverride],
      }),
    [appOpenCodeArgs, selectedOpenCodeArgsOverride],
  );

  const ensureWorkspaceRuntimeOpenCodeArgs = useCallback(
    async (workspaceId: string, threadId: string | null) => {
      const sanitizedOpenCodeArgsOverride = resolveWorkspaceRuntimeOpenCodeArgsOverride({
        workspaceId,
        threadId,
        getThreadOpenCodeParams,
      });
      await setWorkspaceRuntimeOpenCodeArgs(workspaceId, sanitizedOpenCodeArgsOverride);
    },
    [getThreadOpenCodeParams],
  );

  const getThreadArgsBadge = useCallback(
    (workspaceId: string, threadId: string) =>
      resolveWorkspaceRuntimeOpenCodeArgsBadgeLabel({
        workspaceId,
        threadId,
        getThreadOpenCodeParams,
      }),
    [getThreadOpenCodeParams],
  );

  return {
    handleThreadOpenCodeMetadataDetected,
    opencodeArgsOptions,
    ensureWorkspaceRuntimeOpenCodeArgs,
    getThreadArgsBadge,
  };
}
