import type { ThreadSummary } from "@/types";
import {
  getThreadCreatedTimestamp,
  getThreadTimestamp,
} from "@utils/threadItems";
import { extractThreadOpenCodeMetadata } from "@threads/utils/threadOpenCodeMetadata";
import { asString } from "@threads/utils/threadNormalize";
import {
  getParentThreadIdFromThread,
  getSubagentMetadataFromThread,
  isSubagentThreadSource,
  shouldHideSubagentThreadFromSidebar,
} from "@threads/utils/threadRpc";
import { clampThreadName } from "@threads/utils/threadNaming";

type BuildThreadSummaryFromThreadOptions = {
  workspaceId: string;
  thread: Record<string, unknown>;
  fallbackIndex: number;
  getCustomName?: (workspaceId: string, threadId: string) => string | undefined;
};

export function extractThreadFromResponse(
  response: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return null;
  }
  const result =
    response.result && typeof response.result === "object" && !Array.isArray(response.result)
      ? (response.result as Record<string, unknown>)
      : null;
  const thread =
    (result?.thread as Record<string, unknown> | undefined) ??
    (response.thread as Record<string, unknown> | undefined);
  return thread ?? null;
}

export function buildThreadSummaryFromThread({
  workspaceId,
  thread,
  fallbackIndex,
  getCustomName,
}: BuildThreadSummaryFromThreadOptions): ThreadSummary | null {
  const id = String(thread?.id ?? "");
  if (!id) {
    return null;
  }
  const preview = asString(thread.preview ?? "").trim();
  const customName = getCustomName?.(workspaceId, id);
  const fallbackName = `Agent ${fallbackIndex + 1}`;
  const name = customName
    ? customName
    : clampThreadName(preview) ?? fallbackName;
  const metadata = extractThreadOpenCodeMetadata(thread);
  if (shouldHideSubagentThreadFromSidebar(thread.source)) {
    return null;
  }
  const subagentMetadata = getSubagentMetadataFromThread(thread);
  const isSubagent =
    isSubagentThreadSource(thread.source) ||
    Boolean(getParentThreadIdFromThread(thread)) ||
    Boolean(subagentMetadata.nickname || subagentMetadata.role);
  return {
    id,
    name,
    updatedAt: getThreadTimestamp(thread),
    createdAt: getThreadCreatedTimestamp(thread),
    ...(metadata.modelId ? { modelId: metadata.modelId } : {}),
    ...(metadata.effort ? { effort: metadata.effort } : {}),
    ...(isSubagent ? { isSubagent: true } : {}),
    ...(isSubagent && subagentMetadata.nickname
      ? { subagentNickname: subagentMetadata.nickname }
      : {}),
    ...(isSubagent && subagentMetadata.role
      ? { subagentRole: subagentMetadata.role }
      : {}),
  };
}
