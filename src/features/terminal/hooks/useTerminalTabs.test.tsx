// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTerminalTabs } from "./useTerminalTabs";

describe("useTerminalTabs.ensureTerminalWithTitle", () => {
  it("creates and activates a named terminal tab", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    act(() => {
      result.current.ensureTerminalWithTitle("workspace-1", "launch", "Launch");
    });

    expect(result.current.terminals).toEqual([{ id: "launch", title: "Launch" }]);
    expect(result.current.activeTerminalId).toBe("launch");
  });

  it("updates the title when the tab already exists", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    act(() => {
      result.current.ensureTerminalWithTitle("workspace-1", "launch", "Launch");
    });

    act(() => {
      result.current.ensureTerminalWithTitle("workspace-1", "launch", "Launch (dev)");
    });

    expect(result.current.terminals).toEqual([
      { id: "launch", title: "Launch (dev)" },
    ]);
  });
});
