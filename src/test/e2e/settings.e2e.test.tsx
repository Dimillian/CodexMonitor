// @vitest-environment jsdom
/**
 * E2E Tests for Settings Management
 *
 * Tests the complete user flows for settings operations including:
 * - Loading application settings
 * - Updating settings
 * - Gemini CLI configuration
 * - Theme and appearance settings
 * - Experimental features
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  mockHandlers,
  setAppSettings,
  defaultAppSettings,
  resetMocks,
} from "./mocks/tauri.mock";
import type { AppSettings, GeminiDoctorResult } from "../../types";

// Import hooks after mocking (mocks are set up in setup.ts)
import { useAppSettingsController } from "../../features/app/hooks/useAppSettingsController";

// Helper to create mock doctor result
function createMockDoctorResult(overrides: Partial<GeminiDoctorResult> = {}): GeminiDoctorResult {
  return {
    ok: true,
    geminiBin: "/usr/local/bin/gemini",
    version: "1.0.0",
    appServerOk: true,
    details: null,
    path: "/usr/local/bin",
    nodeOk: true,
    nodeVersion: "20.0.0",
    nodeDetails: null,
    ...overrides,
  };
}

describe("Settings Management E2E", () => {
  beforeEach(() => {
    resetMocks();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Settings Loading", () => {
    it("loads app settings on initialization", async () => {
      const customSettings: AppSettings = {
        ...defaultAppSettings,
        geminiBin: "/usr/local/bin/gemini",
        defaultAccessMode: "full-access",
        notificationSoundsEnabled: false,
      };

      setAppSettings(customSettings);

      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      expect(result.current.appSettings.geminiBin).toBe("/usr/local/bin/gemini");
      expect(result.current.appSettings.defaultAccessMode).toBe("full-access");
      expect(result.current.appSettings.notificationSoundsEnabled).toBe(false);
    });

    it("uses default settings when loading fails", async () => {
      mockHandlers.get_app_settings.mockRejectedValueOnce(new Error("Failed to load settings"));

      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      // Should have default values
      expect(result.current.appSettings.defaultAccessMode).toBe("current");
    });
  });

  describe("Settings Updates", () => {
    it("updates Gemini CLI path", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          geminiBin: "/custom/path/gemini",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            geminiBin: "/custom/path/gemini",
          }),
        })
      );
    });

    it("updates default access mode", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          defaultAccessMode: "read-only",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            defaultAccessMode: "read-only",
          }),
        })
      );
    });

    it("updates notification sound settings", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          notificationSoundsEnabled: false,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            notificationSoundsEnabled: false,
          }),
        })
      );
    });
  });

  describe("Experimental Features", () => {
    it("enables collaboration modes", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      expect(result.current.appSettings.experimentalCollaborationModesEnabled).toBe(false);

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          experimentalCollaborationModesEnabled: true,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            experimentalCollaborationModesEnabled: true,
          }),
        })
      );
    });

    it("enables steer mode", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          experimentalSteerEnabled: true,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            experimentalSteerEnabled: true,
          }),
        })
      );
    });
  });

  describe("Keyboard Shortcuts", () => {
    it("updates interrupt shortcut", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          interruptShortcut: "Mod+.",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            interruptShortcut: "Mod+.",
          }),
        })
      );
    });

    it("updates archive thread shortcut", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          archiveThreadShortcut: "Mod+Shift+Delete",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            archiveThreadShortcut: "Mod+Shift+Delete",
          }),
        })
      );
    });

    it("updates composer shortcuts", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          composerModelShortcut: "Mod+M",
          composerAccessShortcut: "Mod+A",
          composerReasoningShortcut: "Mod+R",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            composerModelShortcut: "Mod+M",
            composerAccessShortcut: "Mod+A",
            composerReasoningShortcut: "Mod+R",
          }),
        })
      );
    });
  });

  describe("Composer Editor Settings", () => {
    it("updates composer editor preset", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          composerEditorPreset: "smart",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            composerEditorPreset: "smart",
          }),
        })
      );
    });

    it("updates code fence settings", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          composerFenceExpandOnSpace: false,
          composerFenceExpandOnEnter: false,
          composerFenceLanguageTags: false,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            composerFenceExpandOnSpace: false,
            composerFenceExpandOnEnter: false,
            composerFenceLanguageTags: false,
          }),
        })
      );
    });
  });

  describe("Font Settings", () => {
    it("updates UI font family", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          uiFontFamily: "Inter, sans-serif",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            uiFontFamily: "Inter, sans-serif",
          }),
        })
      );
    });

    it("updates code font settings", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          codeFontFamily: "JetBrains Mono, monospace",
          codeFontSize: 14,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            codeFontFamily: "JetBrains Mono, monospace",
            codeFontSize: 14,
          }),
        })
      );
    });
  });

  describe("Gemini Doctor", () => {
    it("runs doctor check successfully", async () => {
      const doctorResult = createMockDoctorResult({
        ok: true,
        geminiBin: "/usr/local/bin/gemini",
        version: "2.0.0",
        details: null,
      });

      mockHandlers.gemini_doctor.mockResolvedValue(doctorResult);

      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      let doctorResponse;
      await act(async () => {
        doctorResponse = await result.current.doctor("/usr/local/bin/gemini", null);
      });

      expect(doctorResponse).toEqual(doctorResult);
      expect(mockHandlers.gemini_doctor).toHaveBeenCalled();
    });

    it("handles doctor check with errors", async () => {
      const doctorResult = createMockDoctorResult({
        ok: false,
        geminiBin: null,
        version: null,
        details: "Gemini CLI not found in PATH",
      });

      mockHandlers.gemini_doctor.mockResolvedValue(doctorResult);

      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      let doctorResponse: GeminiDoctorResult | undefined;
      await act(async () => {
        doctorResponse = await result.current.doctor(null, null);
      });

      expect(doctorResponse?.ok).toBe(false);
      expect(doctorResponse?.details).toBe("Gemini CLI not found in PATH");
    });
  });

  describe("Workspace Groups", () => {
    it("persists workspace groups in settings", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      const newGroups = [
        { id: "group-1", name: "Frontend" },
        { id: "group-2", name: "Backend" },
      ];

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          workspaceGroups: newGroups,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            workspaceGroups: newGroups,
          }),
        })
      );
    });
  });

  describe("Open App Targets", () => {
    it("configures external editor targets", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      const openAppTargets = [
        { id: "vscode", label: "VS Code", kind: "command" as const, appName: null, command: "code", args: [] },
        { id: "cursor", label: "Cursor", kind: "command" as const, appName: null, command: "cursor", args: [] },
      ];

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          openAppTargets,
          selectedOpenAppId: "vscode",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            selectedOpenAppId: "vscode",
          }),
        })
      );
    });
  });

  describe("Dictation Settings", () => {
    it("enables dictation feature", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          dictationEnabled: true,
          dictationPreferredLanguage: "en-US",
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            dictationEnabled: true,
            dictationPreferredLanguage: "en-US",
          }),
        })
      );
    });
  });

  describe("Settings Persistence", () => {
    it("batches multiple setting updates", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      // Make multiple updates
      await act(async () => {
        result.current.setAppSettings({
          ...result.current.appSettings,
          notificationSoundsEnabled: false,
        });
        result.current.setAppSettings({
          ...result.current.appSettings,
          notificationSoundsEnabled: false,
          dictationEnabled: true,
        });
      });

      // Should batch the updates
      expect(result.current.appSettings.notificationSoundsEnabled).toBe(false);
      expect(result.current.appSettings.dictationEnabled).toBe(true);
    });
  });

  describe("Usage Display Settings", () => {
    it("toggles usage remaining display", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          usageShowRemaining: true,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            usageShowRemaining: true,
          }),
        })
      );
    });
  });

  describe("Git Diff Settings", () => {
    it("toggles preload git diffs", async () => {
      const { result } = renderHook(() => useAppSettingsController());

      await waitFor(() => {
        expect(result.current.appSettingsLoading).toBe(false);
      });

      await act(async () => {
        await result.current.queueSaveSettings({
          ...result.current.appSettings,
          preloadGitDiffs: false,
        });
      });

      expect(mockHandlers.update_app_settings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            preloadGitDiffs: false,
          }),
        })
      );
    });
  });
});
