import type { ModelOption } from "@/types";

export type CommitMessageModelSelection = {
  resolvedModelId: string | null;
  normalizedModelId: string | null;
  shouldNormalize: boolean;
};

function findFallbackModelId(models: ModelOption[]): string | null {
  return (models.find((model) => model.isDefault) ?? models[0] ?? null)?.model ?? null;
}

export function resolveCommitMessageModelSelection(
  models: ModelOption[],
  commitMessageModelId: string | null,
): CommitMessageModelSelection {
  if (commitMessageModelId === null) {
    return {
      resolvedModelId: null,
      normalizedModelId: null,
      shouldNormalize: false,
    };
  }

  const hasSelectedModel = models.some((model) => model.model === commitMessageModelId);
  if (hasSelectedModel) {
    return {
      resolvedModelId: commitMessageModelId,
      normalizedModelId: commitMessageModelId,
      shouldNormalize: false,
    };
  }

  const fallbackModelId = findFallbackModelId(models);
  return {
    resolvedModelId: fallbackModelId,
    normalizedModelId: fallbackModelId,
    shouldNormalize: true,
  };
}
