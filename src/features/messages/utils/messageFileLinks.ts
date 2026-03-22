import {
  FILE_LINK_SUFFIX_SOURCE,
  type ParsedFileLocation,
  formatFileLocation,
  normalizeFileLinkPath,
  parseFileLocation,
  parseFileUrlLocation,
} from "../../../utils/fileLinks";
import { resolveMountedWorkspacePath } from "./mountedWorkspacePaths";
import {
  isKnownLocalWorkspaceRoutePath,
  splitWorkspaceRoutePath,
  WORKSPACE_MOUNT_PREFIX,
  WORKSPACE_ROUTE_PREFIXES,
} from "./workspaceRoutePaths";

export type ParsedFileReference = {
  fullPath: string;
  fileName: string;
  lineLabel: string | null;
  parentPath: string | null;
};

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

const FILE_LINK_PROTOCOL = "codex-file:";
const POSIX_OR_RELATIVE_FILE_PATH_PATTERN =
  "(?:\\/[^\\s\\`\"'<>]+|~\\/[^\\s\\`\"'<>]+|\\.{1,2}\\/[^\\s\\`\"'<>]+|[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)+)";
const WINDOWS_ABSOLUTE_FILE_PATH_PATTERN =
  "(?:[A-Za-z]:[\\\\/][^\\s\\`\"'<>]+(?:[\\\\/][^\\s\\`\"'<>]+)*)";
const WINDOWS_UNC_FILE_PATH_PATTERN =
  "(?:\\\\\\\\[^\\s\\`\"'<>]+(?:\\\\[^\\s\\`\"'<>]+)+)";

const FILE_PATH_PATTERN = new RegExp(
  `(${POSIX_OR_RELATIVE_FILE_PATH_PATTERN}|${WINDOWS_ABSOLUTE_FILE_PATH_PATTERN}|${WINDOWS_UNC_FILE_PATH_PATTERN})${FILE_LINK_SUFFIX_SOURCE}`,
  "g",
);
const FILE_PATH_MATCH = new RegExp(`^${FILE_PATH_PATTERN.source}$`);

const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}.]/u;
const URL_SCHEME_PREFIX_PATTERN = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\/?$/;
const EMBEDDED_URL_SCHEME_PATTERN = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S*$/;
const PATH_CANDIDATE_PREFIX_BOUNDARY_PATTERN = /[\s<>"'()`[\]{}]/u;
const LIKELY_LOCAL_ABSOLUTE_PATH_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/opt/",
  "/etc/",
  "/private/",
  "/Volumes/",
  "/mnt/",
  "/usr/",
  "/workspace/",
  "/workspaces/",
  "/root/",
  "/srv/",
  "/data/",
];

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/");
}

function trimTrailingPathSeparators(path: string) {
  return path.replace(/\/+$/, "");
}

function isWindowsAbsolutePath(path: string) {
  return /^[A-Za-z]:\//.test(path);
}

function isAbsolutePath(path: string) {
  return path.startsWith("/") || isWindowsAbsolutePath(path);
}

function extractPathRoot(path: string) {
  if (isWindowsAbsolutePath(path)) {
    return path.slice(0, 2).toLowerCase();
  }
  if (path.startsWith("/")) {
    return "/";
  }
  return "";
}

function splitAbsolutePath(path: string) {
  const root = extractPathRoot(path);
  if (!root) {
    return null;
  }
  const withoutRoot =
    root === "/" ? path.slice(1) : path.slice(2).replace(/^\/+/, "");
  return {
    root,
    segments: withoutRoot.split("/").filter(Boolean),
  };
}

function toRelativePath(fromPath: string, toPath: string) {
  const fromAbsolute = splitAbsolutePath(fromPath);
  const toAbsolute = splitAbsolutePath(toPath);
  if (!fromAbsolute || !toAbsolute || fromAbsolute.root !== toAbsolute.root) {
    return null;
  }

  const caseInsensitive = fromAbsolute.root !== "/";
  let commonLength = 0;
  while (
    commonLength < fromAbsolute.segments.length &&
    commonLength < toAbsolute.segments.length &&
    (caseInsensitive
      ? fromAbsolute.segments[commonLength].toLowerCase() ===
        toAbsolute.segments[commonLength].toLowerCase()
      : fromAbsolute.segments[commonLength] === toAbsolute.segments[commonLength])
  ) {
    commonLength += 1;
  }

  const backtrack = new Array(fromAbsolute.segments.length - commonLength).fill("..");
  const forward = toAbsolute.segments.slice(commonLength);
  return [...backtrack, ...forward].join("/");
}

