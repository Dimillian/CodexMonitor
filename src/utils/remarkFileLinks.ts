import { FILE_LINK_SUFFIX_SOURCE, normalizeFileLinkPath } from "./fileLinks";

const FILE_LINK_PROTOCOL = "codex-file:";
const POSIX_OR_RELATIVE_FILE_PATH_PATTERN =
  "(?:\\/[^\\s\\`\"'<>]+|~\\/[^\\s\\`\"'<>]+|\\.{1,2}\\/[^\\s\\`\"'<>]+|[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)+)";
const WINDOWS_ABSOLUTE_FILE_PATH_PATTERN =
  "(?:[A-Za-z]:[\\\\/][^\\s\\`\"'<>]+(?:[\\\\/][^\\s\\`\"'<>]+)*)";
const WINDOWS_UNC_FILE_PATH_PATTERN =
  "(?:\\\\\\\\[^\\s\\`\"'<>]+(?:\\\\[^\\s\\`\"'<>]+)+)";

const FILE_PATH_PATTERN =
  new RegExp(
    `(${POSIX_OR_RELATIVE_FILE_PATH_PATTERN}|${WINDOWS_ABSOLUTE_FILE_PATH_PATTERN}|${WINDOWS_UNC_FILE_PATH_PATTERN})${FILE_LINK_SUFFIX_SOURCE}`,
    "g",
  );
const FILE_PATH_MATCH = new RegExp(`^${FILE_PATH_PATTERN.source}$`);

const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}"]);
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}.]/u;
const URL_SCHEME_PREFIX_PATTERN = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\/?$/;

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

function isPathCandidate(
  value: string,
  leadingText: string,
  previousChar: string,
) {
  if (URL_SCHEME_PREFIX_PATTERN.test(leadingText)) {
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

export function toFileLink(path: string) {
  return `${FILE_LINK_PROTOCOL}${encodeURIComponent(path)}`;
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

    const leadingText = value.slice(0, matchIndex);
    const previousChar = matchIndex > 0 ? value[matchIndex - 1] : "";
    const { path, trailing } = splitTrailingPunctuation(raw);
    if (path && isPathCandidate(path, leadingText, previousChar)) {
      const normalizedPath = normalizeFileLinkPath(path);
      nodes.push({
        type: "link",
        url: toFileLink(normalizedPath),
        children: [{ type: "text", value: path }],
      });
      if (trailing) {
        nodes.push({ type: "text", value: trailing });
      }
      hasLink = true;
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

function isSkippableParent(parentType?: string) {
  return parentType === "link" || parentType === "inlineCode" || parentType === "code";
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

export function isLinkableFilePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!FILE_PATH_MATCH.test(trimmed)) {
    return false;
  }
  return isPathCandidate(trimmed, "", "");
}

export function isFileLinkUrl(url: string) {
  return url.startsWith(FILE_LINK_PROTOCOL);
}

export function decodeFileLink(url: string) {
  return decodeURIComponent(url.slice(FILE_LINK_PROTOCOL.length));
}
