import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readWorkspaceFile } from "../../../services/tauri";
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
  workspaceId?: string | null;
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

type FileLinkPreviewAnchor = {
  top: number;
  left: number;
};

type FileLinkPreviewLine = {
  lineNumber: number;
  text: string;
  focused: boolean;
};

type FileLinkPreviewState = {
  lines: FileLinkPreviewLine[];
  title: string;
  path: string;
  truncated: boolean;
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

function stripLineSuffix(path: string) {
  const match = path.match(/^(.*?)(?::\d+(?::\d+)?)?$/);
  return (match?.[1] ?? path).trim();
}

function parseLineNumber(rawPath: string) {
  const match = rawPath.trim().match(/:(\d+)(?::\d+)?$/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function resolveWorkspacePreviewPath(rawPath: string, workspacePath?: string | null) {
  const withoutLine = normalizePathSeparators(stripLineSuffix(rawPath));
  if (!withoutLine) {
    return null;
  }
  if (!isAbsolutePath(withoutLine)) {
    if (withoutLine.startsWith("../")) {
      return null;
    }
    return withoutLine.replace(/^\.\/+/, "");
  }

  if (!workspacePath) {
    return null;
  }

  const normalizedWorkspace = trimTrailingPathSeparators(
    normalizePathSeparators(workspacePath.trim()),
  );
  if (!normalizedWorkspace || !isAbsolutePath(normalizedWorkspace)) {
    return null;
  }

  const relative = toRelativePath(normalizedWorkspace, withoutLine);
  if (relative === null || !relative || relative.startsWith("..")) {
    return null;
  }

  return relative;
}

function computePreviewAnchor(link: HTMLAnchorElement): FileLinkPreviewAnchor {
  const rect = link.getBoundingClientRect();
  const width = 420;
  const height = 260;
  const gutter = 12;

  let left = Math.min(rect.left, window.innerWidth - width - gutter);
  left = Math.max(gutter, left);

  let top = rect.bottom + 8;
  if (top + height > window.innerHeight - gutter) {
    top = rect.top - height - 8;
  }
  top = Math.max(gutter, Math.min(top, window.innerHeight - height - gutter));

  return { top, left };
}

function buildPreviewState(rawPath: string, content: string, truncated: boolean): FileLinkPreviewState {
  const targetLine = parseLineNumber(rawPath);
  const source = content.split(/\r?\n/);
  const fallbackStart = 0;
  const focusIndex = targetLine ? Math.max(0, targetLine - 1) : fallbackStart;
  const start = Math.max(0, focusIndex - 3);
  const end = Math.min(source.length, focusIndex + 4);
  const lines = source.slice(start, end).map((text, index) => {
    const lineNumber = start + index + 1;
    return {
      lineNumber,
      text,
      focused: Boolean(targetLine) && lineNumber === targetLine,
    };
  });

  return {
    title: `L${targetLine ?? start + 1} 附近`,
    path: stripLineSuffix(rawPath),
    truncated,
    lines,
  };
}

function FileReferenceLink({
  href,
  rawPath,
  showFilePath,
  workspaceId,
  workspacePath,
  onClick,
  onContextMenu,
}: {
  href: string;
  rawPath: string;
  showFilePath: boolean;
  workspaceId?: string | null;
  workspacePath?: string | null;
  onClick: (event: React.MouseEvent, path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
}) {
  const { fullPath, fileName, lineLabel, parentPath } = parseFileReference(
    rawPath,
    workspacePath,
  );
  const [previewAnchor, setPreviewAnchor] = useState<FileLinkPreviewAnchor | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<FileLinkPreviewState | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previewPath = resolveWorkspacePreviewPath(rawPath, workspacePath);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const closePreview = useCallback(() => {
    clearCloseTimer();
    setIsPreviewOpen(false);
    setIsPreviewLoading(false);
    setPreviewError(null);
    setPreviewState(null);
    setPreviewAnchor(null);
  }, []);

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(closePreview, 120);
  };

  const openPreview = (target: HTMLAnchorElement) => {
    if (!workspaceId || !previewPath) {
      return;
    }
    clearCloseTimer();
    setPreviewAnchor(computePreviewAnchor(target));
    setIsPreviewOpen(true);
  };

  // Close preview on Escape key
  useEffect(() => {
    if (!isPreviewOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isPreviewOpen, closePreview]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  useEffect(() => {
    if (!workspaceId || !previewPath || !isPreviewOpen) {
      return;
    }
    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewState(null);

    readWorkspaceFile(workspaceId, previewPath)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const content = response.content ?? "";
        setPreviewState(buildPreviewState(rawPath, content, Boolean(response.truncated)));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPreviewError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPreviewOpen, previewPath, rawPath, workspaceId]);

  return (
    <>
      <a
        href={href}
        className="message-file-link"
        title={fullPath}
        onClick={(event) => onClick(event, rawPath)}
        onContextMenu={(event) => onContextMenu(event, rawPath)}
        onMouseEnter={(event) => openPreview(event.currentTarget)}
        onMouseLeave={scheduleClose}
        onFocus={(event) => openPreview(event.currentTarget)}
        onBlur={scheduleClose}
      >
        <span className="message-file-link-name">{fileName}</span>
        {lineLabel ? <span className="message-file-link-line">L{lineLabel}</span> : null}
        {showFilePath && parentPath ? (
          <span className="message-file-link-path">{parentPath}</span>
        ) : null}
      </a>
      {isPreviewOpen && previewAnchor
        ? createPortal(
            <div
              className="message-file-link-preview"
              style={{ top: previewAnchor.top, left: previewAnchor.left }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              role="dialog"
              aria-label={`${fileName} 预览`}
              tabIndex={-1}
            >
              <div className="message-file-link-preview-header">
                <span className="message-file-link-preview-title">{previewState?.title ?? "文件预览"}</span>
                {previewState?.truncated ? (
                  <span className="message-file-link-preview-tag">已截断</span>
                ) : null}
                <button
                  type="button"
                  className="message-file-link-preview-open"
                  title="打开完整文件"
                  aria-label="打开完整文件"
                  onClick={(event) => {
                    closePreview();
                    onClick(event as unknown as React.MouseEvent, rawPath);
                  }}
                >
                  <ExternalLink size={12} aria-hidden />
                  <span>打开</span>
                </button>
              </div>
              <div className="message-file-link-preview-path" title={previewState?.path ?? fullPath}>
                {previewState?.path ?? fullPath}
              </div>
              {isPreviewLoading ? (
                <div className="message-file-link-preview-status">正在读取文件...</div>
              ) : previewError ? (
                <div className="message-file-link-preview-status message-file-link-preview-error">
                  预览失败：{previewError}
                </div>
              ) : previewState && previewState.lines.length > 0 ? (
                <div className="message-file-link-preview-lines" role="list">
                  {previewState.lines.map((line) => (
                    <div
                      key={`${line.lineNumber}-${line.text}`}
                      className={`message-file-link-preview-line${line.focused ? " is-focused" : ""}`}
                      role="listitem"
                    >
                      <span className="message-file-link-preview-line-number">{line.lineNumber}</span>
                      <code className="message-file-link-preview-line-text">{line.text || " "}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="message-file-link-preview-status">文件为空。</div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
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
          aria-label="复制代码块"
          title={copied ? "已复制" : "复制"}
          >
          {copied ? "已复制" : "复制"}
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

// Stable regex – created once outside render to avoid per-render allocation
const FILE_PATH_WITH_OPTIONAL_LINE_RE = /^(.+?)(:\d+(?::\d+)?)?$/;

// Stable remarkPlugins array – prevents ReactMarkdown from re-parsing
const REMARK_PLUGINS = [remarkGfm, remarkFileLinks];

// Stable urlTransform – referentially stable across renders
function markdownUrlTransform(url: string): string {
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
}

export function Markdown({
  value,
  className,
  codeBlock,
  codeBlockStyle = "default",
  codeBlockCopyUseModifier = false,
  showFilePath = true,
  workspaceId = null,
  workspacePath = null,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: MarkdownProps) {
  const normalizedValue = codeBlock ? value : normalizeListIndentation(value);
  const content = codeBlock
    ? `\`\`\`\n${normalizedValue}\n\`\`\``
    : normalizedValue;
  const handleFileLinkClick = useCallback(
    (event: React.MouseEvent, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenFileLink?.(path);
    },
    [onOpenFileLink],
  );
  const handleFileLinkContextMenu = useCallback(
    (event: React.MouseEvent, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenFileLinkMenu?.(event, path);
    },
    [onOpenFileLinkMenu],
  );

  // Memoize the components object so ReactMarkdown receives a stable reference
  // and skips a full re-parse when only unrelated props change.
  const components: Components = useMemo(() => {
    const getLinkablePath = (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return null;
      }
      const match = trimmed.match(FILE_PATH_WITH_OPTIONAL_LINE_RE);
      const pathOnly = match?.[1]?.trim() ?? trimmed;
      if (!pathOnly || !isLinkableFilePath(pathOnly)) {
        return null;
      }
      return trimmed;
    };

    const result: Components = {
      a: ({ href, children }) => {
        const url = href ?? "";
        const tid = url.startsWith("thread://")
          ? url.slice("thread://".length).trim()
          : url.startsWith("/thread/")
            ? url.slice("/thread/".length).trim()
            : "";
        if (tid) {
          return (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenThreadLink?.(tid);
              }}
            >
              {children}
            </a>
          );
        }
        if (isFileLinkUrl(url)) {
          const path = decodeFileLink(url);
          return (
            <FileReferenceLink
              href={href ?? toFileLink(path)}
              rawPath={path}
              showFilePath={showFilePath}
              workspaceId={workspaceId}
              workspacePath={workspacePath}
              onClick={handleFileLinkClick}
              onContextMenu={handleFileLinkContextMenu}
            />
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
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            onClick={handleFileLinkClick}
            onContextMenu={handleFileLinkContextMenu}
          />
        );
      },
    };

    if (codeBlockStyle === "message") {
      result.pre = ({ node, children }) => (
        <PreBlock node={node as PreProps["node"]} copyUseModifier={codeBlockCopyUseModifier}>
          {children}
        </PreBlock>
      );
    }

    return result;
  }, [
    showFilePath,
    workspaceId,
    workspacePath,
    handleFileLinkClick,
    handleFileLinkContextMenu,
    onOpenThreadLink,
    codeBlockStyle,
    codeBlockCopyUseModifier,
  ]);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={markdownUrlTransform}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
