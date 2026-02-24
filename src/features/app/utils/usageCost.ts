import type { ThreadTokenUsage } from "@/types";

type ModelPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type UsageCostSummary = {
  knownUsd: number;
  unknownTokens: number;
  totalTokens: number;
};

type EstimateThreadUsageCostOptions = {
  excludeCache: boolean;
};

const TOKENS_PER_MILLION = 1_000_000;

const ZERO_SUMMARY: UsageCostSummary = {
  knownUsd: 0,
  unknownTokens: 0,
  totalTokens: 0,
};

// Pricing snapshot from OpenAI model pricing docs (USD per 1M tokens).
const MODEL_PRICING_BY_ID: Record<string, ModelPricing> = {
  "gpt-5.2": {
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  "gpt-5.1": {
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  "gpt-5": {
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  "gpt-5-mini": {
    inputUsdPerMillion: 0.25,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 2,
  },
  "gpt-5-nano": {
    inputUsdPerMillion: 0.05,
    cachedInputUsdPerMillion: 0.005,
    outputUsdPerMillion: 0.4,
  },
  "gpt-5-codex": {
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  "gpt-5.1-codex-max": {
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  "gpt-5.2-codex": {
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  "gpt-5.1-codex": {
    inputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.125,
    outputUsdPerMillion: 10,
  },
  "gpt-5-codex-mini": {
    inputUsdPerMillion: 0.25,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 2,
  },
  "gpt-5.1-codex-mini": {
    inputUsdPerMillion: 0.25,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 2,
  },
  "codex-mini-latest": {
    inputUsdPerMillion: 1.5,
    cachedInputUsdPerMillion: 0.375,
    outputUsdPerMillion: 6,
  },
};

function coerceTokenCount(value: number | null | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function stripDatedModelSuffix(modelId: string): string {
  return modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function stripTrailingVariant(modelId: string): string {
  return modelId.replace(/-(spark|latest)$/, "");
}

function resolveCodexFamilyPricing(modelId: string): ModelPricing | null {
  const codexMiniMatch = /^gpt-5(?:\.(\d+))?-codex-mini(?:-.+)?$/.exec(modelId);
  if (codexMiniMatch) {
    const minor = Number.parseInt(codexMiniMatch[1] ?? "1", 10);
    if (Number.isFinite(minor) && minor >= 1) {
      return (
        MODEL_PRICING_BY_ID["gpt-5.1-codex-mini"] ??
        MODEL_PRICING_BY_ID["gpt-5-codex-mini"] ??
        null
      );
    }
    return MODEL_PRICING_BY_ID["gpt-5-codex-mini"] ?? null;
  }

  const codexMaxMatch = /^gpt-5(?:\.(\d+))?-codex-max(?:-.+)?$/.exec(modelId);
  if (codexMaxMatch) {
    return MODEL_PRICING_BY_ID["gpt-5.1-codex-max"] ?? MODEL_PRICING_BY_ID["gpt-5-codex"] ?? null;
  }

  const codexMatch = /^gpt-5(?:\.(\d+))?-codex(?:-.+)?$/.exec(modelId);
  if (codexMatch) {
    const minor = Number.parseInt(codexMatch[1] ?? "0", 10);
    if (Number.isFinite(minor) && minor >= 2) {
      return MODEL_PRICING_BY_ID["gpt-5.2-codex"] ?? MODEL_PRICING_BY_ID["gpt-5.1-codex"] ?? null;
    }
    if (minor === 1) {
      return MODEL_PRICING_BY_ID["gpt-5.1-codex"] ?? MODEL_PRICING_BY_ID["gpt-5-codex"] ?? null;
    }
    return MODEL_PRICING_BY_ID["gpt-5-codex"] ?? MODEL_PRICING_BY_ID["gpt-5.1-codex"] ?? null;
  }

  const gptFiveMatch = /^gpt-5(?:\.(\d+))?(?:-.+)?$/.exec(modelId);
  if (gptFiveMatch) {
    const minor = Number.parseInt(gptFiveMatch[1] ?? "0", 10);
    if (Number.isFinite(minor) && minor >= 2) {
      return MODEL_PRICING_BY_ID["gpt-5.2"] ?? MODEL_PRICING_BY_ID["gpt-5.1"] ?? null;
    }
    if (minor === 1) {
      return MODEL_PRICING_BY_ID["gpt-5.1"] ?? MODEL_PRICING_BY_ID["gpt-5"] ?? null;
    }
    return MODEL_PRICING_BY_ID["gpt-5"] ?? MODEL_PRICING_BY_ID["gpt-5.1"] ?? null;
  }

  return null;
}

function resolveModelPricing(modelId: string | null | undefined): ModelPricing | null {
  if (typeof modelId !== "string") {
    return null;
  }
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return null;
  }
  const exact = MODEL_PRICING_BY_ID[normalized];
  if (exact) {
    return exact;
  }
  const withoutDate = stripDatedModelSuffix(normalized);
  const withoutVariant = stripTrailingVariant(withoutDate);
  if (withoutVariant !== normalized) {
    const normalizedMatch = MODEL_PRICING_BY_ID[withoutVariant];
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }
  return resolveCodexFamilyPricing(withoutVariant);
}

export function estimateThreadUsageCost(
  usage: ThreadTokenUsage | null | undefined,
  modelId: string | null | undefined,
  options: EstimateThreadUsageCostOptions,
): UsageCostSummary {
  const totalTokens = coerceTokenCount(usage?.total.totalTokens);
  const cachedFromTotal = coerceTokenCount(usage?.total.cachedInputTokens);
  const boundedCachedFromTotal = Math.min(cachedFromTotal, totalTokens);
  const displayTokens = options.excludeCache
    ? Math.max(totalTokens - boundedCachedFromTotal, 0)
    : totalTokens;
  if (displayTokens <= 0) {
    return ZERO_SUMMARY;
  }

  const pricing = resolveModelPricing(modelId);
  if (!pricing) {
    return {
      knownUsd: 0,
      unknownTokens: displayTokens,
      totalTokens: displayTokens,
    };
  }

  const inputTokens = coerceTokenCount(usage?.total.inputTokens);
  const cachedInputTokens = Math.min(
    coerceTokenCount(usage?.total.cachedInputTokens),
    inputTokens,
  );
  const outputTokens = coerceTokenCount(usage?.total.outputTokens);

  const nonCachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  const billableCachedInputTokens = options.excludeCache ? 0 : cachedInputTokens;

  if (
    nonCachedInputTokens <= 0 &&
    billableCachedInputTokens <= 0 &&
    outputTokens <= 0
  ) {
    return {
      knownUsd: 0,
      unknownTokens: displayTokens,
      totalTokens: displayTokens,
    };
  }

  const knownUsd =
    (nonCachedInputTokens * pricing.inputUsdPerMillion +
      billableCachedInputTokens * pricing.cachedInputUsdPerMillion +
      outputTokens * pricing.outputUsdPerMillion) /
    TOKENS_PER_MILLION;

  return {
    knownUsd,
    unknownTokens: 0,
    totalTokens: displayTokens,
  };
}

export function mergeUsageCostSummaries(summaries: UsageCostSummary[]): UsageCostSummary {
  return summaries.reduce<UsageCostSummary>(
    (merged, summary) => ({
      knownUsd: merged.knownUsd + (summary.knownUsd || 0),
      unknownTokens: merged.unknownTokens + (summary.unknownTokens || 0),
      totalTokens: merged.totalTokens + (summary.totalTokens || 0),
    }),
    ZERO_SUMMARY,
  );
}

function formatCompactUsd(value: number): string {
  if (value < 0.01) {
    return "~<$0.01";
  }
  if (value >= 1000) {
    const compact = new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
    return `~$${compact}`;
  }
  return `~$${value.toFixed(2)}`;
}

function formatFullUsd(value: number): string {
  if (value < 0.01) {
    return "~<$0.01";
  }
  const fractionDigits = value < 1 ? 4 : value < 10 ? 3 : 2;
  return `~$${value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatUsageCostLabel(
  summary: UsageCostSummary,
  compact: boolean,
): string | null {
  if (summary.totalTokens <= 0) {
    return null;
  }
  if (summary.knownUsd <= 0) {
    return summary.unknownTokens > 0 ? "est n/a" : null;
  }
  const formatted = compact
    ? formatCompactUsd(summary.knownUsd)
    : formatFullUsd(summary.knownUsd);
  if (summary.unknownTokens > 0) {
    return `${formatted} (partial)`;
  }
  return formatted;
}
