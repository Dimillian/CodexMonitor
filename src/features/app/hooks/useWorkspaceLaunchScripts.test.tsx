// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionState } from "../../terminal/hooks/useTerminalSession";
import type { LaunchScriptEntry, LaunchScriptIconId, WorkspaceInfo } from "../../../types";
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

function makeWorkspace(launchScripts: LaunchScriptEntry[]): WorkspaceInfo {
  return {
    ...baseWorkspace,
    settings: { ...baseWorkspace.settings, launchScripts },
  };
}

function getUpdatedLaunchScripts(updateWorkspaceSettings: ReturnType<typeof vi.fn>) {
  const lastCall =
    updateWorkspaceSettings.mock.calls[updateWorkspaceSettings.mock.calls.length - 1];
  const [, settings] = lastCall ?? [];
  return (settings?.launchScripts ?? []) as LaunchScriptEntry[];
}

describe("useWorkspaceLaunchScripts", () => {
  it("opens the editor when script is empty", () => {
    const scripts: LaunchScriptEntry[] = [
      { id: "one", script: "", icon: "play", label: null },
    ];
    const workspace = makeWorkspace(scripts);

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
    const workspace = makeWorkspace(scripts);
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

  it("creates, edits, and deletes launch scripts", async () => {
    const workspace = makeWorkspace([]);
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(workspace);

    const { result } = renderHook(() =>
      useWorkspaceLaunchScripts({
        activeWorkspace: workspace,
        updateWorkspaceSettings,
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(() => "launch-one"),
        restartLaunchSession: vi.fn().mockResolvedValue(undefined),
        terminalState,
        activeTerminalId: null,
      }),
    );

    act(() => {
      result.current.onOpenNew();
      result.current.onNewDraftScriptChange("npm run dev");
      result.current.onNewDraftIconChange("server");
      result.current.onNewDraftLabelChange("Dev server");
    });

    await act(async () => {
      await result.current.onCreateNew();
    });

    const createdScripts = getUpdatedLaunchScripts(updateWorkspaceSettings);
    expect(createdScripts).toHaveLength(1);
    expect(createdScripts[0]).toEqual(
      expect.objectContaining({
        script: "npm run dev",
        icon: "server",
        label: "Dev server",
      }),
    );

    const createdId = createdScripts[0].id;
    const workspaceWithCreated = makeWorkspace(createdScripts);
    updateWorkspaceSettings.mockClear();
    updateWorkspaceSettings.mockResolvedValue(workspaceWithCreated);

    const { result: editResult } = renderHook(() =>
      useWorkspaceLaunchScripts({
        activeWorkspace: workspaceWithCreated,
        updateWorkspaceSettings,
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(() => "launch-one"),
        restartLaunchSession: vi.fn().mockResolvedValue(undefined),
        terminalState,
        activeTerminalId: null,
      }),
    );

    act(() => {
      editResult.current.onOpenEditor(createdId);
      editResult.current.onDraftScriptChange("npm run build");
      editResult.current.onDraftIconChange("build");
      editResult.current.onDraftLabelChange("Build");
    });

    await act(async () => {
      await editResult.current.onSaveScript();
    });

    const editedScripts = getUpdatedLaunchScripts(updateWorkspaceSettings);
    expect(editedScripts).toHaveLength(1);
    expect(editedScripts[0]).toEqual(
      expect.objectContaining({
        id: createdId,
        script: "npm run build",
        icon: "build",
        label: "Build",
      }),
    );

    const workspaceWithEdited = makeWorkspace(editedScripts);
    updateWorkspaceSettings.mockClear();
    updateWorkspaceSettings.mockResolvedValue(workspaceWithEdited);

    const { result: deleteResult } = renderHook(() =>
      useWorkspaceLaunchScripts({
        activeWorkspace: workspaceWithEdited,
        updateWorkspaceSettings,
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(() => "launch-one"),
        restartLaunchSession: vi.fn().mockResolvedValue(undefined),
        terminalState,
        activeTerminalId: null,
      }),
    );

    await act(async () => {
      deleteResult.current.onOpenEditor(createdId);
      await deleteResult.current.onDeleteScript();
    });

    const deletedScripts = getUpdatedLaunchScripts(updateWorkspaceSettings);
    expect(deletedScripts).toHaveLength(0);
  });

  it("coerces invalid icon ids to the default", () => {
    const invalidIcon = "not-a-real-icon" as unknown as LaunchScriptIconId;
    const scripts: LaunchScriptEntry[] = [
      { id: "one", script: "npm run dev", icon: invalidIcon, label: null },
    ];
    const workspace = makeWorkspace(scripts);

    const { result } = renderHook(() =>
      useWorkspaceLaunchScripts({
        activeWorkspace: workspace,
        updateWorkspaceSettings: vi.fn(),
        openTerminal: vi.fn(),
        ensureLaunchTerminal: vi.fn(() => "launch-one"),
        restartLaunchSession: vi.fn().mockResolvedValue(undefined),
        terminalState,
        activeTerminalId: null,
      }),
    );

    expect(result.current.launchScripts[0].icon).toBe("play");

    act(() => {
      result.current.onOpenEditor("one");
    });

    expect(result.current.draftIcon).toBe("play");
  });
});
