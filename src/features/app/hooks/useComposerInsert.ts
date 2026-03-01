import { useCallback, useEffect, useRef } from "react";
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
  // Keep insert callback stable so message list memoization is not invalidated on each keystroke.
  const draftTextRef = useRef(draftText);

  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  return useCallback(
    (insertText: string) => {
      if (!isEnabled) {
        return;
      }
      const textarea = textareaRef.current;
      const currentText = draftTextRef.current ?? "";
      const start = textarea?.selectionStart ?? currentText.length;
      const end = textarea?.selectionEnd ?? start;
      const before = currentText.slice(0, start);
      const after = currentText.slice(end);
      const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
      const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
      const prefix = needsSpaceBefore ? " " : "";
      const suffix = needsSpaceAfter ? " " : "";
      const nextText = `${before}${prefix}${insertText}${suffix}${after}`;
      const cursor =
        before.length +
        prefix.length +
        insertText.length +
        (needsSpaceAfter ? 1 : 0);
      const focusComposer = () => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        node.focus();
        node.setSelectionRange(cursor, cursor);
        node.dispatchEvent(new Event("select", { bubbles: true }));
      };

      // Keep focus transfer in the same user gesture for mobile Safari.
      focusComposer();
      onDraftChange(nextText);
      requestAnimationFrame(() => {
        focusComposer();
      });
    },
    [isEnabled, onDraftChange, textareaRef],
  );
}
