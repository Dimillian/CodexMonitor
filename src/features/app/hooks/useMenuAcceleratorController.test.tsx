// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, DebugEntry } from "../../../types";
import { useMenuAcceleratorController } from "./useMenuAcceleratorController";

const useMenuAcceleratorsMock = vi.fn();

vi.mock("./useMenuAccelerators", () => ({
  useMenuAccelerators: (options: unknown) => {
    useMenuAcceleratorsMock(options);
  },
}));

function buildAppSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    composerModelShortcut: "cmd+shift+m",
    composerReasoningShortcut: "cmd+shift+r",
    composerCollaborationShortcut: "shift+tab",
    collaborationModesEnabled: true,
    newAgentShortcut: "cmd+n",
    newWorktreeAgentShortcut: "cmd+shift+n",
    newCloneAgentShortcut: "cmd+alt+n",
    toggleProjectsSidebarShortcut: "cmd+shift+p",
    toggleGitSidebarShortcut: "cmd+shift+g",
    branchSwitcherShortcut: "cmd+b",
    toggleDebugPanelShortcut: "cmd+shift+d",
    toggleTerminalShortcut: "cmd+shift+t",
    cycleAgentNextShortcut: "ctrl+tab",
    cycleAgentPrevShortcut: "ctrl+shift+tab",
    cycleWorkspaceNextShortcut: "alt+tab",
    cycleWorkspacePrevShortcut: "alt+shift+tab",
    ...overrides,
  } as AppSettings;
}

describe("useMenuAcceleratorController", () => {
  beforeEach(() => {
    useMenuAcceleratorsMock.mockReset();
  });

  it("publishes menu accelerators without deprecated access shortcut", () => {
    const onDebug = vi.fn<(entry: DebugEntry) => void>();

    renderHook(() =>
      useMenuAcceleratorController({
        appSettings: buildAppSettings(),
        onDebug,
      }),
    );

    expect(useMenuAcceleratorsMock).toHaveBeenCalledTimes(1);
    const options = useMenuAcceleratorsMock.mock.calls[0]?.[0] as {
      accelerators: Array<{ id: string; shortcut: string | null | undefined }>;
    };
    const ids = options.accelerators.map((entry) => entry.id);
    expect(ids.includes("composer_cycle_model")).toBe(true);
    expect(ids.includes("composer_cycle_reasoning")).toBe(true);
    expect(ids.includes("composer_cycle_collaboration")).toBe(true);
    expect(ids.includes("view_branch_switcher")).toBe(true);
    expect(ids.includes("composer_cycle_access")).toBe(false);
  });

  it("disables collaboration shortcut mapping when collaboration mode is disabled", () => {
    const onDebug = vi.fn<(entry: DebugEntry) => void>();

    renderHook(() =>
      useMenuAcceleratorController({
        appSettings: buildAppSettings({ collaborationModesEnabled: false }),
        onDebug,
      }),
    );

    const options = useMenuAcceleratorsMock.mock.calls[0]?.[0] as {
      accelerators: Array<{ id: string; shortcut: string | null | undefined }>;
    };
    const collaboration = options.accelerators.find(
      (entry) => entry.id === "composer_cycle_collaboration",
    );
    if (collaboration) {
      expect(collaboration.shortcut).toBe(null);
    } else {
      expect(
        options.accelerators.some((entry) => entry.id === "composer_cycle_collaboration"),
      ).toBe(false);
    }
  });

  it("reports accelerator update errors through debug entries", () => {
    useMenuAcceleratorsMock.mockImplementationOnce((options: { onError?: (error: unknown) => void }) => {
      options.onError?.(new Error("accelerator update failed"));
    });
    const onDebug = vi.fn<(entry: DebugEntry) => void>();

    renderHook(() =>
      useMenuAcceleratorController({
        appSettings: buildAppSettings(),
        onDebug,
      }),
    );

    expect(onDebug).toHaveBeenCalledTimes(1);
    const entry = onDebug.mock.calls[0]?.[0];
    expect(entry?.label).toBe("menu/accelerator-error");
    expect(String(entry?.payload ?? "")).toContain("accelerator update failed");
  });
});
