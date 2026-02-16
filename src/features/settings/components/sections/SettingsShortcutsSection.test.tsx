// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsShortcutsSection } from "./SettingsShortcutsSection";
import type { ShortcutDrafts } from "../settingsTypes";

const baseShortcutDrafts: ShortcutDrafts = {
  model: "",
  reasoning: "",
  collaboration: "",
  interrupt: "",
  newAgent: "",
  newWorktreeAgent: "",
  newCloneAgent: "",
  archiveThread: "",
  projectsSidebar: "",
  gitSidebar: "",
  branchSwitcher: "",
  debugPanel: "",
  terminal: "",
  cycleAgentNext: "",
  cycleAgentPrev: "",
  cycleWorkspaceNext: "",
  cycleWorkspacePrev: "",
};

describe("SettingsShortcutsSection", () => {
  it("shows mobile unsupported hint and disables shortcut editing", () => {
    const onShortcutKeyDown = vi.fn();
    const onClearShortcut = vi.fn();

    render(
      <SettingsShortcutsSection
        isMobilePlatform
        shortcutDrafts={baseShortcutDrafts}
        onShortcutKeyDown={onShortcutKeyDown}
        onClearShortcut={onClearShortcut}
      />,
    );

    expect(
      screen.getByText("移动端暂不支持全局菜单快捷键修改，当前仅展示桌面端快捷键映射。"),
    ).not.toBeNull();

    const searchInput = screen.getByRole("searchbox", { name: "搜索快捷键" });
    expect(searchInput.hasAttribute("disabled")).toBe(true);

    const shortcutInputs = screen.getAllByPlaceholderText("输入快捷键");
    expect(shortcutInputs.length > 0).toBe(true);
    fireEvent.keyDown(shortcutInputs[0], { key: "x" });
    expect(onShortcutKeyDown).not.toHaveBeenCalled();

    const clearButtons = screen.getAllByRole("button", { name: "清除" });
    expect(clearButtons.length > 0).toBe(true);
    expect(clearButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(clearButtons[0]);
    expect(onClearShortcut).not.toHaveBeenCalled();
  });
});
