import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  describeFileTarget,
  formatParsedFileLocation,
  isFileLinkUrl,
  parseFileLinkUrl,
  parseInlineFileTarget,
  remarkFileLinks,
  resolveMessageFileHref,
  toFileLink,
} from "../utils/messageFileLinks";
import type { ParsedFileLocation } from "../../../utils/fileLinks";

type MarkdownProps = {
  value: string;
  className?: string;
  codeBlock?: boolean;
  codeBlockStyle?: "default" | "message";
  codeBlockCopyUseModifier?: boolean;
  enableMathRendering?: boolean;
  showFilePath?: boolean;
  workspacePath?: string | null;
  onOpenFileLink?: (path: ParsedFileLocation) => void;
  onOpenFileLinkMenu?: (event: React.MouseEvent, path: ParsedFileLocation) => void;
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

type StructuredReviewFinding = {
  file: string;
  category: string;
  finding: string;
  recommendation: string;
  severity: string;
};

function escapeTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br />")
    .trim();
}

function parseStructuredReviewFinding(line: string): StructuredReviewFinding | null {
  const parts = line.split(/\s+\|\s+/).map((part) => part.trim());
  if (parts.length !== 5) {
    return null;
  }
  const [file, rawCategory, finding, recommendation, rawSeverity] = parts;
  if (!file || !finding || !recommendation || !/^category=/i.test(rawCategory)) {
    return null;
  }
  const category = rawCategory.replace(/^category=/i, "").trim();
  const severity = rawSeverity.replace(/^severity=/i, "").trim();
  if (!category || !severity) {
    return null;
  }
  if (!/^(critical|high|medium|low|info|warning|error)$/i.test(severity)) {
    return null;
  }
  return {
    file,
    category,
    finding,
    recommendation,
    severity,
  };
}

function buildStructuredReviewTable(rows: StructuredReviewFinding[]) {
  const header = [
    "| File | Category | Finding | Recommendation | Severity |",
    "| --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    ({ file, category, finding, recommendation, severity }) =>
      `| \`${escapeTableCell(file)}\` | ${escapeTableCell(category)} | ${escapeTableCell(
        finding,
      )} | ${escapeTableCell(recommendation)} | ${escapeTableCell(severity)} |`,
  );
  return [...header, ...body].join("\n");
}

function normalizeStructuredReviewTables(value: string) {
  const lines = value.split(/\r?\n/);
  let inFence = false;
  let pendingRows: StructuredReviewFinding[] = [];
  const output: string[] = [];

  const flushPendingRows = () => {
    if (pendingRows.length === 0) {
      return;
    }
    if (output.length > 0 && output[output.length - 1].trim()) {
      output.push("");
    }
    output.push(buildStructuredReviewTable(pendingRows));
    output.push("");
    pendingRows = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      flushPendingRows();
      inFence = !inFence;
      output.push(line);
      continue;
    }
    const structuredRow = inFence ? null : parseStructuredReviewFinding(line);
    if (structuredRow) {
      pendingRows.push(structuredRow);
      continue;
    }
    if (!inFence && pendingRows.length > 0 && !line.trim()) {
      continue;
    }
    flushPendingRows();
    output.push(line);
  }

  flushPendingRows();
  return output.join("\n");
}

function stripTrailingMemoryCitation(value: string) {
  return value.replace(/\n*<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>\s*$/i, "").trim();
}

export function isStandaloneMarkdownTable(value: string) {
  const stripped = stripTrailingMemoryCitation(value);
  if (!stripped) {
    return false;
  }
  const normalized = normalizeStructuredReviewTables(normalizeListIndentation(stripped)).trim();
  if (!normalized) {
    return false;
  }
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return false;
  }
  return lines.every((line) => /^\|.*\|\s*$/.test(line.trim()));
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

type MarkdownFenceState = {
  marker: "`" | "~";
  length: number;
};

