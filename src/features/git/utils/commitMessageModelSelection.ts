import type { ModelOption } from "@/types";

/**
 * Returns the saved commit-message model ID when available for the active
 * workspace, or `null` to let the backend fall back to the workspace default.
 *
 * This is a pure runtime guard — it never mutates the persisted setting.
 */
export function effectiveCommitMessageModelId(
  models: ModelOption[],
  savedModelId: string | null,
): string | null {
  if (savedModelId == null) return null;
  return models.some((m) => m.model === savedModelId) ? savedModelId : null;
}
