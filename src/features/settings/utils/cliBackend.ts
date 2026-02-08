import type {
  AppSettings,
  CliType,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../../../types";

export const normalizeOverrideValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const getWorkspaceCliBinOverride = (
  workspace: WorkspaceInfo,
  cliType: CliType,
): string | null => {
  switch (cliType) {
    case "gemini":
      return workspace.settings.geminiBin ?? null;
    case "cursor":
      return workspace.settings.cursorBin ?? null;
    case "claude":
      return workspace.settings.claudeBin ?? null;
    default:
      return workspace.settings.codexBin ?? workspace.codex_bin ?? null;
  }
};

export const getWorkspaceCliHomeOverride = (
  workspace: WorkspaceInfo,
  cliType: CliType,
): string | null => {
  switch (cliType) {
    case "gemini":
      return workspace.settings.geminiHome ?? workspace.settings.codexHome ?? null;
    case "cursor":
      return workspace.settings.cursorHome ?? workspace.settings.codexHome ?? null;
    case "claude":
      return workspace.settings.claudeHome ?? workspace.settings.codexHome ?? null;
    default:
      return workspace.settings.codexHome ?? null;
  }
};

export const getWorkspaceCliArgsOverride = (
  workspace: WorkspaceInfo,
  cliType: CliType,
): string | null => {
  switch (cliType) {
    case "gemini":
      return workspace.settings.geminiArgs ?? workspace.settings.codexArgs ?? null;
    case "cursor":
      return workspace.settings.cursorArgs ?? workspace.settings.codexArgs ?? null;
    case "claude":
      return workspace.settings.claudeArgs ?? workspace.settings.codexArgs ?? null;
    default:
      return workspace.settings.codexArgs ?? null;
  }
};

export const withWorkspaceCliHomeOverride = (
  cliType: CliType,
  value: string | null,
): Partial<WorkspaceSettings> => {
  switch (cliType) {
    case "gemini":
      return { geminiHome: value };
    case "cursor":
      return { cursorHome: value };
    case "claude":
      return { claudeHome: value };
    default:
      return { codexHome: value };
  }
};

export const withWorkspaceCliArgsOverride = (
  cliType: CliType,
  value: string | null,
): Partial<WorkspaceSettings> => {
  switch (cliType) {
    case "gemini":
      return { geminiArgs: value };
    case "cursor":
      return { cursorArgs: value };
    case "claude":
      return { claudeArgs: value };
    default:
      return { codexArgs: value };
  }
};

export const getActiveCliPath = (settings: AppSettings): string | null => {
  switch (settings.cliType) {
    case "gemini":
      return settings.geminiBin;
    case "cursor":
      return settings.cursorBin;
    case "claude":
      return settings.claudeBin;
    default:
      return settings.codexBin;
  }
};

export const getActiveCliArgs = (settings: AppSettings): string | null => {
  switch (settings.cliType) {
    case "gemini":
      return settings.geminiArgs;
    case "cursor":
      return settings.cursorArgs;
    case "claude":
      return settings.claudeArgs;
    default:
      return settings.codexArgs;
  }
};

export const withActiveCliPath = (
  settings: AppSettings,
  value: string | null,
): AppSettings => {
  switch (settings.cliType) {
    case "gemini":
      return { ...settings, geminiBin: value };
    case "cursor":
      return { ...settings, cursorBin: value };
    case "claude":
      return { ...settings, claudeBin: value };
    default:
      return { ...settings, codexBin: value };
  }
};

export const withActiveCliArgs = (
  settings: AppSettings,
  value: string | null,
): AppSettings => {
  switch (settings.cliType) {
    case "gemini":
      return { ...settings, geminiArgs: value };
    case "cursor":
      return { ...settings, cursorArgs: value };
    case "claude":
      return { ...settings, claudeArgs: value };
    default:
      return { ...settings, codexArgs: value };
  }
};
