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

function resolveFilePath(path: string, workspacePath?: string | null) {
  const trimmed = path.trim();
  if (!workspacePath) {
    return trimmed;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) {
    return trimmed;
  }
  const base = workspacePath.replace(/\/+$/, "");
  return `${base}/${trimmed}`;
}

function stripLineSuffix(path: string) {
  const match = path.match(/^(.*?)(?::\d+(?::\d+)?)?$/);
  return match ? match[1] : path;
}

function revealLabel() {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) {
    return "Reveal in Finder";
  }
  if (normalized.includes("win")) {
    return "Show in Explorer";
  }
  return "Reveal in File Manager";
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
      const resolvedPath = resolveFilePath(stripLineSuffix(rawPath), workspacePath);

      try {
        if (target.kind === "finder") {
          await revealItemInDir(resolvedPath);
          return;
        }

        if (target.kind === "command") {
          if (!target.command) {
            return;
          }
          await openWorkspaceIn(resolvedPath, {
            command: target.command,
            args: target.args,
          });
          return;
        }

        const appName = (target.appName || target.label || "").trim();
        if (!appName) {
          return;
        }
        await openWorkspaceIn(resolvedPath, {
          appName,
          args: target.args,
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
      const resolvedPath = resolveFilePath(stripLineSuffix(rawPath), workspacePath);
      const appName = (target.appName || target.label || "").trim();
      const openLabel =
        target.kind === "finder"
          ? revealLabel()
          : target.kind === "command"
            ? `Open in ${target.label}`
            : appName
              ? `Open in ${appName}`
              : "Open Link";
      const items = [
        await MenuItem.new({
          text: openLabel,
          action: async () => {
            await openFileLink(rawPath);
          },
        }),
        ...(target.kind === "finder"
          ? []
          : [
              await MenuItem.new({
                text: revealLabel(),
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
            const link =
              resolvedPath.startsWith("/") ? `file://${resolvedPath}` : resolvedPath;
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
