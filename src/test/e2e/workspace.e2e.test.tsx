// @vitest-environment jsdom
/**
 * E2E Tests for Workspace Management
 *
 * Tests the complete user flows for workspace operations including:
 * - Loading and displaying workspaces
 * - Adding new workspaces
 * - Selecting workspaces
 * - Removing workspaces
 * - Workspace settings persistence
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  mockHandlers,
  mockState,
  setWorkspaces,
  setAppSettings,
  defaultAppSettings,
  resetMocks,
  invoke,
} from "./mocks/tauri.mock";
import type { WorkspaceInfo } from "../../types";

// Import hooks after mocking (mocks are set up in setup.ts)
import { useWorkspaceController } from "../../features/app/hooks/useWorkspaceController";

// Helper to create a mock workspace
function createMockWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Test Workspace",
    path: "/tmp/test-workspace",
    connected: false,
    settings: { sidebarCollapsed: false },
    ...overrides,
  };
}

describe("Workspace Management E2E", () => {
  beforeEach(() => {
    resetMocks();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Workspace Loading", () => {
    it("loads workspaces on initialization", async () => {
      const testWorkspaces = [
        createMockWorkspace({ id: "ws-1", name: "Project A", path: "/home/user/project-a" }),
        createMockWorkspace({ id: "ws-2", name: "Project B", path: "/home/user/project-b" }),
      ];
      setWorkspaces(testWorkspaces);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      expect(result.current.workspaces).toHaveLength(2);
      expect(result.current.workspaces[0].name).toBe("Project A");
      expect(result.current.workspaces[1].name).toBe("Project B");
    });

    it("handles empty workspace list", async () => {
      setWorkspaces([]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      expect(result.current.workspaces).toHaveLength(0);
    });

    it("handles workspace loading error gracefully", async () => {
      mockHandlers.list_workspaces.mockRejectedValueOnce(new Error("Failed to load workspaces"));

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      // Should still reach loaded state
      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });
    });
  });

  describe("Adding Workspaces", () => {
    it("adds a workspace from a path", async () => {
      setWorkspaces([]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.addWorkspaceFromPath("/home/user/new-project");
      });

      await waitFor(() => {
        expect(result.current.workspaces.length).toBeGreaterThan(0);
      });

      // Verify workspace was added
      const addedWorkspace = result.current.workspaces.find(
        (ws) => ws.path === "/home/user/new-project"
      );
      expect(addedWorkspace).toBeDefined();
    });

    it("calls add_workspace with correct path", async () => {
      setWorkspaces([]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.addWorkspaceFromPath("/home/user/test-project");
      });

      // Verify add_workspace was called with the correct path
      expect(mockHandlers.add_workspace).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/home/user/test-project",
        })
      );
    });
  });

  describe("Workspace Selection", () => {
    it("selects a workspace and updates active state", async () => {
      const testWorkspaces = [
        createMockWorkspace({ id: "ws-1", name: "Project A", path: "/home/user/project-a" }),
        createMockWorkspace({ id: "ws-2", name: "Project B", path: "/home/user/project-b" }),
      ];
      setWorkspaces(testWorkspaces);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      act(() => {
        result.current.setActiveWorkspaceId("ws-2");
      });

      expect(result.current.activeWorkspaceId).toBe("ws-2");
      expect(result.current.activeWorkspace?.name).toBe("Project B");
    });

    it("clears selection when selecting null", async () => {
      const testWorkspace = createMockWorkspace({ id: "ws-1", name: "Project A" });
      setWorkspaces([testWorkspace]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      act(() => {
        result.current.setActiveWorkspaceId("ws-1");
      });

      expect(result.current.activeWorkspaceId).toBe("ws-1");

      act(() => {
        result.current.setActiveWorkspaceId(null);
      });

      expect(result.current.activeWorkspaceId).toBeNull();
      expect(result.current.activeWorkspace).toBeNull();
    });
  });

  describe("Workspace Connection", () => {
    it("connects to a workspace", async () => {
      const testWorkspace = createMockWorkspace({
        id: "ws-1",
        name: "Project A",
        connected: false,
      });
      setWorkspaces([testWorkspace]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      const workspace = result.current.workspaces[0];
      expect(workspace.connected).toBe(false);

      await act(async () => {
        await result.current.connectWorkspace(workspace);
      });

      // Verify connect was called
      expect(mockHandlers.connect_workspace).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ws-1" })
      );
    });
  });

  describe("Workspace Removal", () => {
    it("removes a workspace", async () => {
      const testWorkspaces = [
        createMockWorkspace({ id: "ws-1", name: "Project A" }),
        createMockWorkspace({ id: "ws-2", name: "Project B" }),
      ];
      setWorkspaces(testWorkspaces);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      expect(result.current.workspaces).toHaveLength(2);

      await act(async () => {
        await result.current.removeWorkspace("ws-1");
      });

      // Verify remove was called
      expect(mockHandlers.remove_workspace).toHaveBeenCalledWith(
        expect.objectContaining({ id: "ws-1" })
      );
    });

    it("clears active workspace when removed", async () => {
      const testWorkspace = createMockWorkspace({ id: "ws-1", name: "Project A" });
      setWorkspaces([testWorkspace]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      act(() => {
        result.current.setActiveWorkspaceId("ws-1");
      });

      expect(result.current.activeWorkspaceId).toBe("ws-1");

      await act(async () => {
        await result.current.removeWorkspace("ws-1");
      });

      // Active workspace should be cleared
      expect(result.current.activeWorkspaceId).toBeNull();
    });
  });

  describe("Workspace Settings", () => {
    it("updates workspace sidebar collapsed state", async () => {
      const testWorkspace = createMockWorkspace({
        id: "ws-1",
        name: "Project A",
        settings: { sidebarCollapsed: false },
      });
      setWorkspaces([testWorkspace]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.updateWorkspaceSettings("ws-1", { sidebarCollapsed: true });
      });

      expect(mockHandlers.update_workspace_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ws-1",
          settings: expect.objectContaining({ sidebarCollapsed: true }),
        })
      );
    });

    it("updates workspace git root", async () => {
      const testWorkspace = createMockWorkspace({
        id: "ws-1",
        name: "Project A",
        path: "/home/user/monorepo",
        settings: { sidebarCollapsed: false },
      });
      setWorkspaces([testWorkspace]);

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.updateWorkspaceSettings("ws-1", { gitRoot: "packages/app" });
      });

      expect(mockHandlers.update_workspace_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ws-1",
          settings: expect.objectContaining({ gitRoot: "packages/app" }),
        })
      );
    });
  });

  describe("Workspace Groups", () => {
    it("creates a workspace group", async () => {
      const testWorkspace = createMockWorkspace({ id: "ws-1", name: "Project A" });
      setWorkspaces([testWorkspace]);

      const queueSaveSettings = vi.fn();

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: defaultAppSettings,
          addDebugEntry: vi.fn(),
          queueSaveSettings,
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.createWorkspaceGroup("Frontend Projects");
      });

      expect(queueSaveSettings).toHaveBeenCalled();
    });

    it("assigns workspace to a group", async () => {
      const testWorkspace = createMockWorkspace({ id: "ws-1", name: "Project A" });
      setWorkspaces([testWorkspace]);

      const appSettingsWithGroup = {
        ...defaultAppSettings,
        workspaceGroups: [{ id: "group-1", name: "Frontend Projects" }],
      };

      const { result } = renderHook(() =>
        useWorkspaceController({
          appSettings: appSettingsWithGroup,
          addDebugEntry: vi.fn(),
          queueSaveSettings: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(result.current.hasLoaded).toBe(true);
      });

      await act(async () => {
        await result.current.assignWorkspaceGroup("ws-1", "group-1");
      });

      expect(mockHandlers.update_workspace_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ws-1",
          settings: expect.objectContaining({ groupId: "group-1" }),
        })
      );
    });
  });
});
