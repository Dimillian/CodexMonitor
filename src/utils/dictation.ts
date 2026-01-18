export type DictationInsertionResult = {
  nextText: string;
  nextCursor: number;
};

export function computeDictationInsertion(
  currentText: string,
  transcriptText: string,
  start: number,
  end: number,
): DictationInsertionResult {
  const beforeChar = start > 0 ? currentText[start - 1] : "";
  const afterChar = end < currentText.length ? currentText[end] : "";
  const firstChar = transcriptText[0] ?? "";
  const lastChar = transcriptText[transcriptText.length - 1] ?? "";
  const isWordChar = (value: string) => /[A-Za-z0-9]/.test(value);
  const needsPrefixSpace =
    beforeChar &&
    !/\s/.test(beforeChar) &&
    firstChar &&
    isWordChar(beforeChar) &&
    isWordChar(firstChar);
  const needsSuffixSpace =
    afterChar &&
    !/\s/.test(afterChar) &&
    lastChar &&
    isWordChar(lastChar) &&
    isWordChar(afterChar);
  const insertText = `${needsPrefixSpace ? " " : ""}${transcriptText}${
    needsSuffixSpace ? " " : ""
  }`;
  const nextText = `${currentText.slice(0, start)}${insertText}${currentText.slice(end)}`;
  const nextCursor = start + insertText.length;
  return { nextText, nextCursor };
}
