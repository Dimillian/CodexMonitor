import { SETTINGS_ROUTE_SECTION_IDS } from "@settings/components/settingsTypes";
import { parseFileLocation } from "../../../utils/fileLinks";

export const WORKSPACE_MOUNT_PREFIX = "/workspace/";
export const WORKSPACES_MOUNT_PREFIX = "/workspaces/";
export const WORKSPACE_ROUTE_PREFIXES = [
  WORKSPACE_MOUNT_PREFIX,
  WORKSPACES_MOUNT_PREFIX,
] as const;

const LOCAL_WORKSPACE_ROUTE_TAIL_SEGMENTS = {
  reviews: new Set(["overview"]),
  settings: new Set(SETTINGS_ROUTE_SECTION_IDS),
} as const;

export type WorkspaceRouteMatch = {
  prefix: (typeof WORKSPACE_ROUTE_PREFIXES)[number];
  segments: string[];
};

function stripNonLineUrlSuffix(path: string) {
  const queryIndex = path.indexOf("?");
  const hashIndex = path.indexOf("#");
  const boundaryIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);
  return boundaryIndex === -1 ? path : path.slice(0, boundaryIndex);
}

function normalizeWorkspaceRoutePath(rawPath: string) {
  return stripNonLineUrlSuffix(parseFileLocation(rawPath).path.trim().replace(/\\/g, "/"));
}

export function splitWorkspaceRoutePath(path: string): WorkspaceRouteMatch | null {
  const normalizedPath = path.replace(/\\/g, "/");
  if (normalizedPath.startsWith(WORKSPACE_MOUNT_PREFIX)) {
    return {
      prefix: WORKSPACE_MOUNT_PREFIX,
      segments: normalizedPath.slice(WORKSPACE_MOUNT_PREFIX.length).split("/").filter(Boolean),
    };
  }
  if (normalizedPath.startsWith(WORKSPACES_MOUNT_PREFIX)) {
    return {
      prefix: WORKSPACES_MOUNT_PREFIX,
      segments: normalizedPath
        .slice(WORKSPACES_MOUNT_PREFIX.length)
        .split("/")
        .filter(Boolean),
    };
  }
  return null;
}

function getLocalWorkspaceRouteInfo(rawPath: string) {
  const match = splitWorkspaceRoutePath(normalizeWorkspaceRoutePath(rawPath));
  if (!match) {
    return null;
  }
  return {
    routeSegment:
      match.prefix === WORKSPACE_MOUNT_PREFIX
        ? match.segments[0] ?? null
        : match.segments[1] ?? null,
    tailSegments:
      match.prefix === WORKSPACE_MOUNT_PREFIX
        ? match.segments.slice(1)
        : match.segments.slice(2),
  };
}

export function isKnownLocalWorkspaceRoutePath(rawPath: string) {
  const routeInfo = getLocalWorkspaceRouteInfo(rawPath);
  if (!routeInfo?.routeSegment) {
    return false;
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      LOCAL_WORKSPACE_ROUTE_TAIL_SEGMENTS,
      routeInfo.routeSegment,
    )
  ) {
    return false;
  }
  if (routeInfo.tailSegments.length === 0) {
    return true;
  }
  if (routeInfo.tailSegments.length !== 1) {
    return false;
  }
  const allowedTailSegments =
    LOCAL_WORKSPACE_ROUTE_TAIL_SEGMENTS[
      routeInfo.routeSegment as keyof typeof LOCAL_WORKSPACE_ROUTE_TAIL_SEGMENTS
    ];
  return (allowedTailSegments as ReadonlySet<string>).has(routeInfo.tailSegments[0]);
}
