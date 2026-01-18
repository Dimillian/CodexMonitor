import { useCallback } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { openWorkspaceIn } from "../../../services/tauri";
import { getStoredOpenAppId } from "../../app/utils/openApp";
import type { OpenAppId } from "../../app/constants";

type OpenTarget = {
  id: OpenAppId;
  appName?: string;
};

const OPEN_TARGETS: Record<OpenTarget["id"], OpenTarget> = {
  vscode: { id: "vscode", appName: "Visual Studio Code" },
  cursor: { id: "cursor", appName: "Cursor" },
  zed: { id: "zed", appName: "Zed" },
  ghostty: { id: "ghostty", appName: "Ghostty" },
  antigravity: { id: "antigravity", appName: "Antigravity" },
  finder: { id: "finder" },
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

export function useFileLinkOpener(workspacePath?: string | null) {
  return useCallback(
    async (rawPath: string) => {
      const openAppId = getStoredOpenAppId();
      const target = OPEN_TARGETS[openAppId] ?? OPEN_TARGETS.vscode;
      const resolvedPath = resolveFilePath(stripLineSuffix(rawPath), workspacePath);

      if (target.id === "finder") {
        await revealItemInDir(resolvedPath);
        return;
      }

      if (target.appName) {
        await openWorkspaceIn(resolvedPath, target.appName);
      }
    },
    [workspacePath],
  );
}
