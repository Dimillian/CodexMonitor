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

  it("strips Windows namespace prefixes from drive-letter paths", () => {
    expect(normalizeRootPath("\\\\?\\C:\\Dev\\Repo\\")).toBe("c:/dev/repo");
    expect(normalizeRootPath("\\\\.\\C:\\Dev\\Repo\\")).toBe("c:/dev/repo");
  });

  it("strips Windows namespace prefixes from UNC paths", () => {
    expect(normalizeRootPath("\\\\?\\UNC\\SERVER\\Share\\Repo\\")).toBe(
      "//server/share/repo",
    );
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

  it("infers credits availability from a balance when hasCredits is omitted", () => {
    const normalized = normalizeRateLimits({
      credits: {
        balance: "120",
      },
    });

    expect(normalized.credits).toEqual({
      hasCredits: true,
      unlimited: false,
      balance: "120",
    });
  });

  it("keeps credit balances visible when unlimited is explicitly false", () => {
    const normalized = normalizeRateLimits({
      credits: {
        unlimited: false,
        balance: "120",
      },
    });

    expect(normalized.credits).toEqual({
      hasCredits: true,
      unlimited: false,
      balance: "120",
    });
  });

  it("does not infer available credits from a zero balance", () => {
    const normalized = normalizeRateLimits({
      credits: {
        balance: "0",
      },
    });

    expect(normalized.credits).toEqual({
      hasCredits: false,
      unlimited: false,
      balance: "0",
    });
  });

  it("clears previous credit availability when a partial update sets balance to zero", () => {
    const previous = {
      primary: null,
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "120",
      },
      planType: null,
    } as const;

    const normalized = normalizeRateLimits(
      {
        credits: {
          balance: "0",
        },
      },
      previous,
    );

    expect(normalized.credits).toEqual({
      hasCredits: false,
      unlimited: false,
      balance: "0",
    });
  });

  it("clears previous credit availability when a partial update nulls the balance", () => {
    const previous = {
      primary: null,
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "120",
      },
      planType: null,
    } as const;

    const normalized = normalizeRateLimits(
      {
        credits: {
          balance: null,
        },
      },
      previous,
    );

    expect(normalized.credits).toEqual({
      hasCredits: false,
      unlimited: false,
      balance: null,
    });
  });

  it.each([{ balance: "0" }, { balance: null }])(
    "preserves unlimited credits when a partial update only changes balance to $balance",
    (credits) => {
      const previous = {
        primary: null,
        secondary: null,
        credits: {
          hasCredits: true,
          unlimited: true,
          balance: "120",
        },
        planType: null,
      } as const;

      const normalized = normalizeRateLimits(
        {
          credits,
        },
        previous,
      );

      expect(normalized.credits).toEqual({
        hasCredits: true,
        unlimited: true,
        balance: credits.balance,
      });
    },
  );

  it("normalizes numeric credit balances", () => {
    const normalized = normalizeRateLimits({
      credits: {
        balance: 75,
      },
    });

    expect(normalized.credits).toEqual({
      hasCredits: true,
      unlimited: false,
      balance: "75",
    });
  });

  it("keeps the previous credits snapshot when the incoming balance is NaN", () => {
    const previous = {
      primary: null,
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "120",
      },
      planType: null,
    } as const;

    const normalized = normalizeRateLimits(
      {
        credits: {
          balance: Number.NaN,
        },
      },
      previous,
    );

    expect(normalized.credits).toEqual(previous.credits);
  });
});
