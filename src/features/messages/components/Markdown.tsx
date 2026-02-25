import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  decodeFileLink,
  isFileLinkUrl,
  isLinkableFilePath,
  remarkFileLinks,
  toFileLink,
} from "../../../utils/remarkFileLinks";

type MarkdownProps = {
  value: string;
  className?: string;
  codeBlock?: boolean;
  codeBlockStyle?: "default" | "message";
  codeBlockCopyUseModifier?: boolean;
  showFilePath?: boolean;
  workspacePath?: string | null;
  onOpenFileLink?: (path: string) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
};

type CodeBlockProps = {
  className?: string;
  value: string;
  copyUseModifier: boolean;
};

type PreProps = {
  node?: {
    tagName?: string;
    children?: Array<{
      tagName?: string;
      properties?: { className?: string[] | string };
      children?: Array<{ value?: string }>;
    }>;
  };
  children?: ReactNode;
  copyUseModifier: boolean;
};

type LinkBlockProps = {
  urls: string[];
};

type ParsedFileReference = {
  fullPath: string;
  fileName: string;
  lineLabel: string | null;
  parentPath: string | null;
};

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
  if (!fromAbsolute || !toAbsolute) {
    return null;
  }
  if (fromAbsolute.root !== toAbsolute.root) {
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

function relativeDisplayPath(path: string, workspacePath?: string | null) {
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

function extractLanguageTag(className?: string) {
  if (!className) {
    return null;
  }
  const match = className.match(/language-([\w-]+)/i);
  if (!match) {
    return null;
  }
  return match[1];
}

function extractCodeFromPre(node?: PreProps["node"]) {
  const codeNode = node?.children?.find((child) => child.tagName === "code");
  const className = codeNode?.properties?.className;
  const normalizedClassName = Array.isArray(className)
    ? className.join(" ")
    : className;
  const value =
    codeNode?.children?.map((child) => child.value ?? "").join("") ?? "";
  return {
    className: normalizedClassName,
    value: value.replace(/\n$/, ""),
  };
}

function normalizeUrlLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const withoutBullet = trimmed.replace(/^(?:[-*]|\d+\.)\s+/, "");
  if (!/^https?:\/\/\S+$/i.test(withoutBullet)) {
    return null;
  }
  return withoutBullet;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function safeDecodeFileLink(url: string) {
  try {
    return decodeFileLink(url);
  } catch {
    return null;
  }
}

const FILE_LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
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

function stripPathLineSuffix(value: string) {
  return value.replace(FILE_LINE_SUFFIX_PATTERN, "");
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

function pathSegmentCount(path: string) {
  return path.split("/").filter(Boolean).length;
}

function isLikelyFileHref(url: string) {
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
  if (/[?#]/.test(trimmed)) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    return true;
  }
  if (trimmed.startsWith("/")) {
    if (FILE_LINE_SUFFIX_PATTERN.test(trimmed)) {
      return true;
    }
    if (hasLikelyFileName(trimmed)) {
      return true;
    }
    return hasLikelyLocalAbsolutePrefix(trimmed) && pathSegmentCount(trimmed) >= 3;
  }
  if (FILE_LINE_SUFFIX_PATTERN.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("~/")) {
    return true;
  }
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return FILE_LINE_SUFFIX_PATTERN.test(trimmed) || hasLikelyFileName(trimmed);
  }
  if (hasLikelyFileName(trimmed)) {
    return pathSegmentCount(trimmed) >= 3;
  }
  return false;
}

function toPathFromFileUrl(url: string) {
  if (!url.toLowerCase().startsWith("file://")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const decodedPath = safeDecodeURIComponent(parsed.pathname) ?? parsed.pathname;
    let path = decodedPath;
    if (parsed.host && parsed.host !== "localhost") {
      const normalizedPath = decodedPath.startsWith("/")
        ? decodedPath
        : `/${decodedPath}`;
      path = `//${parsed.host}${normalizedPath}`;
    }
    if (/^\/[A-Za-z]:\//.test(path)) {
      path = path.slice(1);
    }
    return path;
  } catch {
    const manualPath = url.slice("file://".length).trim();
    if (!manualPath) {
      return null;
    }
    return safeDecodeURIComponent(manualPath) ?? manualPath;
  }
}

function extractUrlLines(value: string) {
  const lines = value.split(/\r?\n/);
  const urls = lines
    .map((line) => normalizeUrlLine(line))
    .filter((line): line is string => Boolean(line));
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return null;
  }
  if (urls.length !== nonEmptyLines.length) {
    return null;
  }
  return urls;
}

function normalizeListIndentation(value: string) {
  const lines = value.split(/\r?\n/);
  let inFence = false;
  let activeOrderedItem = false;
  let orderedBaseIndent = 4;
  let orderedIndentOffset: number | null = null;

  const countLeadingSpaces = (line: string) =>
    line.match(/^\s*/)?.[0].length ?? 0;
  const spaces = (count: number) => " ".repeat(Math.max(0, count));
  const normalized = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      inFence = !inFence;
      activeOrderedItem = false;
      orderedIndentOffset = null;
      return line;
    }
    if (inFence) {
      return line;
    }
    if (!line.trim()) {
      return line;
    }

    const orderedMatch = line.match(/^(\s*)\d+\.\s+/);
    if (orderedMatch) {
      const rawIndent = orderedMatch[1].length;
      const normalizedIndent =
        rawIndent > 0 && rawIndent < 4 ? 4 : rawIndent;
      activeOrderedItem = true;
      orderedBaseIndent = normalizedIndent + 4;
      orderedIndentOffset = null;
      if (normalizedIndent !== rawIndent) {
        return `${spaces(normalizedIndent)}${line.trimStart()}`;
      }
      return line;
    }

    const bulletMatch = line.match(/^(\s*)([-*+])\s+/);
    if (bulletMatch) {
      const rawIndent = bulletMatch[1].length;
      let targetIndent = rawIndent;

      if (!activeOrderedItem && rawIndent > 0 && rawIndent < 4) {
        targetIndent = 4;
      }

      if (activeOrderedItem) {
        if (orderedIndentOffset === null && rawIndent < orderedBaseIndent) {
          orderedIndentOffset = orderedBaseIndent - rawIndent;
        }
        if (orderedIndentOffset !== null) {
          const adjustedIndent = rawIndent + orderedIndentOffset;
          if (adjustedIndent <= orderedBaseIndent + 12) {
            targetIndent = adjustedIndent;
          }
        }
      }

      if (targetIndent !== rawIndent) {
        return `${spaces(targetIndent)}${line.trimStart()}`;
      }
      return line;
    }

    const leadingSpaces = countLeadingSpaces(line);
    if (activeOrderedItem && leadingSpaces < orderedBaseIndent) {
      activeOrderedItem = false;
      orderedIndentOffset = null;
    }
    return line;
  });
  return normalized.join("\n");
}