const MARKDOWN_FENCE_OPENER_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const MARKDOWN_FENCE_CLOSER_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const INLINE_CODE_PLACEHOLDER_PREFIX = "\u0000CODEXINLINECODE";
const INLINE_CODE_PLACEHOLDER_SUFFIX = "\u0000";
const LINK_DEST_PLACEHOLDER_PREFIX = "\u0000CODEXLINKDEST";
const LINK_DEST_PLACEHOLDER_SUFFIX = "\u0000";
const URL_PLACEHOLDER_PREFIX = "\u0000CODEXURL";
const URL_PLACEHOLDER_SUFFIX = "\u0000";
const INLINE_CODE_PATTERN = /(`+)([\s\S]*?)\1/g;
const INLINE_LATEX_MATH_PATTERN = /\\\(([^\n]*?)\\\)/g;
const BLOCK_LATEX_SINGLE_LINE_PATTERN = /^([ \t]*(?:>\s*)*)\\\[\s*(.*?)\s*\\\]\s*$/;
const BLOCK_LATEX_OPEN_PATTERN = /^([ \t]*(?:>\s*)*)\\\[\s*$/;
const BLOCK_LATEX_CLOSE_PATTERN = /^([ \t]*(?:>\s*)*)\\\]\s*$/;
const INLINE_MATH_BOUNDARY_PATTERN = /[A-Za-z0-9_]/;

function stripMarkdownContainerPrefixes(line: string) {
  let remaining = line;
  while (true) {
    const quotePrefixMatch = remaining.match(/^[ \t]{0,3}>[ \t]?/);
    if (quotePrefixMatch) {
      remaining = remaining.slice(quotePrefixMatch[0].length);
      continue;
    }
    const listPrefixMatch = remaining.match(/^[ \t]{0,3}(?:[*+-]|\d+[.)])[ \t]+/);
    if (listPrefixMatch) {
      remaining = remaining.slice(listPrefixMatch[0].length);
      continue;
    }
    break;
  }
  return remaining;
}

function parseFenceOpener(line: string): MarkdownFenceState | null {
  const contentLine = stripMarkdownContainerPrefixes(line);
  const match = contentLine.match(MARKDOWN_FENCE_OPENER_PATTERN);
  if (!match) {
    return null;
  }
  const sequence = match[1];
  const marker = sequence[0];
  if (marker !== "`" && marker !== "~") {
    return null;
  }
  return {
    marker,
    length: sequence.length,
  };
}

function isFenceCloser(line: string, activeFence: MarkdownFenceState) {
  const contentLine = stripMarkdownContainerPrefixes(line);
  const match = contentLine.match(MARKDOWN_FENCE_CLOSER_PATTERN);
  if (!match) {
    return false;
  }
  const sequence = match[1];
  return sequence[0] === activeFence.marker && sequence.length >= activeFence.length;
}

