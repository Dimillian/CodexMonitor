import type { OpenAppTarget } from "../../types";
import {
  fileManagerName,
  isMacPlatform,
  isWindowsPlatform,
} from "../../utils/platformPaths";

export const OPEN_APP_STORAGE_KEY = "open-workspace-app";
export const DEFAULT_OPEN_APP_ID = isWindowsPlatform() ? "finder" : "vscode";

export type OpenAppId = string;

export const DEFAULT_OPEN_APP_TARGETS: OpenAppTarget[] = isMacPlatform()
  ? [
      {
        id: "vscode",
        label: "VS Code",
        kind: "app",
        appName: "Visual Studio Code",
        args: [],
      },
      {
        id: "cursor",
        label: "Cursor",
        kind: "app",
        appName: "Cursor",
        args: [],
      },
      {
        id: "zed",
        label: "Zed",
        kind: "app",
        appName: "Zed",
        args: [],
      },
      {
        id: "ghostty",
        label: "Ghostty",
        kind: "app",
        appName: "Ghostty",
        args: [],
      },
      {
        id: "antigravity",
        label: "Antigravity",
        kind: "app",
        appName: "Antigravity",
        args: [],
      },
      {
        id: "finder",
        label: fileManagerName(),
        kind: "finder",
        args: [],
      },
    ]
  : [
      {
        id: "vscode",
        label: "VS Code",
        kind: "command",
        command: "code",
        args: [],
      },
      {
        id: "cursor",
        label: "Cursor",
        kind: "command",
        command: "cursor",
        args: [],
      },
      {
        id: "zed",
        label: "Zed",
        kind: "command",
        command: "zed",
        args: [],
      },
      {
        id: "ghostty",
        label: "Ghostty",
        kind: "command",
        command: "ghostty",
        args: [],
      },
      {
        id: "antigravity",
        label: "Antigravity",
        kind: "command",
        command: "antigravity",
        args: [],
      },
      {
        id: "finder",
        label: fileManagerName(),
        kind: "finder",
        args: [],
      },
    ];
