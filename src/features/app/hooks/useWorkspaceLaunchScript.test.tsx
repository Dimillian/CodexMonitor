// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionState } from "../../terminal/hooks/useTerminalSession";
import type { WorkspaceInfo } from "../../../types";
import { writeTerminalSession } from "../../../services/tauri";
import { useWorkspaceLaunchScript } from "./useWorkspaceLaunchScript";

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

describe("useWorkspaceLaunchScript", () => {
  it("opens the editor when no launch script is set", () => {
    const { result } = renderHook(() =>
      useWorkspaceLaunchScript({
        activeWorkspace: baseWorkspace,
        updateWorkspaceSettings: vi.fn(),
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(),
        restartLaunchSession: vi.fn(),
        terminalState,
        activeTerminalId: null,
      }),
    );

    act(() => {
      result.current.onRunLaunchScript();
    });

    expect(result.current.editorOpen).toBe(true);
  });

  it("runs the launch script when a terminal session is ready", async () => {
    const writeTerminalSessionMock = vi.mocked(writeTerminalSession);
    writeTerminalSessionMock.mockResolvedValue(undefined);
    const workspaceWithScript: WorkspaceInfo = {
      ...baseWorkspace,
      settings: { ...baseWorkspace.settings, launchScript: "npm run dev" },
    };
    const updateWorkspaceSettings = vi.fn();
    const openTerminal = vi.fn();
    const ensureLaunchTerminal = vi.fn(() => "launch");
    const restartLaunchSession = vi.fn().mockResolvedValue(undefined);
    type HookProps = {
      activeWorkspace: WorkspaceInfo;
      terminalState: TerminalSessionState;
      activeTerminalId: string | null;
    };
    const initialProps: HookProps = {
      activeWorkspace: workspaceWithScript,
      terminalState,
      activeTerminalId: null,
    };

    const { result, rerender } = renderHook(
      (props: HookProps) =>
        useWorkspaceLaunchScript({
          activeWorkspace: props.activeWorkspace,
          updateWorkspaceSettings,
          openTerminal,
          ensureLaunchTerminal,
          restartLaunchSession,
          terminalState: props.terminalState,
          activeTerminalId: props.activeTerminalId,
        }),
      {
        initialProps,
      },
    );

    await act(async () => {
      result.current.onRunLaunchScript();
      await Promise.resolve();
    });

    expect(openTerminal).toHaveBeenCalled();
    expect(ensureLaunchTerminal).toHaveBeenCalledWith("workspace-1");
    expect(restartLaunchSession).toHaveBeenCalledWith("workspace-1", "launch");

    rerender({
      activeWorkspace: workspaceWithScript,
      terminalState: { ...terminalState, hasSession: true, readyKey: "workspace-1:launch" },
      activeTerminalId: "launch",
    });

    await waitFor(() => {
      expect(writeTerminalSession).toHaveBeenCalledWith(
        "workspace-1",
        "launch",
        "npm run dev\n",
      );
    });
  });
});
