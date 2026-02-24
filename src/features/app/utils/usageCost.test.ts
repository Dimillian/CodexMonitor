import { describe, expect, it } from "vitest";
import type { ThreadTokenUsage } from "@/types";
import {
  estimateThreadUsageCost,
  formatUsageCostLabel,
  mergeUsageCostSummaries,
} from "./usageCost";

function makeUsage(
  values: Partial<ThreadTokenUsage["total"]>,
): ThreadTokenUsage {
  const total = {
    totalTokens: values.totalTokens ?? 0,
    inputTokens: values.inputTokens ?? 0,
    cachedInputTokens: values.cachedInputTokens ?? 0,
    outputTokens: values.outputTokens ?? 0,
    reasoningOutputTokens: values.reasoningOutputTokens ?? 0,
  };
  return {
    total,
    last: total,
    modelContextWindow: null,
  };
}

describe("estimateThreadUsageCost", () => {
  it("estimates known model cost with input/output/cache rates", () => {
    const usage = makeUsage({
      totalTokens: 1_500_000,
      inputTokens: 1_000_000,
      cachedInputTokens: 200_000,
      outputTokens: 500_000,
    });
    const summary = estimateThreadUsageCost(usage, "gpt-5-codex", {
      excludeCache: false,
    });

    expect(summary.knownUsd).toBeCloseTo(6.025, 6);
    expect(summary.unknownTokens).toBe(0);
    expect(summary.totalTokens).toBe(1_500_000);
    expect(formatUsageCostLabel(summary, true)).toBe("~$6.03");
    expect(formatUsageCostLabel(summary, false)).toBe("~$6.025");
  });

  it("excludes cached input cost when cache exclusion is enabled", () => {
    const usage = makeUsage({
      totalTokens: 1_500_000,
      inputTokens: 1_000_000,
      cachedInputTokens: 200_000,
      outputTokens: 500_000,
    });
    const summary = estimateThreadUsageCost(usage, "gpt-5-codex", {
      excludeCache: true,
    });

    expect(summary.knownUsd).toBeCloseTo(6, 6);
    expect(summary.unknownTokens).toBe(0);
    expect(summary.totalTokens).toBe(1_300_000);
    expect(formatUsageCostLabel(summary, true)).toBe("~$6.00");
  });

  it("returns unknown-only summary for models without pricing", () => {
    const usage = makeUsage({
      totalTokens: 30_000,
      inputTokens: 20_000,
      cachedInputTokens: 5_000,
      outputTokens: 10_000,
    });
    const summary = estimateThreadUsageCost(usage, "my-custom-model", {
      excludeCache: false,
    });

    expect(summary.knownUsd).toBe(0);
    expect(summary.unknownTokens).toBe(30_000);
    expect(summary.totalTokens).toBe(30_000);
    expect(formatUsageCostLabel(summary, true)).toBe("est n/a");
  });

  it("uses codex family fallback for versioned codex spark models", () => {
    const usage = makeUsage({
      totalTokens: 100_000,
      inputTokens: 60_000,
      cachedInputTokens: 10_000,
      outputTokens: 40_000,
    });
    const summary = estimateThreadUsageCost(usage, "gpt-5.3-codex-spark", {
      excludeCache: false,
    });

    expect(summary.knownUsd).toBeGreaterThan(0);
    expect(summary.unknownTokens).toBe(0);
    expect(formatUsageCostLabel(summary, true)).toMatch(/^~\$/);
  });

  it("supports dated model ids by stripping date suffixes", () => {
    const usage = makeUsage({
      totalTokens: 250_000,
      inputTokens: 150_000,
      cachedInputTokens: 50_000,
      outputTokens: 100_000,
    });
    const summary = estimateThreadUsageCost(usage, "gpt-5.1-codex-2026-02-01", {
      excludeCache: false,
    });

    expect(summary.knownUsd).toBeGreaterThan(0);
    expect(summary.unknownTokens).toBe(0);
    expect(formatUsageCostLabel(summary, false)).toMatch(/^~\$/);
  });
});

describe("mergeUsageCostSummaries", () => {
  it("marks merged output as partial when unknown-model tokens are present", () => {
    const known = estimateThreadUsageCost(
      makeUsage({
        totalTokens: 1_500_000,
        inputTokens: 1_000_000,
        cachedInputTokens: 200_000,
        outputTokens: 500_000,
      }),
      "gpt-5-codex",
      { excludeCache: false },
    );
    const unknown = estimateThreadUsageCost(
      makeUsage({
        totalTokens: 200_000,
        inputTokens: 100_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
      }),
      "unknown-model",
      { excludeCache: false },
    );
    const merged = mergeUsageCostSummaries([known, unknown]);

    expect(merged.knownUsd).toBeCloseTo(6.025, 6);
    expect(merged.unknownTokens).toBe(200_000);
    expect(merged.totalTokens).toBe(1_700_000);
    expect(formatUsageCostLabel(merged, true)).toBe("~$6.03 (partial)");
  });

  it("formats large known totals in compact currency notation", () => {
    const label = formatUsageCostLabel(
      { knownUsd: 12_345.67, unknownTokens: 0, totalTokens: 1 },
      true,
    );
    expect(label).toBe("~$12.3K");
  });
});
