import { joinWorkspacePath } from "../../../utils/platformPaths";
import {
  isKnownLocalWorkspaceRoutePath,
  splitWorkspaceRoutePath,
  WORKSPACE_MOUNT_PREFIX,
} from "./workspaceRoutePaths";

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/");
}

function trimTrailingSeparators(path: string) {
  return path.replace(/[\\/]+$/, "");
}

function pathBaseName(path: string) {
  return trimTrailingSeparators(normalizePathSeparators(path.trim()))
    .split("/")
    .filter(Boolean)
    .pop() ?? "";
}

export function resolveMountedWorkspacePath(
  path: string,
  workspacePath?: string | null,
) {
  const trimmed = path.trim();
  if (isKnownLocalWorkspaceRoutePath(trimmed)) {
    return null;
  }
  const trimmedWorkspace = workspacePath?.trim() ?? "";
  if (!trimmedWorkspace) {
    return null;
  }

  const normalizedPath = normalizePathSeparators(trimmed);
  const workspaceName = pathBaseName(trimmedWorkspace);
  if (!workspaceName) {
    return null;
  }

  const resolveFromSegments = (segments: string[], allowDirectRelative: boolean) => {
    if (segments.length === 0) {
      return trimTrailingSeparators(trimmedWorkspace);
    }
    const workspaceIndex = segments.findIndex((segment) => segment === workspaceName);
    if (workspaceIndex >= 0) {
      const relativePath = segments.slice(workspaceIndex + 1).join("/");
      return relativePath
        ? joinWorkspacePath(trimmedWorkspace, relativePath)
        : trimTrailingSeparators(trimmedWorkspace);
    }
    if (allowDirectRelative) {
      return joinWorkspacePath(trimmedWorkspace, segments.join("/"));
    }
    return null;
  };

  const routeMatch = splitWorkspaceRoutePath(normalizedPath);
  if (!routeMatch) {
    return null;
  }
  return resolveFromSegments(
    routeMatch.segments,
    routeMatch.prefix === WORKSPACE_MOUNT_PREFIX,
  );
}
