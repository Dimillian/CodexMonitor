import { describe, expect, it } from "vitest";
import { normalizeOpenCodeArgsInput } from "./opencodeArgsInput";

describe("normalizeOpenCodeArgsInput", () => {
  it("normalizes smart punctuation and strips whole-string quotes", () => {
    expect(normalizeOpenCodeArgsInput("“—search —enable memory_tool”")).toBe(
      "--search --enable memory_tool",
    );
  });

  it("returns null for empty/whitespace values", () => {
    expect(normalizeOpenCodeArgsInput("   ")).toBeNull();
  });

  it("keeps already-valid args unchanged", () => {
    expect(normalizeOpenCodeArgsInput('--profile dev --config "path with spaces.toml"')).toBe(
      '--profile dev --config "path with spaces.toml"',
    );
  });

  it("preserves long-flag equals forms when normalizing smart dashes", () => {
    expect(normalizeOpenCodeArgsInput("—profile=dev —enable=memory_tool —x=1")).toBe(
      "--profile=dev --enable=memory_tool -x=1",
    );
  });
});
