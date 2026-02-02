import { useCallback } from "react";
import type { RefObject } from "react";

type UseComposerInsertArgs = {
  isEnabled: boolean;
  draftText: string;
  onDraftChange: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function useComposerInsert({
  isEnabled,
  draftText,
  onDraftChange,
  textareaRef,
}: UseComposerInsertArgs) {
  return useCallback(
    (insertText: string) => {
      if (!isEnabled) {
        return;
      }
      const textarea = textareaRef.current;
      const currentText = draftText ?? "";
      const start = textarea?.selectionStart ?? currentText.length;
      const end = textarea?.selectionEnd ?? start;
      const before = currentText.slice(0, start);
      const after = currentText.slice(end);
      const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
      const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
      const prefix = needsSpaceBefore ? " " : "";
      const suffix = needsSpaceAfter ? " " : "";
      const nextText = `${before}${prefix}${insertText}${suffix}${after}`;
      onDraftChange(nextText);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        const cursor =
          before.length +
          prefix.length +
          insertText.length +
          (needsSpaceAfter ? 1 : 0);
        node.focus();
        node.setSelectionRange(cursor, cursor);
        node.dispatchEvent(new Event("select", { bubbles: true }));
      });
    },
    [isEnabled, draftText, onDraftChange, textareaRef],
  );
}
