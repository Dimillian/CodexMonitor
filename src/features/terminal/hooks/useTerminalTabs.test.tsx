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

describe("useTerminalTabs auto-named tabs", () => {
  it("renumbers remaining auto-named tabs after closing one", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    let firstId = "";
    let secondId = "";
    act(() => {
      firstId = result.current.createTerminal("workspace-1");
      secondId = result.current.createTerminal("workspace-1");
    });

    act(() => {
      result.current.closeTerminal("workspace-1", firstId);
    });

    expect(result.current.terminals).toEqual([
      { id: secondId, title: "Terminal 1" },
    ]);
  });

  it("does not create duplicate auto-named labels after close and create", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    let firstId = "";
    let secondId = "";
    let thirdId = "";
    act(() => {
      firstId = result.current.createTerminal("workspace-1");
      secondId = result.current.createTerminal("workspace-1");
    });

    act(() => {
      result.current.closeTerminal("workspace-1", firstId);
    });

    act(() => {
      thirdId = result.current.createTerminal("workspace-1");
    });

    expect(result.current.terminals).toEqual([
      { id: secondId, title: "Terminal 1" },
      { id: thirdId, title: "Terminal 2" },
    ]);
  });

  it("keeps custom titles while numbering auto-named tabs independently", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    let firstAutoId = "";
    let secondAutoId = "";
    act(() => {
      result.current.ensureTerminalWithTitle("workspace-1", "launch", "Launch");
      firstAutoId = result.current.createTerminal("workspace-1");
      secondAutoId = result.current.createTerminal("workspace-1");
    });

    expect(result.current.terminals).toEqual([
      { id: "launch", title: "Launch" },
      { id: firstAutoId, title: "Terminal 1" },
      { id: secondAutoId, title: "Terminal 2" },
    ]);
  });

  it("converts an auto-named tab to custom and renumbers remaining auto tabs", () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ activeWorkspaceId: "workspace-1" }),
    );

    let firstAutoId = "";
    let secondAutoId = "";
    act(() => {
      firstAutoId = result.current.createTerminal("workspace-1");
      secondAutoId = result.current.createTerminal("workspace-1");
    });

    act(() => {
      result.current.ensureTerminalWithTitle("workspace-1", firstAutoId, "Launch");
    });

    expect(result.current.terminals).toEqual([
      { id: firstAutoId, title: "Launch" },
      { id: secondAutoId, title: "Terminal 1" },
    ]);
  });
});