function findClosingBracket(value: string, startIndex: number) {
  let depth = 0;
  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function findClosingParen(value: string, startIndex: number) {
  let depth = 0;
  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function maskMarkdownLinkDestinations(value: string) {
  const destinations: string[] = [];
  let masked = "";
  let index = 0;

  while (index < value.length) {
    const isImageLink = value[index] === "!" && value[index + 1] === "[";
    const labelStart = isImageLink ? index + 1 : index;
    if (value[labelStart] !== "[") {
      masked += value[index];
      index += 1;
      continue;
    }

    const labelEnd = findClosingBracket(value, labelStart);
    if (labelEnd < 0) {
      masked += value[index];
      index += 1;
      continue;
    }

    let destinationOpen = labelEnd + 1;
    while (destinationOpen < value.length && /[ \t]/.test(value[destinationOpen])) {
      destinationOpen += 1;
    }
    if (value[destinationOpen] !== "(") {
      masked += value[index];
      index += 1;
      continue;
    }

    const destinationClose = findClosingParen(value, destinationOpen);
    if (destinationClose < 0) {
      masked += value[index];
      index += 1;
      continue;
    }

    const destination = value.slice(destinationOpen + 1, destinationClose);
    const placeholderIndex = destinations.length;
    destinations.push(destination);
    masked += `${value.slice(index, destinationOpen + 1)}${LINK_DEST_PLACEHOLDER_PREFIX}${placeholderIndex}${LINK_DEST_PLACEHOLDER_SUFFIX})`;
    index = destinationClose + 1;
  }

  return {
    masked,
    restore: (normalized: string) =>
      normalized.replace(
        new RegExp(
          `${LINK_DEST_PLACEHOLDER_PREFIX}(\\d+)${LINK_DEST_PLACEHOLDER_SUFFIX}`,
          "g",
        ),
        (match, indexValue: string) => {
          const parsedIndex = Number(indexValue);
          return destinations[parsedIndex] ?? match;
        },
      ),
  };
}

function maskUrlLiterals(value: string) {
  const urls: string[] = [];
  const toPlaceholder = (url: string) => {
    const index = urls.length;
    urls.push(url);
    return `${URL_PLACEHOLDER_PREFIX}${index}${URL_PLACEHOLDER_SUFFIX}`;
  };
  const lines = value.split(/\r?\n/);
  const maskedLines = lines.map((line) => {
    const referenceDefinitionMatch = line.match(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)(.*)$/);
    if (referenceDefinitionMatch) {
      const prefix = referenceDefinitionMatch[1] ?? "";
      const rawDestination = referenceDefinitionMatch[2] ?? "";
      const suffix = referenceDefinitionMatch[3] ?? "";
      if (rawDestination.startsWith("<") && rawDestination.endsWith(">")) {
        const innerDestination = rawDestination.slice(1, -1);
        return `${prefix}<${toPlaceholder(innerDestination)}>${suffix}`;
      }
      return `${prefix}${toPlaceholder(rawDestination)}${suffix}`;
    }

    const withAutolinksMasked = line.replace(
      /<((?:https?:\/\/|mailto:)[^\s>]+)>/gi,
      (_match, url: string) => `<${toPlaceholder(url)}>`,
    );
    return withAutolinksMasked.replace(
      /\bhttps?:\/\/[^\s<]+/gi,
      (url: string) => toPlaceholder(url),
    );
  });

  return {
    masked: maskedLines.join("\n"),
    restore: (normalized: string) =>
      normalized.replace(
        new RegExp(`${URL_PLACEHOLDER_PREFIX}(\\d+)${URL_PLACEHOLDER_SUFFIX}`, "g"),
        (match, indexValue: string) => {
          const parsedIndex = Number(indexValue);
          return urls[parsedIndex] ?? match;
        },
      ),
  };
}

function replaceInlineLatexMathDelimiters(value: string) {
  return value.replace(
    INLINE_LATEX_MATH_PATTERN,
    (match, body: string, offset: number, source: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return match;
      }
      let precedingBackslashes = 0;
      for (let index = offset - 1; index >= 0; index -= 1) {
        if (source[index] !== "\\") {
          break;
        }
        precedingBackslashes += 1;
      }
      if (precedingBackslashes % 2 === 1) {
        return match;
      }
      const before = offset > 0 ? source[offset - 1] : "";
      const afterIndex = offset + match.length;
      const after = afterIndex < source.length ? source[afterIndex] : "";
      if (
        (before && INLINE_MATH_BOUNDARY_PATTERN.test(before)) ||
        (after && INLINE_MATH_BOUNDARY_PATTERN.test(after))
      ) {
        return match;
      }
      return `$${trimmed}$`;
    },
  );
}

