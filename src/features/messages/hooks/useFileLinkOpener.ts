import { useCallback } from "react";
import type { MouseEvent } from "react";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as Sentry from "@sentry/react";
import { openWorkspaceIn } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget } from "../../../types";
import {
  isAbsolutePath,
  joinWorkspacePath,
  revealInFileManagerLabel,
} from "../../../utils/platformPaths";
import { resolveMountedWorkspacePath } from "../utils/mountedWorkspacePaths";

type OpenTarget = {
  id: string;
  label: string;
  appName?: string | null;
  kind: OpenAppTarget["kind"];
  command?: string | null;
  args: string[];
};

const DEFAULT_OPEN_TARGET: OpenTarget = {
  id: "vscode",
  label: "VS Code",
  appName: "Visual Studio Code",
  kind: "app",
  command: null,
  args: [],
};

const resolveAppName = (target: OpenTarget) => (target.appName ?? "").trim();
const resolveCommand = (target: OpenTarget) => (target.command ?? "").trim();

const canOpenTarget = (target: OpenTarget) => {
  if (target.kind === "finder") {
    return true;
  }
  if (target.kind === "command") {
    return Boolean(resolveCommand(target));
  }
  return Boolean(resolveAppName(target));
};

function resolveFilePath(path: string, workspacePath?: string | null) {
  const trimmed = path.trim();
  if (!workspacePath) {
    return trimmed;
  }
  const mountedWorkspacePath = resolveMountedWorkspacePath(trimmed, workspacePath);
  if (mountedWorkspacePath) {
    return mountedWorkspacePath;
  }
  if (isAbsolutePath(trimmed)) {
    return trimmed;
  }
  return joinWorkspacePath(workspacePath, trimmed);
}

type ParsedFileLocation = {
  path: string;
  line: number | null;
  column: number | null;
};

const FILE_LOCATION_SUFFIX_PATTERN = /^(.*?):(\d+)(?::(\d+))?$/;
const FILE_LOCATION_RANGE_SUFFIX_PATTERN = /^(.*?):(\d+)-(\d+)$/;
const FILE_LOCATION_HASH_PATTERN = /^(.*?)#L(\d+)(?:C(\d+))?$/i;

