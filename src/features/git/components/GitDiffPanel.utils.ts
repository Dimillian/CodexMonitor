import { isAbsolutePath as isAbsolutePathForPlatform } from "../../../utils/platformPaths";
export { isGitRootNotFound, isMissingRepo } from "../utils/repoErrors";

export const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 6];

export function splitPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) {
    return { name: path, dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

export function splitNameAndExtension(name: string) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { base: name, extension: "" };
  }
  return {
    base: name.slice(0, lastDot),
    extension: name.slice(lastDot + 1).toLowerCase(),
  };
}

export function normalizeRootPath(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function normalizeSegment(segment: string) {
  return /^[A-Za-z]:$/.test(segment) ? segment.toLowerCase() : segment;
}

export function getRelativePathWithin(base: string, target: string) {
  const normalizedBase = normalizeRootPath(base);
  const normalizedTarget = normalizeRootPath(target);
  if (!normalizedBase || !normalizedTarget) {
    return null;
  }
  const baseSegments = normalizedBase.split("/").filter(Boolean);
  const targetSegments = normalizedTarget.split("/").filter(Boolean);
  if (baseSegments.length > targetSegments.length) {
    return null;
  }
  for (let index = 0; index < baseSegments.length; index += 1) {
    if (normalizeSegment(baseSegments[index]) !== normalizeSegment(targetSegments[index])) {
      return null;
    }
  }
  return targetSegments.slice(baseSegments.length).join("/");
}

export function joinRootAndPath(root: string, relativePath: string) {
  const normalizedRoot = normalizeRootPath(root);
  if (!normalizedRoot) {
    return relativePath;
  }
  const normalizedPath = relativePath.replace(/^\/+/, "");
  return `${normalizedRoot}/${normalizedPath}`;
}

export function resolveRootPath(
  root: string | null | undefined,
  workspacePath: string | null | undefined,
) {
  const normalized = normalizeRootPath(root);
  if (!normalized) {
    return "";
  }
  if (workspacePath && !isAbsolutePathForPlatform(normalized)) {
    return joinRootAndPath(workspacePath, normalized);
  }
  return normalized;
}

export function getFileName(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

export function getStatusSymbol(status: string) {
  switch (status) {
    case "A":
      return "+";
    case "M":
      return "M";
    case "D":
      return "-";
    case "R":
      return "R";
    case "T":
      return "T";
    default:
      return "?";
  }
}

export function getStatusClass(status: string) {
  switch (status) {
    case "A":
      return "diff-icon-added";
    case "M":
      return "diff-icon-modified";
    case "D":
      return "diff-icon-deleted";
    case "R":
      return "diff-icon-renamed";
    case "T":
      return "diff-icon-typechange";
    default:
      return "diff-icon-unknown";
  }
}

export function hasPushSyncConflict(pushError: string | null | undefined) {
  if (!pushError) {
    return false;
  }
  const lower = pushError.toLowerCase();
  return (
    lower.includes("non-fast-forward") ||
    lower.includes("fetch first") ||
    lower.includes("tip of your current branch is behind") ||
    lower.includes("updates were rejected")
  );
}

export function getGitHubBaseUrl(gitRemoteUrl: string | null | undefined) {
  if (!gitRemoteUrl) {
    return null;
  }
  const trimmed = gitRemoteUrl.trim();
  if (!trimmed) {
    return null;
  }
  let path = "";
  if (trimmed.startsWith("git@github.com:")) {
    path = trimmed.slice("git@github.com:".length);
  } else if (trimmed.startsWith("ssh://git@github.com/")) {
    path = trimmed.slice("ssh://git@github.com/".length);
  } else if (trimmed.includes("github.com/")) {
    path = trimmed.split("github.com/")[1] ?? "";
  }
  path = path.replace(/\.git$/, "").replace(/\/$/, "");
  if (!path) {
    return null;
  }
  return `https://github.com/${path}`;
}
