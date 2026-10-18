// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readGlobalAgentsMd, readGlobalCodexConfigToml,
  writeGlobalAgentsMd, writeGlobalCodexConfigToml,
} from "@services/tauri";
import { useGlobalAgentsMd } from "./useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "./useGlobalCodexConfigToml";

vi.mock("@services/tauri", () => ({
  readGlobalAgentsMd: vi.fn(), readGlobalCodexConfigToml: vi.fn(),
  writeGlobalAgentsMd: vi.fn(), writeGlobalCodexConfigToml: vi.fn(),
}));
vi.mock("@services/toasts", () => ({ pushErrorToast: vi.fn() }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

for (const [name, useEditor, read, write] of [
  ["config.toml", useGlobalCodexConfigToml, readGlobalCodexConfigToml, writeGlobalCodexConfigToml],
  ["AGENTS.md", useGlobalAgentsMd, readGlobalAgentsMd, writeGlobalAgentsMd],
] as const) {
  describe(`${name} home isolation`, () => {
    it("discards old drafts and reloads when the selected home changes", async () => {
      vi.mocked(read)
        .mockResolvedValueOnce({ exists: true, content: "first environment", truncated: false })
        .mockResolvedValueOnce({ exists: true, content: "second environment", truncated: false });
      const { result, rerender } = renderHook(({ home }) => useEditor(home), { initialProps: { home: "/first" } });
      await waitFor(() => expect(result.current.content).toBe("first environment"));
      act(() => result.current.setContent("unsaved first-environment draft"));
      rerender({ home: "/second" });
      await waitFor(() => expect(result.current.content).toBe("second environment"));
      expect(result.current.isDirty).toBe(false);
      expect(write).not.toHaveBeenCalled();
    });
  });
}
