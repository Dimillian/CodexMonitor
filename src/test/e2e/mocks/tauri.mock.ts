/**
 * Tauri Mock Module
 *
 * This module provides mock implementations for Tauri IPC commands.
 * It uses a global state object that can be manipulated by tests.
 */

import { vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";

// Default app settings
export const defaultAppSettings: AppSettings = {
  geminiBin: null,
  geminiArgs: null,
  defaultAccessMode: "current",
  usageShowRemaining: false,
  preloadGitDiffs: true,
  experimentalCollaborationModesEnabled: false,
  experimentalSteerEnabled: false,
  notificationSoundsEnabled: true,
  dictationEnabled: false,
  dictationLanguage: null,
  composerModelShortcut: "Mod+Shift+M",
  composerAccessShortcut: "Mod+Shift+A",
  composerReasoningShortcut: "Mod+Shift+R",
  composerCollaborationShortcut: "Mod+Shift+C",
  interruptShortcut: "Escape",
  archiveThreadShortcut: "Mod+Shift+Backspace",
  toggleDebugPanelShortcut: "Mod+Shift+D",
  toggleTerminalShortcut: "Mod+`",
  workspaceGroups: [],
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  openAppTargets: [
    { id: "editor", label: "Editor", appName: null, command: "code", args: [] },
  ],
  selectedOpenAppId: "editor",
  composerEditorPreset: "default",
  composerFenceExpandOnSpace: true,
  composerFenceExpandOnEnter: true,
  composerFenceLanguageTags: true,
  composerFenceWrapSelection: true,
  composerFenceAutoWrapPasteMultiline: true,
  composerFenceAutoWrapPasteCodeLike: true,
  composerListContinuation: true,
  composerCodeBlockCopyUseModifier: false,
  uiFontFamily: "system-ui",
  codeFontFamily: "monospace",
  codeFontSize: 13,
  theme: "system",
  uiScale: 1,
};

// Global mock state - can be modified by tests
export const mockState = {
  workspaces: [] as WorkspaceInfo[],
  appSettings: { ...defaultAppSettings } as AppSettings,
  threads: new Map<string, unknown[]>(),
};

// Mock handlers
export const mockHandlers = {
  list_workspaces: vi.fn(async () => mockState.workspaces),
  add_workspace: vi.fn(async ({ path }: { path: string }) => {
    const workspace: WorkspaceInfo = {
      id: `ws-${Date.now()}`,
      name: path.split("/").pop() || "Workspace",
      path,
      connected: false,
      settings: { sidebarCollapsed: false },
    };
    mockState.workspaces.push(workspace);
    return workspace;
  }),
  remove_workspace: vi.fn(async ({ id }: { id: string }) => {
    mockState.workspaces = mockState.workspaces.filter((ws) => ws.id !== id);
  }),
  connect_workspace: vi.fn(async ({ id }: { id: string }) => {
    const workspace = mockState.workspaces.find((ws) => ws.id === id);
    if (workspace) {
      workspace.connected = true;
    }
  }),
  update_workspace_settings: vi.fn(async ({ id, settings }: { id: string; settings: unknown }) => {
    const workspace = mockState.workspaces.find((ws) => ws.id === id);
    if (workspace) {
      workspace.settings = { ...workspace.settings, ...(settings as Record<string, unknown>) };
    }
    return workspace;
  }),
  get_app_settings: vi.fn(async () => mockState.appSettings),
  update_app_settings: vi.fn(async ({ settings }: { settings: AppSettings }) => {
    mockState.appSettings = { ...mockState.appSettings, ...settings };
    return mockState.appSettings;
  }),
  get_git_status: vi.fn(async () => ({
    branchName: "main",
    files: [],
    stagedFiles: [],
    unstagedFiles: [],
    totalAdditions: 0,
    totalDeletions: 0,
  })),
  list_threads: vi.fn(async () => ({ result: { data: [], nextCursor: null } })),
  start_thread: vi.fn(async ({ workspaceId }: { workspaceId: string }) => ({
    result: {
      thread: {
        id: `thread-${Date.now()}`,
        preview: "",
        updated_at: Date.now(),
        cwd: mockState.workspaces.find((ws) => ws.id === workspaceId)?.path,
      },
    },
  })),
  resume_thread: vi.fn(async ({ threadId }: { threadId: string }) => ({
    result: {
      thread: {
        id: threadId,
        preview: "",
        updated_at: Date.now(),
        turns: [],
      },
    },
  })),
  archive_thread: vi.fn(async () => ({ result: {} })),
  send_user_message: vi.fn(async () => {}),
  turn_interrupt: vi.fn(async () => ({ result: {} })),
  model_list: vi.fn(async () => ({
    result: {
      data: [
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
      ],
    },
  })),
  gemini_doctor: vi.fn(async () => ({
    gemini_found: true,
    gemini_path: "/usr/local/bin/gemini",
    gemini_version: "1.0.0",
    working_directory: "/tmp",
    errors: [],
  })),
  local_usage_snapshot: vi.fn(async () => ({
    updatedAt: Date.now(),
    days: [],
    totals: {
      last7DaysTokens: 0,
      last30DaysTokens: 0,
      averageDailyTokens: 0,
      cacheHitRatePercent: 0,
      peakDay: null,
      peakDayTokens: 0,
    },
    topModels: [],
  })),
  list_workspace_files: vi.fn(async () => []),
  skills_list: vi.fn(async () => ({ result: { data: [] } })),
  prompts_list: vi.fn(async () => ({ result: { data: [] } })),
  get_git_diffs: vi.fn(async () => []),
  get_git_log: vi.fn(async () => ({
    entries: [],
    total: 0,
    ahead: 0,
    behind: 0,
    aheadEntries: [],
    behindEntries: [],
    upstream: null,
  })),
  list_git_branches: vi.fn(async () => ({ result: { data: [] } })),
  account_rate_limits: vi.fn(async () => null),
  account_read: vi.fn(async () => null),
  get_git_remote: vi.fn(async () => null),
  list_git_roots: vi.fn(async () => []),
  get_gemini_config_path: vi.fn(async () => "/home/user/.config/gemini/config.toml"),
  get_gemini_settings: vi.fn(async () => ({})),
  get_gemini_settings_path: vi.fn(async () => "/home/user/.config/gemini/settings.json"),
  update_gemini_settings: vi.fn(async () => {}),
  get_mcp_config: vi.fn(async () => ({})),
  get_config_model: vi.fn(async () => null),
  collaboration_mode_list: vi.fn(async () => ({ result: { data: [] } })),
  prompts_workspace_dir: vi.fn(async () => "/tmp/test-workspace/.gemini/prompts"),
  prompts_global_dir: vi.fn(async () => "/home/user/.config/gemini/prompts"),
  file_read: vi.fn(async () => ({ exists: false, content: "", truncated: false })),
  file_write: vi.fn(async () => {}),
  dictation_model_status: vi.fn(async () => ({ status: "not_downloaded" })),
  is_workspace_path_dir: vi.fn(async () => true),
  update_workspace_gemini_bin: vi.fn(async ({ id }: { id: string }) => {
    return mockState.workspaces.find((ws) => ws.id === id);
  }),
};

// The invoke function that dispatches to handlers
export const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  const handler = mockHandlers[cmd as keyof typeof mockHandlers];
  if (!handler) {
    console.warn(`Unhandled Tauri command: ${cmd}`);
    return null;
  }
  return handler(args as never);
});

// Reset function for tests
export function resetMocks() {
  mockState.workspaces = [];
  mockState.appSettings = { ...defaultAppSettings };
  mockState.threads.clear();
  Object.values(mockHandlers).forEach((mock) => mock.mockClear());
  invoke.mockClear();
}

// Helper to set workspaces
export function setWorkspaces(workspaces: WorkspaceInfo[]) {
  mockState.workspaces = [...workspaces];
}

// Helper to set app settings
export function setAppSettings(settings: Partial<AppSettings>) {
  mockState.appSettings = { ...defaultAppSettings, ...settings };
}
