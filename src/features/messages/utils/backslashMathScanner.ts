type FenceState = {
  marker: "`" | "~";
  length: number;
};

type ParsedLinePrefix = {
  prefix: string;
  content: string;
  quoteDepth: number;
};

const MARKDOWN_FENCE_OPENER_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const MARKDOWN_FENCE_CLOSER_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const BLOCK_LATEX_SINGLE_LINE_PATTERN = /^\\\[\s*(.*?)\s*\\\]\s*$/;
const BLOCK_LATEX_OPEN_PATTERN = /^\\\[\s*$/;
const BLOCK_LATEX_CLOSE_PATTERN = /^\\\]\s*$/;
const LIST_MARKER_PREFIX_PATTERN = /(?:[*+-]|\d+[.)])[ \t]+/g;
const INLINE_CODE_PLACEHOLDER_PREFIX = "\u0000CODEXBACKSLASHINLINE";
const INLINE_CODE_PLACEHOLDER_SUFFIX = "\u0000";
const LINK_DEST_PLACEHOLDER_PREFIX = "\u0000CODEXBACKSLASHLINK";
const LINK_DEST_PLACEHOLDER_SUFFIX = "\u0000";
const URL_PLACEHOLDER_PREFIX = "\u0000CODEXBACKSLASHURL";
const URL_PLACEHOLDER_SUFFIX = "\u0000";

function isEscaped(value: string, pos: number) {
  let count = 0;
  let cursor = pos - 1;
  while (cursor >= 0 && value[cursor] === "\\") {
    count += 1;
    cursor -= 1;
  }
  return count % 2 === 1;
}

function parseLinePrefix(line: string): ParsedLinePrefix {
  let index = 0;
  while (index < line.length && /[ \t]/.test(line[index])) {
    index += 1;
  }
  let prefixEnd = index;
  let quoteDepth = 0;

  while (index < line.length) {
    if (line[index] === ">") {
      quoteDepth += 1;
      index += 1;
      if (index < line.length && /[ \t]/.test(line[index])) {
        index += 1;
      }
      prefixEnd = index;
      continue;
    }

    const unordered = line[index];
    if (
      (unordered === "-" || unordered === "+" || unordered === "*") &&
      index + 1 < line.length &&
      /[ \t]/.test(line[index + 1])
    ) {
      index += 1;
      while (index < line.length && /[ \t]/.test(line[index])) {
        index += 1;
      }
      prefixEnd = index;
      continue;
    }

    let digitCursor = index;
    while (digitCursor < line.length && /[0-9]/.test(line[digitCursor])) {
      digitCursor += 1;
    }
    if (
      digitCursor > index &&
      digitCursor < line.length &&
      (line[digitCursor] === "." || line[digitCursor] === ")") &&
      digitCursor + 1 < line.length &&
      /[ \t]/.test(line[digitCursor + 1])
    ) {
      index = digitCursor + 1;
      while (index < line.length && /[ \t]/.test(line[index])) {
        index += 1;
      }
      prefixEnd = index;
      continue;
    }

    break;
  }

  return {
    prefix: line.slice(0, prefixEnd),
    content: line.slice(prefixEnd),
    quoteDepth,
  };
}

function parseFenceOpener(line: string): FenceState | null {
  const { content } = parseLinePrefix(line);
  const match = content.match(MARKDOWN_FENCE_OPENER_PATTERN);
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

function isFenceCloser(line: string, activeFence: FenceState) {
  const { content } = parseLinePrefix(line);
  const match = content.match(MARKDOWN_FENCE_CLOSER_PATTERN);
  if (!match) {
    return false;
  }
  const sequence = match[1];
  return sequence[0] === activeFence.marker && sequence.length >= activeFence.length;
}

function isIndentedCodeLine(line: string) {
  if (/^(?: {4}|\t)/.test(line)) {
    return true;
  }
  const { content } = parseLinePrefix(line);
  return /^(?: {4}|\t)/.test(content);
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

function maskInlineCodeSpans(value: string) {
  const spans: string[] = [];
  let output = "";
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "`") {
      output += value[index];
      index += 1;
      continue;
    }

    let runLength = 0;
    while (index + runLength < value.length && value[index + runLength] === "`") {
      runLength += 1;
    }

    const marker = "`".repeat(runLength);
    const closeIndex = value.indexOf(marker, index + runLength);
    if (closeIndex < 0) {
      output += value[index];
      index += 1;
      continue;
    }

    const placeholderIndex = spans.length;
    spans.push(value.slice(index, closeIndex + runLength));
    output += `${INLINE_CODE_PLACEHOLDER_PREFIX}${placeholderIndex}${INLINE_CODE_PLACEHOLDER_SUFFIX}`;
    index = closeIndex + runLength;
  }

  return {
    masked: output,
    restore: (normalized: string) =>
      normalized.replace(
        new RegExp(
          `${INLINE_CODE_PLACEHOLDER_PREFIX}(\\d+)${INLINE_CODE_PLACEHOLDER_SUFFIX}`,
          "g",
        ),
        (match, indexValue: string) => {
          const parsedIndex = Number(indexValue);
          return spans[parsedIndex] ?? match;
        },
      ),
  };
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

function replaceInlineBackslashDelimiters(value: string) {
  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < value.length) {
    if (
      value[index] === "\\" &&
      index + 1 < value.length &&
      value[index + 1] === "(" &&
      !isEscaped(value, index)
    ) {
      const start = index;
      let closeIndex = -1;
      let scan = index + 2;
      while (scan < value.length) {
        if (value[scan] === "\n" || value[scan] === "\r") {
          break;
        }
        if (
          value[scan] === "\\" &&
          scan + 1 < value.length &&
          value[scan + 1] === ")" &&
          !isEscaped(value, scan)
        ) {
          closeIndex = scan;
          break;
        }
        scan += 1;
      }

      if (closeIndex >= 0) {
        const body = value.slice(start + 2, closeIndex).trim();
        if (body.length > 0) {
          output += value.slice(cursor, start);
          output += `$${body}$`;
          const nextIndex = closeIndex + 2;
          index = nextIndex;
          cursor = nextIndex;
          continue;
        }
      }
    }

    index += 1;
  }

  output += value.slice(cursor);
  return output;
}

