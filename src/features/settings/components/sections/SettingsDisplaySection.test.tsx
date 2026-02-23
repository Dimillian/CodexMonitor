// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { SettingsDisplaySection } from "./SettingsDisplaySection";

describe("SettingsDisplaySection", () => {
  afterEach(() => {
    cleanup();
  });
  it("toggles auto-generated thread titles", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
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
      .getByText("Auto-generate new thread titles")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTitleAutogenerationEnabled: true }),
    );
  });

  it("toggles thread token usage visibility", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showThreadTokenUsage: true,
            threadTokenUsageShowFull: true,
            threadTokenUsageExcludeCache: false,
            showMessageFilePath: true,
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

    const row = screen.getByText("Show thread token usage").closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ showThreadTokenUsage: false }),
    );
  });

  it("toggles full thread token count display", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showThreadTokenUsage: true,
            threadTokenUsageShowFull: true,
            threadTokenUsageExcludeCache: false,
            showMessageFilePath: true,
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
      .getByText("Show full thread token counts")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTokenUsageShowFull: false }),
    );
  });

  it("toggles excluding cache from thread token usage", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showThreadTokenUsage: true,
            threadTokenUsageShowFull: true,
            threadTokenUsageExcludeCache: false,
            showMessageFilePath: true,
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
      .getByText("Exclude cache from thread token usage")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTokenUsageExcludeCache: true }),
    );
  });

  it("toggles unlimited chat history", () => {
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

});
