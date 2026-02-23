import { describe, expect, it } from "vitest";
import {
  normalizePlanUpdate,
  normalizeRateLimits,
  normalizeRootPath,
} from "./threadNormalize";

describe("normalizePlanUpdate", () => {
  it("normalizes a plan when the payload uses an array", () => {
    expect(
      normalizePlanUpdate("turn-1", " Note ", [{ step: "Do it", status: "in_progress" }]),
    ).toEqual({
      turnId: "turn-1",
      explanation: "Note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });
  });

  it("normalizes a plan when the payload uses an object with steps", () => {
    expect(
      normalizePlanUpdate("turn-2", null, {
        explanation: "Hello",
        steps: [{ step: "Ship it", status: "completed" }],
      }),
    ).toEqual({
      turnId: "turn-2",
      explanation: "Hello",
      steps: [{ step: "Ship it", status: "completed" }],
    });
  });

  it("returns null when there is no explanation or steps", () => {
    expect(normalizePlanUpdate("turn-3", "", { steps: [] })).toBeNull();
  });
});

describe("normalizeRootPath", () => {
  it("preserves significant leading and trailing whitespace", () => {
    expect(normalizeRootPath(" /tmp/repo ")).toBe(" /tmp/repo ");
  });

  it("normalizes Windows drive-letter paths case-insensitively", () => {
    expect(normalizeRootPath("C:\\Dev\\Repo\\")).toBe("c:/dev/repo");
    expect(normalizeRootPath("c:/Dev/Repo")).toBe("c:/dev/repo");
  });

  it("normalizes UNC paths case-insensitively", () => {
    expect(normalizeRootPath("\\\\SERVER\\Share\\Repo\\")).toBe("//server/share/repo");
  });
});

describe("normalizeRateLimits", () => {
  it("preserves previous usage when incoming payload omits usage percent", () => {
    const previous = {
      primary: {
        usedPercent: 22,
        windowDurationMins: 60,
        resetsAt: 1_700_000_000,
      },
      secondary: {
        usedPercent: 64,
        windowDurationMins: 10_080,
        resetsAt: 1_700_000_500,
      },
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "120",
      },
      planType: "pro",
    } as const;

    const normalized = normalizeRateLimits(
      {
        primary: { resets_at: 1_700_000_777 },
        secondary: {},
        credits: { balance: "110" },
      },
      previous,
    );

    expect(normalized).toEqual({
      primary: {
        usedPercent: 22,
        windowDurationMins: 60,
        resetsAt: 1_700_000_777,
      },
      secondary: {
        usedPercent: 64,
        windowDurationMins: 10_080,
        resetsAt: 1_700_000_500,
      },
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "110",
      },
      planType: "pro",
    });
  });

  it("does not fabricate usage percent when none exists", () => {
    const normalized = normalizeRateLimits({
      primary: {
        resets_at: 1_700_000_999,
      },
    });

    expect(normalized.primary).toBeNull();
    expect(normalized.secondary).toBeNull();
  });

  it("normalizes remaining-style percent fields", () => {
    const normalized = normalizeRateLimits({
      primary: {
        remaining_percent: 20,
        window_duration_mins: 60,
      },
      secondary: {
        remainingPercent: "40",
        windowDurationMins: 10_080,
      },
    });

    expect(normalized.primary?.usedPercent).toBe(80);
    expect(normalized.primary?.windowDurationMins).toBe(60);
    expect(normalized.secondary?.usedPercent).toBe(60);
    expect(normalized.secondary?.windowDurationMins).toBe(10_080);
  });
});
