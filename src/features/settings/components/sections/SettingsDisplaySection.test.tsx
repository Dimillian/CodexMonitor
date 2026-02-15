// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../../../types";
import { SettingsDisplaySection } from "./SettingsDisplaySection";

describe("SettingsDisplaySection", () => {
  it("toggles auto-generated thread titles", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            showMessageFilePath: true,
            threadScrollRestoreMode: "latest",
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const row = screen
      .getByText("自动生成对话标题")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTitleAutogenerationEnabled: true }),
    );
  });
<<<<<<< HEAD

  it("renders thread scroll restore mode options", () => {
=======
  it("toggles unlimited chat history", () => {
>>>>>>> origin/main
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
<<<<<<< HEAD
            showMessageFilePath: true,
            threadScrollRestoreMode: "latest",
=======
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
>>>>>>> origin/main
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
<<<<<<< HEAD
      />
    );

    const select = screen.getByLabelText("线程切换滚动策略") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("latest");
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.value).toBe("latest");
    expect(select.options[1]?.value).toBe("remember");
  });
=======
      />,
    );

    const row = screen.getByText("Unlimited chat history").closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("disables scrollback controls when unlimited chat history is enabled", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: null,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const presetSelect = screen.getByLabelText("Scrollback preset");
    expect((presetSelect as HTMLSelectElement).disabled).toBe(true);

    const maxItemsInput = screen.getByLabelText("Max items per thread");
    expect((maxItemsInput as HTMLInputElement).disabled).toBe(true);

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "Reset",
    });
    expect((resetButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(presetSelect, { target: { value: "1000" } });
    expect(onUpdateAppSettings).not.toHaveBeenCalled();
  });

  it("applies scrollback presets", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Scrollback preset");
    fireEvent.change(select, { target: { value: "1000" } });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 1000 }),
    );
  });

  it("does not persist scrollback draft on blur when toggling unlimited", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const maxItemsInput = screen.getByLabelText("Max items per thread");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const unlimitedRow = screen
      .getByText("Unlimited chat history")
      .closest(".settings-toggle-row");
    expect(unlimitedRow).toBeTruthy();
    const unlimitedButton = within(unlimitedRow as HTMLElement).getByRole("button");

    fireEvent.blur(maxItemsInput, { relatedTarget: unlimitedButton });
    fireEvent.click(unlimitedButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("does not persist scrollback draft on blur when clicking Reset", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiFontDraft=""
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiFontDraft={vi.fn() as any}
        onCommitUiFont={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const maxItemsInput = screen.getByLabelText("Max items per thread");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "Reset",
    });

    fireEvent.blur(maxItemsInput, { relatedTarget: resetButton });
    fireEvent.click(resetButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 200 }),
    );
  });

>>>>>>> origin/main
});