function replaceBlockLatexMathDelimiters(value: string) {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let collectingBlock = false;
  let blockLines: string[] = [];
  let activeBlockPrefix = "";
  let activeBlockPrefixNormalized = "";
  let activeOpenLine = "";
  const normalizePrefixForComparison = (prefix: string) =>
    prefix.includes(">") ? (prefix.match(/>/g) ?? []).join("") : prefix;

  for (const line of lines) {
    if (!collectingBlock) {
      const singleLineMatch = line.match(BLOCK_LATEX_SINGLE_LINE_PATTERN);
      if (singleLineMatch) {
        const prefix = singleLineMatch[1] ?? "";
        const body = (singleLineMatch[2] ?? "").trim();
        if (!body) {
          output.push(line);
          continue;
        }
        output.push(`${prefix}$$`, `${prefix}${body}`, `${prefix}$$`);
        continue;
      }
      const blockOpenMatch = line.match(BLOCK_LATEX_OPEN_PATTERN);
      if (blockOpenMatch) {
        collectingBlock = true;
        blockLines = [];
        activeBlockPrefix = blockOpenMatch[1] ?? "";
        activeBlockPrefixNormalized = normalizePrefixForComparison(activeBlockPrefix);
        activeOpenLine = line;
        continue;
      }
      output.push(line);
      continue;
    }

    const blockCloseMatch = line.match(BLOCK_LATEX_CLOSE_PATTERN);
    if (
      blockCloseMatch &&
      normalizePrefixForComparison(blockCloseMatch[1] ?? "") === activeBlockPrefixNormalized
    ) {
      if (blockLines.some((bodyLine) => bodyLine.trim().length > 0)) {
        output.push(`${activeBlockPrefix}$$`, ...blockLines, `${activeBlockPrefix}$$`);
      } else {
        output.push(activeOpenLine, ...blockLines, line);
      }
      collectingBlock = false;
      blockLines = [];
      activeBlockPrefix = "";
      activeBlockPrefixNormalized = "";
      activeOpenLine = "";
      continue;
    }

    blockLines.push(line);
  }

  if (collectingBlock) {
    output.push(activeOpenLine, ...blockLines);
  }

  return output.join("\n");
}

function isIndentedCodeLine(line: string) {
  return /^(?: {4}|\t)/.test(stripMarkdownContainerPrefixes(line));
}

function normalizeLatexMathDelimitersInChunk(value: string) {
  const inlineCodeSpans: string[] = [];
  const withMaskedInlineCode = value.replace(INLINE_CODE_PATTERN, (match) => {
    const placeholderIndex = inlineCodeSpans.length;
    inlineCodeSpans.push(match);
    return `${INLINE_CODE_PLACEHOLDER_PREFIX}${placeholderIndex}${INLINE_CODE_PLACEHOLDER_SUFFIX}`;
  });
  const { masked: linkMasked, restore: restoreLinks } = maskMarkdownLinkDestinations(withMaskedInlineCode);
  const { masked: urlMasked, restore: restoreUrls } = maskUrlLiterals(linkMasked);
  const withBlockMath = replaceBlockLatexMathDelimiters(urlMasked);
  const withInlineMath = replaceInlineLatexMathDelimiters(withBlockMath);
  const withRestoredUrls = restoreUrls(withInlineMath);
  const withRestoredLinks = restoreLinks(withRestoredUrls);
  return withRestoredLinks.replace(
    new RegExp(
      `${INLINE_CODE_PLACEHOLDER_PREFIX}(\\d+)${INLINE_CODE_PLACEHOLDER_SUFFIX}`,
      "g",
    ),
    (match, indexValue: string) => {
      const parsedIndex = Number(indexValue);
      return inlineCodeSpans[parsedIndex] ?? match;
    },
  );
}

function normalizeLatexMathDelimiters(value: string) {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let activeFence: MarkdownFenceState | null = null;
  let nonFenceChunk: string[] = [];

  const flushNonFenceChunk = () => {
    if (nonFenceChunk.length === 0) {
      return;
    }
    output.push(normalizeLatexMathDelimitersInChunk(nonFenceChunk.join("\n")));
    nonFenceChunk = [];
  };

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (activeFence) {
      output.push(line);
      if (isFenceCloser(line, activeFence)) {
        activeFence = null;
      }
      lineIndex += 1;
      continue;
    }

    const fenceOpener = parseFenceOpener(line);
    if (fenceOpener) {
      flushNonFenceChunk();
      activeFence = fenceOpener;
      output.push(line);
      lineIndex += 1;
      continue;
    }

    if (isIndentedCodeLine(line)) {
      flushNonFenceChunk();
      output.push(line);
      lineIndex += 1;
      while (lineIndex < lines.length) {
        const candidate = lines[lineIndex];
        if (!candidate.trim()) {
          output.push(candidate);
          lineIndex += 1;
          continue;
        }
        if (!isIndentedCodeLine(candidate)) {
          break;
        }
        output.push(candidate);
        lineIndex += 1;
      }
      continue;
    }

    nonFenceChunk.push(line);
    lineIndex += 1;
  }

  flushNonFenceChunk();
  return output.join("\n");
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

