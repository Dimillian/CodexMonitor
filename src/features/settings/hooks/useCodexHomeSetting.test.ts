// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexHomeStatus } from "@/types";
import { getCodexHome, validateCodexHome } from "@services/tauri";
import { useCodexHomeSetting } from "./useCodexHomeSetting";

vi.mock("@services/tauri", () => ({ getCodexHome: vi.fn(), validateCodexHome: vi.fn() }));

const selected: CodexHomeStatus = {
  configuredPath: "/Users/me/.codex-alternative",
  effectivePath: "/Volumes/External/codex-alternative",
  source: "application",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCodexHome).mockResolvedValue(selected);
});
afterEach(cleanup);

describe("useCodexHomeSetting", () => {
  it("keeps the configured symlink separate from its canonical effective home", async () => {
    const { result } = renderHook(() => useCodexHomeSetting(selected.configuredPath));
    await waitFor(() => expect(result.current.effectiveHome).toEqual(selected));
    expect(result.current.draft).toBe(selected.configuredPath);
  });

  it("validates a trimmed manual selection without changing the active home", async () => {
    vi.mocked(validateCodexHome).mockResolvedValue(selected);
    const { result } = renderHook(() => useCodexHomeSetting(null));
    await waitFor(() => expect(result.current.effectiveHome).not.toBeNull());
    act(() => result.current.updateDraft("  /Users/me/.codex-alternative  "));
    await act(async () => { await result.current.validate(); });
    expect(validateCodexHome).toHaveBeenCalledWith("/Users/me/.codex-alternative");
    expect(result.current.validatedHome?.effectivePath).toBe(selected.effectivePath);
    expect(result.current.effectiveHome).toEqual(selected);
  });

  it("restores default resolution by validating null, rather than inventing a home", async () => {
    const inherited: CodexHomeStatus = {
      configuredPath: null, effectivePath: "/inherited/home", source: "environment",
    };
    vi.mocked(validateCodexHome).mockResolvedValue(inherited);
    const { result } = renderHook(() => useCodexHomeSetting(selected.configuredPath));
    act(() => result.current.updateDraft(""));
    await act(async () => { await result.current.validate(); });
    expect(validateCodexHome).toHaveBeenCalledWith(null);
    expect(result.current.validatedHome).toEqual(inherited);
  });

  it("reports an unavailable explicit home without displaying a default path", async () => {
    vi.mocked(getCodexHome).mockRejectedValue(new Error("Configured Codex Home is unavailable: /missing"));
    const { result } = renderHook(() => useCodexHomeSetting("/missing"));
    await waitFor(() => expect(result.current.error).toContain("unavailable"));
    expect(result.current.effectiveHome).toBeNull();
    expect(result.current.draft).toBe("/missing");
  });

  it("ignores validation completed after the draft changes", async () => {
    let resolve!: (value: CodexHomeStatus) => void;
    vi.mocked(validateCodexHome).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useCodexHomeSetting(null));
    let pending!: Promise<CodexHomeStatus | null>;
    act(() => { pending = result.current.validate(); });
    act(() => result.current.updateDraft("/other/home"));
    await act(async () => { resolve(selected); await pending; });
    expect(result.current.validatedHome).toBeNull();
    expect(result.current.validating).toBe(false);
  });

  it("keeps failed validation from producing a usable selection", async () => {
    vi.mocked(validateCodexHome).mockRejectedValue(new Error("Selected home is inaccessible"));
    const { result } = renderHook(() => useCodexHomeSetting(null));
    await act(async () => { expect(await result.current.validate()).toBeNull(); });
    expect(result.current.error).toContain("inaccessible");
    expect(result.current.validatedHome).toBeNull();
  });
});
