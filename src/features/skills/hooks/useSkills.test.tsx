// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent, WorkspaceInfo } from "../../../types";
import { getSkillsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { useSkills } from "./useSkills";

vi.mock("../../../services/tauri", () => ({
  getSkillsList: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace One",
  path: "/tmp/workspace-one",
  connected: true,
  settings: { sidebarCollapsed: false },
};

let listener: ((event: AppServerEvent) => void) | null = null;
const unlisten = vi.fn();

beforeEach(() => {
  listener = null;
  unlisten.mockReset();
  vi.mocked(subscribeAppServerEvents).mockImplementation((cb) => {
    listener = cb;
    return unlisten;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSkills", () => {
  it("refreshes skills on canonical codex/event/skills_update_available notifications", async () => {
    vi.mocked(getSkillsList)
      .mockResolvedValueOnce({ result: { skills: [{ name: "first", path: "/skills/first" }] } })
      .mockResolvedValueOnce({
        result: {
          skills: [
            { name: "first", path: "/skills/first" },
            { name: "second", path: "/skills/second" },
          ],
        },
      });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-1",
        message: {
          method: "codex/event/skills_update_available",
        },
      });
    });

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(2);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first", "second"]);
    });
  });

  it("ignores non-canonical direct skills update methods", async () => {
    vi.mocked(getSkillsList)
      .mockResolvedValueOnce({ result: { skills: [{ name: "first", path: "/skills/first" }] } });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-1",
        message: { method: "skills/updateAvailable" },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSkillsList).toHaveBeenCalledTimes(1);
    expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
  });

  it("ignores skills update events from other workspaces", async () => {
    vi.mocked(getSkillsList).mockResolvedValue({
      result: { skills: [{ name: "first", path: "/skills/first" }] },
    });

    renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-2",
        message: {
          method: "codex/event/skills_update_available",
        },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSkillsList).toHaveBeenCalledTimes(1);
  });
});
