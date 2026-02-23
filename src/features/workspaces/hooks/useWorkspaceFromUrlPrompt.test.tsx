// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceFromUrlPrompt } from "./useWorkspaceFromUrlPrompt";

describe("useWorkspaceFromUrlPrompt", () => {
  it("uses injected directory picker when selecting destination path", async () => {
    const pickDirectoryPath = vi.fn(async () => "/srv/repos");

    const { result } = renderHook(() =>
      useWorkspaceFromUrlPrompt({
        onSubmit: vi.fn(async () => {}),
        pickDirectoryPath,
      }),
    );

    act(() => {
      result.current.openWorkspaceFromUrlPrompt();
    });

    await act(async () => {
      await result.current.chooseWorkspaceFromUrlDestinationPath();
    });

    expect(pickDirectoryPath).toHaveBeenCalledTimes(1);
    expect(result.current.workspaceFromUrlPrompt?.destinationPath).toBe("/srv/repos");
  });
});