export function relativeDisplayPath(path: string, workspacePath?: string | null) {
  const normalizedPath = trimTrailingPathSeparators(normalizePathSeparators(path.trim()));
  if (!workspacePath) {
    return normalizedPath;
  }
  const normalizedWorkspace = trimTrailingPathSeparators(
    normalizePathSeparators(workspacePath.trim()),
  );
  if (!normalizedWorkspace) {
    return normalizedPath;
  }
  if (!isAbsolutePath(normalizedPath) || !isAbsolutePath(normalizedWorkspace)) {
    return normalizedPath;
  }

  const relative = toRelativePath(normalizedWorkspace, normalizedPath);
  if (relative === null) {
    return normalizedPath;
  }
  if (relative.length === 0) {
    const segments = normalizedPath.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : normalizedPath;
  }
  return relative;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function stripPathLineSuffix(value: string) {
  return parseFileLocation(value).path;
}

function hasLikelyFileName(path: string) {
  const normalizedPath = stripPathLineSuffix(path).replace(/[\\/]+$/, "");
  const lastSegment = normalizedPath.split(/[\\/]/).pop() ?? "";
  if (!lastSegment || lastSegment === "." || lastSegment === "..") {
    return false;
  }
  if (lastSegment.startsWith(".") && lastSegment.length > 1) {
    return true;
  }
  return lastSegment.includes(".");
}

function hasLikelyLocalAbsolutePrefix(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  return LIKELY_LOCAL_ABSOLUTE_PATH_PREFIXES.some((prefix) =>
    normalizedPath.startsWith(prefix),
  );
}

function hasLikelyWorkspaceNameSegment(segment: string) {
  return /[A-Z]/.test(segment) || /[._-]/.test(segment);
}

function pathSegmentCount(path: string) {
  return path.split("/").filter(Boolean).length;
}

function isPathCandidate(
  value: string,
  leadingText: string,
  previousChar: string,
) {
  if (
    URL_SCHEME_PREFIX_PATTERN.test(leadingText) ||
    EMBEDDED_URL_SCHEME_PATTERN.test(leadingText)
  ) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) {
    return !previousChar || !LETTER_OR_NUMBER_PATTERN.test(previousChar);
  }
  if (!value.includes("/")) {
    return false;
  }
  if (value.startsWith("//")) {
    return false;
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    if (
      value.startsWith("/") &&
      previousChar &&
      LETTER_OR_NUMBER_PATTERN.test(previousChar)
    ) {
      return false;
    }
    return true;
  }
  if (value.startsWith("~/")) {
    return true;
  }
  const lastSegment = value.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

function splitTrailingPunctuation(value: string) {
  let end = value.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(value[end - 1])) {
    end -= 1;
  }
  return {
    path: value.slice(0, end),
    trailing: value.slice(end),
  };
}

function getLeadingPathCandidateContext(value: string, matchIndex: number) {
  let startIndex = matchIndex;
  while (startIndex > 0) {
    const previousChar = value[startIndex - 1];
    if (PATH_CANDIDATE_PREFIX_BOUNDARY_PATTERN.test(previousChar)) {
      break;
    }
    startIndex -= 1;
  }
  return value.slice(startIndex, matchIndex);
}

function isSkippableParent(parentType?: string) {
  return parentType === "link" || parentType === "inlineCode" || parentType === "code";
}

function isLikelyMountedWorkspaceFilePath(
  path: string,
  workspacePath?: string | null,
) {
  if (isKnownLocalWorkspaceRoutePath(path)) {
    return false;
  }
  if (resolveMountedWorkspacePath(path, workspacePath) !== null) {
    return true;
  }

  const mountedPath = splitWorkspaceRoutePath(path);
  return Boolean(
    mountedPath?.prefix === WORKSPACE_MOUNT_PREFIX &&
      mountedPath.segments.length >= 2 &&
      hasLikelyWorkspaceNameSegment(mountedPath.segments[0]),
  );
}

function usesAbsolutePathDepthFallback(
  path: string,
  workspacePath?: string | null,
) {
  const normalizedPath = path.replace(/\\/g, "/");
  if (
    WORKSPACE_ROUTE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) &&
    !isLikelyMountedWorkspaceFilePath(normalizedPath, workspacePath)
  ) {
    return false;
  }
  return hasLikelyLocalAbsolutePrefix(normalizedPath) && pathSegmentCount(normalizedPath) >= 3;
}

function isLikelyFileHref(
  url: string,
  workspacePath?: string | null,
) {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("file://")) {
    return true;
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return false;
  }
  if (trimmed.startsWith("thread://") || trimmed.startsWith("/thread/")) {
    return false;
  }
  if (trimmed.startsWith("#")) {
    return false;
  }

  const parsedLocation = parseFileLocation(trimmed);
  const pathOnly = parsedLocation.path.trim();
  if (/[?#]/.test(pathOnly)) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(pathOnly) || pathOnly.startsWith("\\\\")) {
    return true;
  }
  if (pathOnly.startsWith("/")) {
    if (parsedLocation.line !== null) {
      const normalizedPath = pathOnly.replace(/\\/g, "/");
      if (
        WORKSPACE_ROUTE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
      ) {
        return isLikelyMountedWorkspaceFilePath(normalizedPath, workspacePath);
      }
      return true;
    }
    if (hasLikelyFileName(pathOnly)) {
      return true;
    }
    return usesAbsolutePathDepthFallback(pathOnly, workspacePath);
  }
  if (parsedLocation.line !== null) {
    return true;
  }
  if (pathOnly.startsWith("~/")) {
    return true;
  }
  if (pathOnly.startsWith("./") || pathOnly.startsWith("../")) {
    return parsedLocation.line !== null || hasLikelyFileName(pathOnly);
  }
  if (hasLikelyFileName(pathOnly)) {
    return pathSegmentCount(pathOnly) >= 3;
  }
  return false;
}

