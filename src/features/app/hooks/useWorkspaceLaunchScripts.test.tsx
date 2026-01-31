// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionState } from "../../terminal/hooks/useTerminalSession";
import type { LaunchScriptEntry, WorkspaceInfo } from "../../../types";
import { writeTerminalSession } from "../../../services/tauri";
import { useWorkspaceLaunchScripts } from "./useWorkspaceLaunchScripts";

vi.mock("../../../services/tauri", () => ({
  writeTerminalSession: vi.fn(),
}));

const baseWorkspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const terminalState: TerminalSessionState = {
  status: "ready",
  message: "",
  containerRef: { current: null },
  hasSession: false,
  readyKey: null,
  cleanupTerminalSession: vi.fn(),
};

describe("useWorkspaceLaunchScripts", () => {
  it("opens the editor when script is empty", () => {
    const scripts: LaunchScriptEntry[] = [
      { id: "one", script: "", icon: "play", label: null },
    ];
    const workspace: WorkspaceInfo = {
      ...baseWorkspace,
      settings: { ...baseWorkspace.settings, launchScripts: scripts },
    };

    const { result } = renderHook(() =>
      useWorkspaceLaunchScripts({
        activeWorkspace: workspace,
        updateWorkspaceSettings: vi.fn(),
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(),
        restartLaunchSession: vi.fn(),
        terminalState,
        activeTerminalId: null,
      }),
    );

    act(() => {
      result.current.onRunScript("one");
    });

    expect(result.current.editorOpenId).toBe("one");
  });

  it("runs the script when terminal session is ready", async () => {
    const writeTerminalSessionMock = vi.mocked(writeTerminalSession);
    writeTerminalSessionMock.mockResolvedValue(undefined);
    const scripts: LaunchScriptEntry[] = [
      { id: "one", script: "npm run dev", icon: "play", label: null },
    ];
    const workspace: WorkspaceInfo = {
      ...baseWorkspace,
      settings: { ...baseWorkspace.settings, launchScripts: scripts },
    };
    const updateWorkspaceSettings = vi.fn();
    const openTerminal = vi.fn();
    const ensureLaunchTerminal = vi.fn(() => "launch-one");
    const restartLaunchSession = vi.fn().mockResolvedValue(undefined);

    type HookProps = {
      activeWorkspace: WorkspaceInfo;
      terminalState: TerminalSessionState;
      activeTerminalId: string | null;
    };

    const initialProps: HookProps = {
      activeWorkspace: workspace,
      terminalState,
      activeTerminalId: null,
    };

    const { result, rerender } = renderHook(
      (props: HookProps) =>
        useWorkspaceLaunchScripts({
          activeWorkspace: props.activeWorkspace,
          updateWorkspaceSettings,
          openTerminal,
          ensureLaunchTerminal,
          restartLaunchSession,
          terminalState: props.terminalState,
          activeTerminalId: props.activeTerminalId,
        }),
      { initialProps },
    );

    await act(async () => {
      result.current.onRunScript("one");
      await Promise.resolve();
    });

    expect(openTerminal).toHaveBeenCalled();
    expect(ensureLaunchTerminal).toHaveBeenCalledWith(
      "workspace-1",
      scripts[0],
      "Launch: Play",
    );
    expect(restartLaunchSession).toHaveBeenCalledWith("workspace-1", "launch-one");

    rerender({
      activeWorkspace: workspace,
      terminalState: { ...terminalState, hasSession: true, readyKey: "workspace-1:launch-one" },
      activeTerminalId: "launch-one",
    });

    await waitFor(() => {
      expect(writeTerminalSession).toHaveBeenCalledWith(
        "workspace-1",
        "launch-one",
        "npm run dev\n",
      );
    });
  });
});
