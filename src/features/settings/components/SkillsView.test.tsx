// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillOption } from "../../../types";
import { SkillsView } from "./SkillsView";
import { openPath } from "@tauri-apps/plugin-opener";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(undefined),
  revealItemInDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/Users/demo"),
  join: vi.fn((base: string, next: string) => {
    const trimmedBase = base.replace(/\/+$/, "");
    const trimmedNext = next.replace(/^\/+/, "");
    return `${trimmedBase}/${trimmedNext}`;
  }),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("SkillsView", () => {
  beforeEach(() => {
    const openPathMock = vi.mocked(openPath);
    openPathMock.mockReset();
    openPathMock.mockResolvedValue(undefined);
  });

  it("renders skills and calls onUseSkill", () => {
    const skills: SkillOption[] = [
      {
        name: "build_project",
        path: "/tmp/skill/build_project",
        description: "Build the project",
      },
    ];
    const onUseSkill = vi.fn();
    const onRefreshSkills = vi.fn();

    render(
      <SkillsView
        skills={skills}
        onUseSkill={onUseSkill}
        onRefreshSkills={onRefreshSkills}
      />,
    );

    expect(screen.getByText("build_project")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(onUseSkill).toHaveBeenCalledWith("build_project");
  });

  it("shows empty state when no skills are available", () => {
    render(
      <SkillsView skills={[]} onUseSkill={vi.fn()} onRefreshSkills={vi.fn()} />,
    );

    expect(screen.getByText(/No skills found for this workspace/i)).toBeTruthy();
  });

  it("tries a nested skill folder when the direct SKILL.md is missing", async () => {
    const skills: SkillOption[] = [
      {
        name: "skill-installer",
        path: "~/.codex/skills/.system",
        description: "Install curated skills",
      },
    ];
    const openPathMock = vi.mocked(openPath);
    openPathMock
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(undefined);

    const { container } = render(
      <SkillsView
        skills={skills}
        onUseSkill={vi.fn()}
        onRefreshSkills={vi.fn()}
      />,
    );

    fireEvent.click(within(container).getByRole("button", { name: "Edit" }));

    await waitFor(() => {
      expect(openPathMock).toHaveBeenCalledTimes(2);
    });
    expect(openPathMock).toHaveBeenNthCalledWith(
      1,
      "/Users/demo/.codex/skills/.system/SKILL.md",
    );
    expect(openPathMock).toHaveBeenNthCalledWith(
      2,
      "/Users/demo/.codex/skills/.system/skill-installer/SKILL.md",
    );
  });

  it("resolves skill paths relative to CODEX_HOME", async () => {
    const skills: SkillOption[] = [
      {
        name: "skill-creator",
        path: "skills/skill-creator",
        codexHome: "/Users/demo/.codex",
      },
    ];
    const openPathMock = vi.mocked(openPath);

    const { container } = render(
      <SkillsView
        skills={skills}
        onUseSkill={vi.fn()}
        onRefreshSkills={vi.fn()}
      />,
    );

    fireEvent.click(within(container).getByRole("button", { name: "Edit" }));

    await waitFor(() => {
      expect(openPathMock).toHaveBeenCalledTimes(1);
    });
    expect(openPathMock).toHaveBeenCalledWith(
      "/Users/demo/.codex/skills/skill-creator/SKILL.md",
    );
  });
});