function LinkBlock({ urls }: LinkBlockProps) {
  return (
    <div className="markdown-linkblock">
      {urls.map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openUrl(url);
          }}
        >
          {url}
        </a>
      ))}
    </div>
  );
}

function parseFileReference(
  rawPath: string,
  workspacePath?: string | null,
): ParsedFileReference {
  const trimmed = rawPath.trim();
  const lineMatch = trimmed.match(/^(.*?):(\d+(?::\d+)?)$/);
  const pathWithoutLine = (lineMatch?.[1] ?? trimmed).trim();
  const lineLabel = lineMatch?.[2] ?? null;
  const displayPath = relativeDisplayPath(pathWithoutLine, workspacePath);
  const normalizedPath = trimTrailingPathSeparators(displayPath) || displayPath;
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  const fallbackFile = normalizedPath || trimmed;
  const fileName =
    lastSlashIndex >= 0 ? normalizedPath.slice(lastSlashIndex + 1) : fallbackFile;
  const rawParentPath =
    lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : "";
  const parentPath = rawParentPath || (normalizedPath.startsWith("/") ? "/" : null);

  return {
    fullPath: trimmed,
    fileName,
    lineLabel,
    parentPath,
  };
}

function FileReferenceLink({
  href,
  rawPath,
  showFilePath,
  workspacePath,
  onClick,
  onContextMenu,
}: {
  href: string;
  rawPath: string;
  showFilePath: boolean;
  workspacePath?: string | null;
  onClick: (event: React.MouseEvent, path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
}) {
  const { fullPath, fileName, lineLabel, parentPath } = parseFileReference(
    rawPath,
    workspacePath,
  );
  return (
    <a
      href={href}
      className="message-file-link"
      title={fullPath}
      onClick={(event) => onClick(event, rawPath)}
      onContextMenu={(event) => onContextMenu(event, rawPath)}
    >
      <span className="message-file-link-name">{fileName}</span>
      {lineLabel ? <span className="message-file-link-line">L{lineLabel}</span> : null}
      {showFilePath && parentPath ? (
        <span className="message-file-link-path">{parentPath}</span>
      ) : null}
    </a>
  );
}

function CodeBlock({ className, value, copyUseModifier }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const languageTag = extractLanguageTag(className);
  const languageLabel = languageTag ?? "Code";
  const fencedValue = `\`\`\`${languageTag ?? ""}\n${value}\n\`\`\``;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    try {
      const shouldFence = copyUseModifier ? event.altKey : true;
      const nextValue = shouldFence ? fencedValue : value;
      await navigator.clipboard.writeText(nextValue);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // No-op: clipboard errors can occur in restricted contexts.
    }
  };

  return (
    <div className="markdown-codeblock">
      <div className="markdown-codeblock-header">
        <span className="markdown-codeblock-language">{languageLabel}</span>
        <button
          type="button"
          className={`ghost markdown-codeblock-copy${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          aria-label="Copy code block"
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={className}>{value}</code>
      </pre>
    </div>
  );
}

function PreBlock({ node, children, copyUseModifier }: PreProps) {
  const { className, value } = extractCodeFromPre(node);
  if (!className && !value && children) {
    return <pre>{children}</pre>;
  }
  const urlLines = extractUrlLines(value);
  if (urlLines) {
    return <LinkBlock urls={urlLines} />;
  }
  const isSingleLine = !value.includes("\n");
  if (isSingleLine) {
    return (
      <pre className="markdown-codeblock-single">
        <code className={className}>{value}</code>
      </pre>
    );
  }
  return (
    <CodeBlock
      className={className}
      value={value}
      copyUseModifier={copyUseModifier}
    />
  );
}

export function Markdown({
  value,
  className,
  codeBlock,
  codeBlockStyle = "default",
  codeBlockCopyUseModifier = false,
  showFilePath = true,
  workspacePath = null,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: MarkdownProps) {
  const normalizedValue = codeBlock ? value : normalizeListIndentation(value);
  const content = codeBlock
    ? `\`\`\`\n${normalizedValue}\n\`\`\``
    : normalizedValue;
  const handleFileLinkClick = (event: React.MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLink?.(path);
  };
  const handleFileLinkContextMenu = (
    event: React.MouseEvent,
    path: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLinkMenu?.(event, path);
  };
  const filePathWithOptionalLineMatch = /^(.+?)(:\d+(?::\d+)?)?$/;
  const getLinkablePath = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    const match = trimmed.match(filePathWithOptionalLineMatch);
    const pathOnly = match?.[1]?.trim() ?? trimmed;
    if (!pathOnly || !isLinkableFilePath(pathOnly)) {
      return null;
    }
    return trimmed;
  };
  const resolveHrefFilePath = (url: string) => {
    if (isLikelyFileHref(url)) {
      const directPath = getLinkablePath(url);
      if (directPath) {
        return safeDecodeURIComponent(directPath) ?? directPath;
      }
    }
    const decodedUrl = safeDecodeURIComponent(url);
    if (decodedUrl && isLikelyFileHref(decodedUrl)) {
      const decodedPath = getLinkablePath(decodedUrl);
      if (decodedPath) {
        return decodedPath;
      }
    }
    const fileUrlPath = toPathFromFileUrl(url);
    if (!fileUrlPath) {
      return null;
    }
    return getLinkablePath(fileUrlPath);
  };
  const components: Components = {
    a: ({ href, children }) => {
      const url = (href ?? "").trim();
      const threadId = url.startsWith("thread://")
        ? url.slice("thread://".length).trim()
        : url.startsWith("/thread/")
          ? url.slice("/thread/".length).trim()
          : "";
      if (threadId) {
        return (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenThreadLink?.(threadId);
            }}
          >
            {children}
          </a>
        );
      }
      if (isFileLinkUrl(url)) {
        const path = safeDecodeFileLink(url);
        if (!path) {
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <FileReferenceLink
            href={href ?? toFileLink(path)}
            rawPath={path}
            showFilePath={showFilePath}
            workspacePath={workspacePath}
            onClick={handleFileLinkClick}
            onContextMenu={handleFileLinkContextMenu}
          />
        );
      }
      const hrefFilePath = resolveHrefFilePath(url);
      if (hrefFilePath) {
        const clickHandler = onOpenFileLink
          ? (event: React.MouseEvent) => handleFileLinkClick(event, hrefFilePath)
          : undefined;
        const contextMenuHandler = onOpenFileLinkMenu
          ? (event: React.MouseEvent) => handleFileLinkContextMenu(event, hrefFilePath)
          : undefined;
        return (
          <a
            href={href ?? toFileLink(hrefFilePath)}
            onClick={clickHandler}
            onContextMenu={contextMenuHandler}
          >
            {children}
          </a>
        );
      }
      const isExternal =
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("mailto:");

      if (!isExternal) {
        return <a href={href}>{children}</a>;
      }

      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openUrl(url);
          }}
        >
          {children}
        </a>
      );
    },
    code: ({ className: codeClassName, children }) => {
      if (codeClassName) {
        return <code className={codeClassName}>{children}</code>;
      }
      const text = String(children ?? "").trim();
      const linkablePath = getLinkablePath(text);
      if (!linkablePath) {
        return <code>{children}</code>;
      }
      const href = toFileLink(linkablePath);
      return (
        <FileReferenceLink
          href={href}
          rawPath={linkablePath}
          showFilePath={showFilePath}
          workspacePath={workspacePath}
          onClick={handleFileLinkClick}
          onContextMenu={handleFileLinkContextMenu}
        />
      );
    },
  };

  if (codeBlockStyle === "message") {
    components.pre = ({ node, children }) => (
      <PreBlock node={node as PreProps["node"]} copyUseModifier={codeBlockCopyUseModifier}>
        {children}
      </PreBlock>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFileLinks]}
        urlTransform={(url) => {
          const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
          if (
            isFileLinkUrl(url) ||
            url.startsWith("http://") ||
            url.startsWith("https://") ||
            url.startsWith("mailto:") ||
            url.startsWith("#") ||
            url.startsWith("/") ||
            url.startsWith("./") ||
            url.startsWith("../")
          ) {
            return url;
          }
          if (!hasScheme) {
            return url;
          }
          return "";
        }}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
