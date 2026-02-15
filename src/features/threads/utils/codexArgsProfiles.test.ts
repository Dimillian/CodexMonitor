import { describe, expect, it } from "vitest";
import {
  buildCodexArgsOptions,
  buildCodexArgsBadgeLabel,
  buildEffectiveCodexArgsBadgeLabel,
  buildCodexArgsOptionLabel,
  getIgnoredCodexArgsFlagsMetadata,
  parseCodexArgsProfile,
  sanitizeRuntimeCodexArgs,
} from "./codexArgsProfiles";

describe("codexArgsProfiles", () => {
  it("parses recognized flags including quoted values and --flag=value", () => {
    const parsed = parseCodexArgsProfile(
      '--profile="dev profile" --config=model=o3 --search --add-dir "workspace dir"',
    );

    expect(parsed.recognizedSegments.map((segment) => segment.label)).toEqual([
      "profile:dev profile",
      "config:model=o3",
      "search",
      "add-dir:workspace dir",
    ]);
    expect(parsed.effectiveArgs).toBe(
      '--profile "dev profile" --config=model=o3 --search --add-dir "workspace dir"',
    );
  });

  it("strips ignored flags from effective runtime args and exposes ignored metadata", () => {
    const args =
      "--profile dev --model gpt-5 --sandbox danger-full-access --disable telemetry --full-auto";

    expect(sanitizeRuntimeCodexArgs(args)).toBe("--profile dev --disable telemetry");
    expect(getIgnoredCodexArgsFlagsMetadata(args)).toEqual({
      hasIgnoredFlags: true,
      ignoredFlags: [
        { flag: "--model", canonicalFlag: "--model", value: "gpt-5" },
        {
          flag: "--sandbox",
          canonicalFlag: "--sandbox",
          value: "danger-full-access",
        },
        { flag: "--full-auto", canonicalFlag: "--full-auto", value: null },
      ],
      ignoredCanonicalFlags: ["--model", "--sandbox", "--full-auto"],
    });
  });

  it("builds composite option labels from recognized segments", () => {
    expect(
      buildCodexArgsOptionLabel("--profile dev --auth-file auth.json --enable snapshots"),
    ).toBe("profile:dev • auth-file:auth.json +1");
  });

  it("builds badge labels from only the first recognized segment", () => {
    expect(
      buildCodexArgsBadgeLabel("--profile dev --auth-file auth.json --enable snapshots"),
    ).toBe("profile:dev");
  });

  it("skips valueless recognized flags and continues parsing later valid segments", () => {
    const parsed = parseCodexArgsProfile("--enable --profile dev");

    expect(parsed.recognizedSegments.map((segment) => segment.label)).toEqual([
      "profile:dev",
    ]);
    expect(parsed.effectiveArgs).toBe("--profile dev");
  });

  it("returns empty effective override when args only contain ignored flags", () => {
    expect(
      sanitizeRuntimeCodexArgs("--model gpt-5 --full-auto --no-alt-screen --sandbox workspace-write"),
    ).toBeNull();
  });

  it("preserves backslashes in quoted values for recognized flags", () => {
    expect(sanitizeRuntimeCodexArgs('--auth-file "C:\\Users\\me\\auth.json"')).toBe(
      '--auth-file "C:\\\\Users\\\\me\\\\auth.json"',
    );
    expect(sanitizeRuntimeCodexArgs('--config "C:\\Program Files\\Codex\\config.toml"')).toBe(
      '--config "C:\\\\Program Files\\\\Codex\\\\config.toml"',
    );
  });

  it("keeps escaped active quotes inside quoted values", () => {
    expect(
      sanitizeRuntimeCodexArgs('--config "C:\\Program Files\\Codex\\the \\"best\\" config.toml"'),
    ).toBe('--config "C:\\\\Program Files\\\\Codex\\\\the \\"best\\" config.toml"');
  });

  it("includes active override in options even when not present in app/workspace settings", () => {
    const options = buildCodexArgsOptions({
      appCodexArgs: null,
      workspaceCodexArgs: [],
      additionalCodexArgs: ["--profile thread-active"],
    });

    expect(options.map((option) => option.value)).toEqual(["", "--profile thread-active"]);
  });

  it("returns null effective badge for ignored-only overrides", () => {
    expect(buildEffectiveCodexArgsBadgeLabel("--model gpt-5 --sandbox workspace-write")).toBeNull();
  });

  it("normalizes smart punctuation and unwraps full-string quotes", () => {
    expect(sanitizeRuntimeCodexArgs("“—search —enable memory_tool”")).toBe(
      "--search --enable memory_tool",
    );
  });
});