function parsePositiveInteger(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFileLocation(rawPath: string): ParsedFileLocation {
  const trimmed = rawPath.trim();
  const hashMatch = trimmed.match(FILE_LOCATION_HASH_PATTERN);
  if (hashMatch) {
    const [, path, lineValue, columnValue] = hashMatch;
    const line = parsePositiveInteger(lineValue);
    if (line !== null) {
      return {
        path,
        line,
        column: parsePositiveInteger(columnValue),
      };
    }
  }

  const match = trimmed.match(FILE_LOCATION_SUFFIX_PATTERN);
  if (match) {
    const [, path, lineValue, columnValue] = match;
    const line = parsePositiveInteger(lineValue);
    if (line === null) {
      return {
        path: trimmed,
        line: null,
        column: null,
      };
    }

    return {
      path,
      line,
      column: parsePositiveInteger(columnValue),
    };
  }

  const rangeMatch = trimmed.match(FILE_LOCATION_RANGE_SUFFIX_PATTERN);
  if (rangeMatch) {
    const [, path, startLineValue] = rangeMatch;
    const startLine = parsePositiveInteger(startLineValue);
    if (startLine !== null) {
      return {
        path,
        line: startLine,
        column: null,
      };
    }
  }

  return {
    path: trimmed,
    line: null,
    column: null,
  };
}

function toFileUrl(path: string, line: number | null, column: number | null) {
  const base = path.startsWith("/") ? `file://${path}` : path;
  if (line === null) {
    return base;
  }
  return `${base}#L${line}${column !== null ? `C${column}` : ""}`;
}

export function useFileLinkOpener(
  workspacePath: string | null,
  openTargets: OpenAppTarget[],
  selectedOpenAppId: string,
) {
  const reportOpenError = useCallback(
    (error: unknown, context: Record<string, string | null>) => {
      const message = error instanceof Error ? error.message : String(error);
      Sentry.captureException(
        error instanceof Error ? error : new Error(message),
        {
          tags: {
            feature: "file-link-open",
          },
          extra: context,
        },
      );
      pushErrorToast({
        title: "Couldn’t open file",
        message,
      });
      console.warn("Failed to open file link", { message, ...context });
    },
    [],
  );

  const openFileLink = useCallback(
    async (rawPath: string) => {
      const target = {
        ...DEFAULT_OPEN_TARGET,
        ...(openTargets.find((entry) => entry.id === selectedOpenAppId) ??
          openTargets[0]),
      };
      const fileLocation = parseFileLocation(rawPath);
      const resolvedPath = resolveFilePath(fileLocation.path, workspacePath);
      const openLocation = {
        ...(fileLocation.line !== null ? { line: fileLocation.line } : {}),
        ...(fileLocation.column !== null ? { column: fileLocation.column } : {}),
      };

      try {
        if (!canOpenTarget(target)) {
          return;
        }
        if (target.kind === "finder") {
          await revealItemInDir(resolvedPath);
          return;
        }

        if (target.kind === "command") {
          const command = resolveCommand(target);
          if (!command) {
            return;
          }
          await openWorkspaceIn(resolvedPath, {
            command,
            args: target.args,
            ...openLocation,
          });
          return;
        }

        const appName = resolveAppName(target);
        if (!appName) {
          return;
        }
        await openWorkspaceIn(resolvedPath, {
          appName,
          args: target.args,
          ...openLocation,
        });
      } catch (error) {
        reportOpenError(error, {
          rawPath,
          resolvedPath,
          workspacePath,
          targetId: target.id,
          targetKind: target.kind,
          targetAppName: target.appName ?? null,
          targetCommand: target.command ?? null,
        });
      }
    },
    [openTargets, reportOpenError, selectedOpenAppId, workspacePath],
  );

  const showFileLinkMenu = useCallback(
    async (event: MouseEvent, rawPath: string) => {
      event.preventDefault();
      event.stopPropagation();
      const target = {
        ...DEFAULT_OPEN_TARGET,
        ...(openTargets.find((entry) => entry.id === selectedOpenAppId) ??
          openTargets[0]),
      };
      const fileLocation = parseFileLocation(rawPath);
      const resolvedPath = resolveFilePath(fileLocation.path, workspacePath);
      const appName = resolveAppName(target);
      const command = resolveCommand(target);
      const canOpen = canOpenTarget(target);
      const openLabel =
        target.kind === "finder"
          ? revealInFileManagerLabel()
          : target.kind === "command"
            ? command
              ? `Open in ${target.label}`
              : "Set command in Settings"
            : appName
              ? `Open in ${appName}`
              : "Set app name in Settings";
      const items = [
        await MenuItem.new({
          text: openLabel,
          enabled: canOpen,
          action: async () => {
            await openFileLink(rawPath);
          },
        }),
        ...(target.kind === "finder"
          ? []
          : [
              await MenuItem.new({
                text: revealInFileManagerLabel(),
                action: async () => {
                  try {
                    await revealItemInDir(resolvedPath);
                  } catch (error) {
                    reportOpenError(error, {
                      rawPath,
                      resolvedPath,
                      workspacePath,
                      targetId: target.id,
                      targetKind: "finder",
                      targetAppName: null,
                      targetCommand: null,
                    });
                  }
                },
              }),
            ]),
        await MenuItem.new({
          text: "Download Linked File",
          enabled: false,
        }),
        await MenuItem.new({
          text: "Copy Link",
          action: async () => {
            const link = toFileUrl(resolvedPath, fileLocation.line, fileLocation.column);
            try {
              await navigator.clipboard.writeText(link);
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        }),
        await PredefinedMenuItem.new({ item: "Separator" }),
        await PredefinedMenuItem.new({ item: "Services" }),
      ];

      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [openFileLink, openTargets, reportOpenError, selectedOpenAppId, workspacePath],
  );

  return { openFileLink, showFileLinkMenu };
}
