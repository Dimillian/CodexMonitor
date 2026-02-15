import { describe, expect, it } from "vitest";
import { normalizeCodexArgsInput } from "./codexArgsInput";

describe("normalizeCodexArgsInput", () => {
  it("normalizes smart punctuation and strips whole-string quotes", () => {
    expect(normalizeCodexArgsInput("“—search —enable memory_tool”")).toBe(
      "--search --enable memory_tool",
    );
  });

  it("returns null for empty/whitespace values", () => {
    expect(normalizeCodexArgsInput("   ")).toBeNull();
  });

  it("keeps already-valid args unchanged", () => {
    expect(normalizeCodexArgsInput('--profile dev --config "path with spaces.toml"')).toBe(
      '--profile dev --config "path with spaces.toml"',
    );
  });
});
