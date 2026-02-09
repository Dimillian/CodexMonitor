import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { getCaretPosition } from "../../../utils/caretPosition";
import { CARET_ANCHOR_GAP } from "../components/workspaceHomeHelpers";

type UseWorkspaceHomeSuggestionsStyleParams = {
  isAutocompleteOpen: boolean;
  autocompleteAnchorIndex: number | null;
  selectionStart: number | null;
  prompt: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function useWorkspaceHomeSuggestionsStyle({
  isAutocompleteOpen,
  autocompleteAnchorIndex,
  selectionStart,
  prompt,
  textareaRef,
}: UseWorkspaceHomeSuggestionsStyleParams) {
  const [suggestionsStyle, setSuggestionsStyle] = useState<
    CSSProperties | undefined
  >(undefined);

  useLayoutEffect(() => {
    if (!isAutocompleteOpen) {
      setSuggestionsStyle(undefined);
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const cursor =
      autocompleteAnchorIndex ??
      textarea.selectionStart ??
      selectionStart ??
      prompt.length;
    const caret = getCaretPosition(textarea, cursor);
    if (!caret) {
      return;
    }
    const textareaRect = textarea.getBoundingClientRect();
    const container = textarea.closest(".composer-input");
    const containerRect = container?.getBoundingClientRect();
    const offsetLeft = textareaRect.left - (containerRect?.left ?? 0);
    const offsetTop = textareaRect.top - (containerRect?.top ?? 0);
    const maxWidth = Math.min(textarea.clientWidth || 0, 420);
    const maxLeft = Math.max(0, (textarea.clientWidth || 0) - maxWidth);
    const left = Math.min(Math.max(0, caret.left), maxLeft) + offsetLeft;
    setSuggestionsStyle({
      top: caret.top + caret.lineHeight + CARET_ANCHOR_GAP + offsetTop,
      left,
      bottom: "auto",
      right: "auto",
    });
  }, [
    autocompleteAnchorIndex,
    isAutocompleteOpen,
    prompt,
    selectionStart,
    textareaRef,
  ]);

  return suggestionsStyle;
}