export function parseInlineFileTarget(value: string): ParsedFileLocation | null {
  const normalizedPath = normalizeFileLinkPath(value).trim();
  if (!normalizedPath || isKnownLocalWorkspaceRoutePath(normalizedPath)) {
    return null;
  }
  if (!FILE_PATH_MATCH.test(normalizedPath)) {
    return null;
  }
  if (!isPathCandidate(normalizedPath, "", "")) {
    return null;
  }
  return parseFileLocation(normalizedPath);
}

export function formatParsedFileLocation(target: ParsedFileLocation) {
  return formatFileLocation(target.path, target.line, target.column);
}

export function parseFileLinkUrl(url: string): ParsedFileLocation | null {
  if (!url.startsWith(FILE_LINK_PROTOCOL)) {
    return null;
  }
  const decoded = safeDecodeURIComponent(url.slice(FILE_LINK_PROTOCOL.length));
  return decoded ? parseFileLocation(decoded) : null;
}

export function toFileLink(target: ParsedFileLocation | string) {
  const value =
    typeof target === "string" ? normalizeFileLinkPath(target) : formatParsedFileLocation(target);
  return `${FILE_LINK_PROTOCOL}${encodeURIComponent(value)}`;
}

function linkifyText(value: string) {
  FILE_PATH_PATTERN.lastIndex = 0;
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;
  let hasLink = false;

  for (const match of value.matchAll(FILE_PATH_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const raw = match[0];
    if (matchIndex > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, matchIndex) });
    }

    const leadingText = getLeadingPathCandidateContext(value, matchIndex);
    const previousChar = matchIndex > 0 ? value[matchIndex - 1] : "";
    const { path, trailing } = splitTrailingPunctuation(raw);
    if (path && isPathCandidate(path, leadingText, previousChar)) {
      const parsedTarget = parseInlineFileTarget(path);
      if (parsedTarget) {
        nodes.push({
          type: "link",
          url: toFileLink(parsedTarget),
          children: [{ type: "text", value: path }],
        });
        if (trailing) {
          nodes.push({ type: "text", value: trailing });
        }
        hasLink = true;
      } else {
        nodes.push({ type: "text", value: raw });
      }
    } else {
      nodes.push({ type: "text", value: raw });
    }

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return hasLink ? nodes : null;
}

function walk(node: MarkdownNode, parentType?: string) {
  if (!node.children) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (
      child.type === "text" &&
      typeof child.value === "string" &&
      !isSkippableParent(parentType)
    ) {
      const nextNodes = linkifyText(child.value);
      if (nextNodes) {
        node.children.splice(index, 1, ...nextNodes);
        index += nextNodes.length - 1;
        continue;
      }
    }
    walk(child, child.type);
  }
}

export function remarkFileLinks() {
  return (tree: MarkdownNode) => {
    walk(tree);
  };
}

export function isFileLinkUrl(url: string) {
  return url.startsWith(FILE_LINK_PROTOCOL);
}

export function resolveMessageFileHref(
  url: string,
  workspacePath?: string | null,
): ParsedFileLocation | null {
  const fileUrlTarget = parseFileUrlLocation(url);
  if (fileUrlTarget) {
    return fileUrlTarget;
  }

  const rawCandidates = [url, safeDecodeURIComponent(url)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const seenCandidates = new Set<string>();
  for (const candidate of rawCandidates) {
    if (seenCandidates.has(candidate) || !isLikelyFileHref(candidate, workspacePath)) {
      continue;
    }
    seenCandidates.add(candidate);

    const parsedTarget = parseInlineFileTarget(candidate);
    if (!parsedTarget) {
      continue;
    }

    const decodedPath = safeDecodeURIComponent(parsedTarget.path);
    return {
      path: decodedPath ?? parsedTarget.path,
      line: parsedTarget.line,
      column: parsedTarget.column,
    };
  }

  return null;
}

export function describeFileTarget(
  target: ParsedFileLocation,
  workspacePath?: string | null,
): ParsedFileReference {
  const fullPath = formatParsedFileLocation(target);
  const displayPath = relativeDisplayPath(target.path, workspacePath);
  const normalizedPath = trimTrailingPathSeparators(displayPath) || displayPath;
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  const fallbackFile = normalizedPath || fullPath;
  const fileName =
    lastSlashIndex >= 0 ? normalizedPath.slice(lastSlashIndex + 1) : fallbackFile;
  const rawParentPath =
    lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : "";
  return {
    fullPath,
    fileName,
    lineLabel:
      target.line === null
        ? null
        : `${target.line}${target.column !== null ? `:${target.column}` : ""}`,
    parentPath: rawParentPath || (normalizedPath.startsWith("/") ? "/" : null),
  };
}
