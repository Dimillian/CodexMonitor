import { describe, expect, it } from "vitest";
import { formatCompactTokenCount } from "./tokenUsage";

describe("formatCompactTokenCount", () => {
  it("returns null for non-positive values", () => {
    expect(formatCompactTokenCount(0)).toBeNull();
    expect(formatCompactTokenCount(-1)).toBeNull();
  });

  it("formats small values without unit suffixes", () => {
    expect(formatCompactTokenCount(12)).toBe("12");
    expect(formatCompactTokenCount(999)).toBe("999");
  });

  it("formats thousands, millions, and billions compactly", () => {
    expect(formatCompactTokenCount(1_200)).toBe("1.2K");
    expect(formatCompactTokenCount(2_300_000)).toBe("2.3M");
    expect(formatCompactTokenCount(4_100_000_000)).toBe("4.1B");
  });

  it("promotes boundary-rounded values to the next unit", () => {
    expect(formatCompactTokenCount(999_950)).toBe("1.0M");
    expect(formatCompactTokenCount(999_950_000)).toBe("1.0B");
  });
});
