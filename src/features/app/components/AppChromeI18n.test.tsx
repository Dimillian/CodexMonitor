/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarBottomRail } from "./SidebarBottomRail";
import { LaunchScriptButton } from "./LaunchScriptButton";
import { ComposerMetaBar } from "../../composer/components/ComposerMetaBar";
import { TerminalDock } from "../../terminal/components/TerminalDock";

describe("app chrome i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh");
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes sidebar hover labels in Chinese", () => {
    render(
      <SidebarBottomRail
        sessionPercent={42}
        weeklyPercent={55}
        sessionResetLabel="soon"
        weeklyResetLabel="later"
        creditsLabel="$12"
        showWeekly={true}
        onOpenSettings={vi.fn()}
        onOpenDebug={vi.fn()}
        showDebugButton={true}
        showAccountSwitcher={true}
        accountLabel="demo@example.com"
        accountActionLabel="切换账户"
        accountDisabled={false}
        accountSwitching={false}
        accountCancelDisabled={true}
        onSwitchAccount={vi.fn()}
        onCancelSwitchAccount={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "账户" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开设置" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开调试日志" })).toBeTruthy();
  });

  it("localizes launch and terminal controls in Chinese", () => {
    const { container } = render(
      <>
        <LaunchScriptButton
          launchScript={null}
          editorOpen={true}
          draftScript=""
          isSaving={false}
          error={null}
          onRun={vi.fn()}
          onOpenEditor={vi.fn()}
          onCloseEditor={vi.fn()}
          onDraftChange={vi.fn()}
          onSave={vi.fn()}
        />
        <TerminalDock
          isOpen={true}
          terminals={[{ id: "t1", title: "shell" }]}
          activeTerminalId="t1"
          onSelectTerminal={vi.fn()}
          onNewTerminal={vi.fn()}
          onCloseTerminal={vi.fn()}
          onResizeStart={vi.fn()}
          terminalNode={<div>terminal</div>}
        />
      </>,
    );

    expect(screen.getByRole("button", { name: "设置启动脚本" })).toBeTruthy();
    expect(screen.getByPlaceholderText("例如 npm run dev")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "终端标签页" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建终端" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭 shell" })).toBeTruthy();

    const resizer = container.querySelector(".terminal-panel-resizer");
    expect(resizer?.getAttribute("aria-label")).toBe("调整终端面板大小");
  });

  it("localizes the context-free tooltip in Chinese", () => {
    const { container } = render(
      <ComposerMetaBar
        disabled={false}
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={vi.fn()}
        models={[]}
        selectedModelId={null}
        onSelectModel={vi.fn()}
        reasoningOptions={[]}
        selectedEffort={null}
        onSelectEffort={vi.fn()}
        selectedServiceTier={null}
        reasoningSupported={true}
        accessMode="current"
        onSelectAccessMode={vi.fn()}
        contextUsage={{
          total: {
            totalTokens: 25,
            inputTokens: 10,
            cachedInputTokens: 0,
            outputTokens: 15,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens: 25,
            inputTokens: 10,
            cachedInputTokens: 0,
            outputTokens: 15,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: 100,
        }}
      />,
    );

    const ring = container.querySelector(".composer-context-ring");
    expect(ring?.getAttribute("data-tooltip")).toBe("上下文空余 75%");
    expect(ring?.getAttribute("aria-label")).toBe("上下文空余 75%");
  });
});