function convertBackslashBlockDelimiters(value: string) {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let collectingBlock = false;
  let blockLines: string[] = [];
  let activeFencePrefix = "";
  let activeQuoteDepth = 0;
  let activeOpenLine = "";

  const toFencePrefix = (prefix: string) =>
    prefix.replace(LIST_MARKER_PREFIX_PATTERN, (marker) => " ".repeat(marker.length));

  for (const line of lines) {
    const { prefix, content, quoteDepth } = parseLinePrefix(line);

    if (!collectingBlock) {
      const singleLineMatch = content.match(BLOCK_LATEX_SINGLE_LINE_PATTERN);
      if (singleLineMatch) {
        const body = (singleLineMatch[1] ?? "").trim();
        if (!body) {
          output.push(line);
          continue;
        }
        const fencePrefix = toFencePrefix(prefix);
        output.push(`${fencePrefix}$$`, `${fencePrefix}${body}`, `${fencePrefix}$$`);
        continue;
      }

      if (BLOCK_LATEX_OPEN_PATTERN.test(content)) {
        collectingBlock = true;
        blockLines = [];
        activeFencePrefix = toFencePrefix(prefix);
        activeQuoteDepth = quoteDepth;
        activeOpenLine = line;
        continue;
      }

      output.push(line);
      continue;
    }

    if (BLOCK_LATEX_CLOSE_PATTERN.test(content) && quoteDepth === activeQuoteDepth) {
      if (blockLines.some((bodyLine) => bodyLine.trim().length > 0)) {
        output.push(`${activeFencePrefix}$$`, ...blockLines, `${activeFencePrefix}$$`);
      } else {
        output.push(activeOpenLine, ...blockLines, line);
      }
      collectingBlock = false;
      blockLines = [];
      activeFencePrefix = "";
      activeQuoteDepth = 0;
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

function normalizeBackslashMathDelimitersInChunk(value: string) {
  const { masked: inlineCodeMasked, restore: restoreInlineCode } = maskInlineCodeSpans(value);
  const { masked: linkMasked, restore: restoreLinks } = maskMarkdownLinkDestinations(inlineCodeMasked);
  const { masked: urlMasked, restore: restoreUrls } = maskUrlLiterals(linkMasked);
  const withBlockMath = convertBackslashBlockDelimiters(urlMasked);
  const withInlineMath = replaceInlineBackslashDelimiters(withBlockMath);
  return restoreInlineCode(restoreLinks(restoreUrls(withInlineMath)));
}

export function normalizeBackslashMathDelimiters(value: string) {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let activeFence: FenceState | null = null;
  let nonCodeChunk: string[] = [];

  const flushNonCodeChunk = () => {
    if (nonCodeChunk.length === 0) {
      return;
    }
    output.push(normalizeBackslashMathDelimitersInChunk(nonCodeChunk.join("\n")));
    nonCodeChunk = [];
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
      flushNonCodeChunk();
      activeFence = fenceOpener;
      output.push(line);
      lineIndex += 1;
      continue;
    }

    if (isIndentedCodeLine(line)) {
      flushNonCodeChunk();
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

    nonCodeChunk.push(line);
    lineIndex += 1;
  }

  flushNonCodeChunk();
  return output.join("\n");
}
