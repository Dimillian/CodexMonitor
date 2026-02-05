// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SkillOption } from "../../../types";
import { SkillsView } from "./SkillsView";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(undefined),
  revealItemInDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("SkillsView", () => {
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
});
