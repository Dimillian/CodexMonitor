const FENCE_LINE_WITH_TAG = /^\s*```([^\s`]*)?$/;
const FENCE_LINE = /^\s*```$/;
const CHECKBOX_PATTERN = /^(\s*)([-*+])\s+\[(?: |x|X)\]\s+(.*\S.*)$/;
const BULLET_PATTERN = /^(\s*)([-*+])\s+(.*\S.*)$/;
const NUMBER_PATTERN = /^(\s*)(\d+)([.)])\s+(.*\S.*)$/;
const ALPHA_PATTERN = /^(\s*)([A-Za-z])([.)])\s+(.*\S.*)$/;

function getLineBounds(text: string, cursor: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  let lineEnd = text.indexOf("\n", cursor);
  if (lineEnd === -1) {
    lineEnd = text.length;
  }
  return { lineStart, lineEnd };
}

function nextAlpha(letter: string) {
  if (!letter) {
    return null;
  }
  const code = letter.charCodeAt(0);
  if (code === 90 || code === 122) {
    return null;
  }
  return String.fromCharCode(code + 1);
}

export function getFenceTriggerLine(
  text: string,
  cursor: number,
  allowLanguageTags: boolean,
) {
  if (cursor < 3) {
    return null;
  }
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  const lineBefore = text.slice(lineStart, cursor);
  const lineAfter = text.slice(cursor, lineEnd);
  if (lineAfter && /\S/.test(lineAfter)) {
    return null;
  }
  const match = allowLanguageTags
    ? lineBefore.match(FENCE_LINE_WITH_TAG)
    : lineBefore.match(FENCE_LINE);
  if (!match) {
    return null;
  }
  const indent = match[0]?.match(/^\s*/)?.[0] ?? "";
  const tag = allowLanguageTags ? match[1] ?? "" : "";
  return { lineStart, lineEnd, indent, tag };
}

export function getLineIndent(text: string, cursor: number) {
  const { lineStart } = getLineBounds(text, cursor);
  const match = text.slice(lineStart).match(/^\s*/);
  return match ? match[0] : "";
}

export function getListContinuation(text: string, cursor: number) {
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  const line = text.slice(lineStart, lineEnd);

  const checkboxMatch = line.match(CHECKBOX_PATTERN);
  if (checkboxMatch) {
    const indent = checkboxMatch[1] ?? "";
    const bullet = checkboxMatch[2] ?? "-";
    return `${indent}${bullet} [ ] `;
  }

  const numberMatch = line.match(NUMBER_PATTERN);
  if (numberMatch) {
    const indent = numberMatch[1] ?? "";
    const value = Number.parseInt(numberMatch[2] ?? "", 10);
    if (Number.isFinite(value)) {
      const next = value + 1;
      const suffix = numberMatch[3] ?? ".";
      return `${indent}${next}${suffix} `;
    }
  }

  const alphaMatch = line.match(ALPHA_PATTERN);
  if (alphaMatch) {
    const indent = alphaMatch[1] ?? "";
    const next = nextAlpha(alphaMatch[2] ?? "");
    if (next) {
      const suffix = alphaMatch[3] ?? ".";
      return `${indent}${next}${suffix} `;
    }
  }

  const bulletMatch = line.match(BULLET_PATTERN);
  if (bulletMatch) {
    const indent = bulletMatch[1] ?? "";
    const bullet = bulletMatch[2] ?? "-";
    return `${indent}${bullet} `;
  }

  return null;
}

export function isCursorInsideFence(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const fenceCount = before
    .split("\n")
    .filter((line) => /^\s*```/.test(line)).length;
  return fenceCount % 2 === 1;
}

export function normalizePastedText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
}

export function isCodeLikeSingleLine(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 40 || trimmed.includes("\n")) {
    return false;
  }
  const tokenMatches = trimmed.match(/;|\{|\}|\(|\)|=>|::|==|<[^>]+>/g) ?? [];
  if (tokenMatches.length < 2) {
    return false;
  }
  const nonWordCount = trimmed.replace(/[A-Za-z0-9\s]/g, "").length;
  const ratio = nonWordCount / trimmed.length;
  return ratio >= 0.08;
}