function FileReferenceLink({
  href,
  rawPath,
  showFilePath,
  workspacePath,
  onClick,
  onContextMenu,
}: {
  href: string;
  rawPath: ParsedFileLocation;
  showFilePath: boolean;
  workspacePath?: string | null;
  onClick: (event: React.MouseEvent, path: ParsedFileLocation) => void;
  onContextMenu: (event: React.MouseEvent, path: ParsedFileLocation) => void;
}) {
  const { fullPath, fileName, lineLabel, parentPath } = describeFileTarget(rawPath, workspacePath);
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
  enableMathRendering = false,
  showFilePath = true,
  workspacePath = null,
  onOpenFileLink,
  onOpenFileLinkMenu,
  onOpenThreadLink,
}: MarkdownProps) {
  const markdownValue = codeBlock ? value : normalizeListIndentation(value);
  const mathNormalizedValue = !codeBlock && enableMathRendering
    ? normalizeLatexMathDelimiters(markdownValue)
    : markdownValue;
  const normalizedValue = codeBlock
    ? mathNormalizedValue
    : normalizeStructuredReviewTables(mathNormalizedValue);
  const content = codeBlock
    ? `\`\`\`\n${normalizedValue}\n\`\`\``
    : normalizedValue;
  const handleFileLinkClick = (event: React.MouseEvent, path: ParsedFileLocation) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLink?.(path);
  };
  const handleLocalLinkClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleFileLinkContextMenu = (
    event: React.MouseEvent,
    path: ParsedFileLocation,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFileLinkMenu?.(event, path);
  };
  const resolvedHrefFilePathCache = new Map<string, ParsedFileLocation | null>();
  const resolveHrefFilePath = (url: string) => {
    if (resolvedHrefFilePathCache.has(url)) {
      return resolvedHrefFilePathCache.get(url) ?? null;
    }
    const resolvedPath = resolveMessageFileHref(url, workspacePath);
    if (!resolvedPath) {
      resolvedHrefFilePathCache.set(url, null);
      return null;
    }
    resolvedHrefFilePathCache.set(url, resolvedPath);
    return resolvedPath;
  };
  const components: Components = {
    table: ({ children }) => (
      <div className="markdown-table-wrap">
        <table className="markdown-table">{children}</table>
      </div>
    ),
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
        const path = parseFileLinkUrl(url);
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
        const formattedHrefFilePath = formatParsedFileLocation(hrefFilePath);
        const clickHandler = (event: React.MouseEvent) =>
          handleFileLinkClick(event, hrefFilePath);
        const contextMenuHandler = onOpenFileLinkMenu
          ? (event: React.MouseEvent) => handleFileLinkContextMenu(event, hrefFilePath)
          : undefined;
        return (
          <a
            href={href ?? toFileLink(hrefFilePath)}
            title={formattedHrefFilePath}
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
        if (url.startsWith("#")) {
          return <a href={href}>{children}</a>;
        }
        return (
          <a href={href} onClick={handleLocalLinkClick}>
            {children}
          </a>
        );
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
      const fileTarget = parseInlineFileTarget(text);
      if (!fileTarget) {
        return <code>{children}</code>;
      }
      const href = toFileLink(fileTarget);
      return (
        <FileReferenceLink
          href={href}
          rawPath={fileTarget}
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
        remarkPlugins={
          enableMathRendering
            ? [remarkGfm, remarkMath, remarkFileLinks]
            : [remarkGfm, remarkFileLinks]
        }
        rehypePlugins={enableMathRendering ? [rehypeKatex] : undefined}
        urlTransform={(url) => {
          const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
          // Keep file-like hrefs intact before scheme sanitization runs, otherwise
          // Windows absolute paths such as C:/repo/file.ts look like unknown schemes.
          if (resolveHrefFilePath(url)) {
            return url;
          }
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
