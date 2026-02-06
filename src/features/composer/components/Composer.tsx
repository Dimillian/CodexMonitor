import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
} from "react";
import type {
  AppOption,
  ComposerEditorSettings,
  CustomPromptOption,
  DictationTranscript,
  QueuedMessage,
  ThreadTokenUsage,
} from "../../../types";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";
import { computeDictationInsertion } from "../../../utils/dictation";
import { isComposingEvent } from "../../../utils/keys";
import {
  getFenceTriggerLine,
  getLineIndent,
  getListContinuation,
  isCodeLikeSingleLine,
  isCursorInsideFence,
  normalizePastedText,
} from "../../../utils/composerText";
import { getCaretPosition } from "../../../utils/caretPosition";
import { useComposerAutocompleteState } from "../hooks/useComposerAutocompleteState";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { ComposerInput } from "./ComposerInput";
import { ComposerMetaBar } from "./ComposerMetaBar";
import { ComposerQueue } from "./ComposerQueue";

type ComposerProps = {
  onSend: (text: string, images: string[]) => void;
  onQueue: (text: string, images: string[]) => void;
  onStop: () => void;
  canStop: boolean;
  disabled?: boolean;
  appsEnabled: boolean;
  isProcessing: boolean;
  steerEnabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  accessMode: "read-only" | "current" | "full-access";
  onSelectAccessMode: (mode: "read-only" | "current" | "full-access") => void;
  skills: { name: string; description?: string }[];
  apps: AppOption[];
  prompts: CustomPromptOption[];
  files: string[];
  contextUsage?: ThreadTokenUsage | null;
  queuedMessages?: QueuedMessage[];
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  sendLabel?: string;
  draftText?: string;
  onDraftChange?: (text: string) => void;
  historyKey?: string | null;
  attachedImages?: string[];
  onPickImages?: () => void;
  onAttachImages?: (paths: string[]) => void;
  onRemoveImage?: (path: string) => void;
  prefillDraft?: QueuedMessage | null;
  onPrefillHandled?: (id: string) => void;
  insertText?: QueuedMessage | null;
  onInsertHandled?: (id: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  editorSettings?: ComposerEditorSettings;
  editorExpanded?: boolean;
  onToggleEditorExpanded?: () => void;
  dictationEnabled?: boolean;
  dictationState?: "idle" | "listening" | "processing";
  dictationLevel?: number;
  onToggleDictation?: () => void;
  onOpenDictationSettings?: () => void;
  dictationTranscript?: DictationTranscript | null;
  onDictationTranscriptHandled?: (id: string) => void;
  dictationError?: string | null;
  onDismissDictationError?: () => void;
  dictationHint?: string | null;
  onDismissDictationHint?: () => void;
  reviewPrompt?: ReviewPromptState;
  onReviewPromptClose?: () => void;
  onReviewPromptShowPreset?: () => void;
  onReviewPromptChoosePreset?: (
    preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted",
  ) => void;
  highlightedPresetIndex?: number;
  onReviewPromptHighlightPreset?: (index: number) => void;
  highlightedBranchIndex?: number;
  onReviewPromptHighlightBranch?: (index: number) => void;
  highlightedCommitIndex?: number;
  onReviewPromptHighlightCommit?: (index: number) => void;
  onReviewPromptKeyDown?: (event: {
    key: string;
    shiftKey?: boolean;
    preventDefault: () => void;
  }) => boolean;
  onReviewPromptSelectBranch?: (value: string) => void;
  onReviewPromptSelectBranchAtIndex?: (index: number) => void;
  onReviewPromptConfirmBranch?: () => Promise<void>;
  onReviewPromptSelectCommit?: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex?: (index: number) => void;
  onReviewPromptConfirmCommit?: () => Promise<void>;
  onReviewPromptUpdateCustomInstructions?: (value: string) => void;
  onReviewPromptConfirmCustom?: () => Promise<void>;
  onFileAutocompleteActiveChange?: (active: boolean) => void;
};

const DEFAULT_EDITOR_SETTINGS: ComposerEditorSettings = {
  preset: "default",
  expandFenceOnSpace: false,
  expandFenceOnEnter: false,
  fenceLanguageTags: false,
  fenceWrapSelection: false,
  autoWrapPasteMultiline: false,
  autoWrapPasteCodeLike: false,
  continueListOnShiftEnter: false,
};
const CARET_ANCHOR_GAP = 8;

export function Composer({
  onSend,
  onQueue,
  onStop,
  canStop,
  disabled = false,
  appsEnabled,
  isProcessing,
  steerEnabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  accessMode,
  onSelectAccessMode,
  skills,
  apps,
  prompts,
  files,
  contextUsage = null,
  queuedMessages = [],
  onEditQueued,
  onDeleteQueued,
  sendLabel = "Send",
  draftText = "",
  onDraftChange,
  historyKey = null,
  attachedImages = [],
  onPickImages,
  onAttachImages,
  onRemoveImage,
  prefillDraft = null,
  onPrefillHandled,
  insertText = null,
  onInsertHandled,
  textareaRef: externalTextareaRef,
  editorSettings: editorSettingsProp,
  editorExpanded = false,
  onToggleEditorExpanded,
  dictationEnabled = false,
  dictationState = "idle",
  dictationLevel = 0,
  onToggleDictation,
  onOpenDictationSettings,
  dictationTranscript = null,
  onDictationTranscriptHandled,
  dictationError = null,
  onDismissDictationError,
  dictationHint = null,
  onDismissDictationHint,
  reviewPrompt,
  onReviewPromptClose,
  onReviewPromptShowPreset,
  onReviewPromptChoosePreset,
  highlightedPresetIndex,
  onReviewPromptHighlightPreset,
  highlightedBranchIndex,
  onReviewPromptHighlightBranch,
  highlightedCommitIndex,
  onReviewPromptHighlightCommit,
  onReviewPromptKeyDown,
  onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex,
  onReviewPromptConfirmBranch,
  onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex,
  onReviewPromptConfirmCommit,
  onReviewPromptUpdateCustomInstructions,
  onReviewPromptConfirmCustom,
  onFileAutocompleteActiveChange,
}: ComposerProps) {
  const [text, setText] = useState(draftText);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [suggestionsStyle, setSuggestionsStyle] = useState<
    CSSProperties | undefined
  >(undefined);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const editorSettings = editorSettingsProp ?? DEFAULT_EDITOR_SETTINGS;
  const isDictationBusy = dictationState !== "idle";
  const canSend = text.trim().length > 0 || attachedImages.length > 0;
  const {
    expandFenceOnSpace,
    expandFenceOnEnter,
    fenceLanguageTags,
    fenceWrapSelection,
    autoWrapPasteMultiline,
    autoWrapPasteCodeLike,
    continueListOnShiftEnter,
  } = editorSettings;

  useEffect(() => {
    setText((prev) => (prev === draftText ? prev : draftText));
  }, [draftText]);

  const setComposerText = useCallback(
    (next: string) => {
      setText(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );

  const {
    isAutocompleteOpen,
    autocompleteMatches,
    autocompleteAnchorIndex,
    highlightIndex,
    setHighlightIndex,
    applyAutocomplete,
    handleInputKeyDown,
    handleTextChange,
    handleSelectionChange,
    fileTriggerActive,
  } = useComposerAutocompleteState({
    text,
    selectionStart,
    disabled,
    appsEnabled,
    skills,
    apps,
    prompts,
    files,
    textareaRef,
    setText: setComposerText,
    setSelectionStart,
  });
  useEffect(() => {
    onFileAutocompleteActiveChange?.(fileTriggerActive);
  }, [fileTriggerActive, onFileAutocompleteActiveChange]);
  const reviewPromptOpen = Boolean(reviewPrompt);
  const suggestionsOpen = reviewPromptOpen || isAutocompleteOpen;
  const suggestions = reviewPromptOpen ? [] : autocompleteMatches;

  useLayoutEffect(() => {
    if (!isAutocompleteOpen) {
      setSuggestionsStyle(undefined);
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const cursor = autocompleteAnchorIndex ?? textarea.selectionStart ?? selectionStart ?? text.length;
    const caret = getCaretPosition(textarea, cursor);
    if (!caret) {
      return;
    }
    const textareaRect = textarea.getBoundingClientRect();
    const container = textarea.closest(".composer-input");
    const containerRect = container?.getBoundingClientRect();
    const offsetLeft = textareaRect.left - (containerRect?.left ?? 0);
    const containerWidth = container?.clientWidth ?? textarea.clientWidth ?? 0;
    const popoverWidth = Math.min(containerWidth, 420);
    const rawLeft = offsetLeft + caret.left;
    const maxLeft = Math.max(0, containerWidth - popoverWidth);
    const left = Math.min(Math.max(0, rawLeft), maxLeft);
    setSuggestionsStyle({
      left,
      right: "auto",
      bottom: `calc(100% + ${CARET_ANCHOR_GAP}px)`,
      top: "auto",
    });
  }, [autocompleteAnchorIndex, isAutocompleteOpen, selectionStart, text, textareaRef]);

  const {
    handleHistoryKeyDown,
    handleHistoryTextChange,
    recordHistory,
    resetHistoryNavigation,
  } = usePromptHistory({
    historyKey,
    text,
    hasAttachments: attachedImages.length > 0,
    disabled,
    isAutocompleteOpen: suggestionsOpen,
    textareaRef,
    setText: setComposerText,
    setSelectionStart,
  });

  const handleTextChangeWithHistory = useCallback(
    (next: string, cursor: number | null) => {
      handleHistoryTextChange(next);
      handleTextChange(next, cursor);
    },
    [handleHistoryTextChange, handleTextChange],
  );

  const handleSend = useCallback(() => {
    if (disabled) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && attachedImages.length === 0) {
      return;
    }
    if (trimmed) {
      recordHistory(trimmed);
    }
    onSend(trimmed, attachedImages);
    resetHistoryNavigation();
    setComposerText("");
  }, [
    attachedImages,
    disabled,
    onSend,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    text,
  ]);

  const handleQueue = useCallback(() => {
    if (disabled) {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && attachedImages.length === 0) {
      return;
    }
    if (trimmed) {
      recordHistory(trimmed);
    }
    onQueue(trimmed, attachedImages);
    resetHistoryNavigation();
    setComposerText("");
  }, [
    attachedImages,
    disabled,
    onQueue,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    text,
  ]);

  useEffect(() => {
    if (!prefillDraft) {
      return;
    }
    setComposerText(prefillDraft.text);
    resetHistoryNavigation();
    onPrefillHandled?.(prefillDraft.id);
  }, [onPrefillHandled, prefillDraft, resetHistoryNavigation, setComposerText]);

  useEffect(() => {
    if (!insertText) {
      return;
    }
    setComposerText(insertText.text);
    resetHistoryNavigation();
    onInsertHandled?.(insertText.id);
  }, [insertText, onInsertHandled, resetHistoryNavigation, setComposerText]);

  useEffect(() => {
    if (!dictationTranscript) {
      return;
    }
    const textToInsert = dictationTranscript.text.trim();
    if (!textToInsert) {
      onDictationTranscriptHandled?.(dictationTranscript.id);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const { nextText, nextCursor } = computeDictationInsertion(
      text,
      textToInsert,
      start,
      end,
    );
    setComposerText(nextText);
    resetHistoryNavigation();
    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      handleSelectionChange(nextCursor);
    });
    onDictationTranscriptHandled?.(dictationTranscript.id);
  }, [
    dictationTranscript,
    handleSelectionChange,
    onDictationTranscriptHandled,
    resetHistoryNavigation,
    selectionStart,
    setComposerText,
    text,
    textareaRef,
  ]);

  const applyTextInsertion = useCallback(
    (nextText: string, nextCursor: number) => {
      setComposerText(nextText);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
        handleSelectionChange(nextCursor);
      });
    },
    [handleSelectionChange, setComposerText, textareaRef],
  );

  const handleTextPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        return;
      }
      if (!autoWrapPasteMultiline && !autoWrapPasteCodeLike) {
        return;
      }
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (!pasted) {
        return;
      }
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? start;
      if (isCursorInsideFence(text, start)) {
        return;
      }
      const normalized = normalizePastedText(pasted);
      if (!normalized) {
        return;
      }
      const isMultiline = normalized.includes("\n");
      if (isMultiline && !autoWrapPasteMultiline) {
        return;
      }
      if (
        !isMultiline &&
        !(autoWrapPasteCodeLike && isCodeLikeSingleLine(normalized))
      ) {
        return;
      }
      event.preventDefault();
      const indent = getLineIndent(text, start);
      const content = indent
        ? normalized
            .split("\n")
            .map((line) => `${indent}${line}`)
            .join("\n")
        : normalized;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const block = `${indent}\`\`\`\n${content}\n${indent}\`\`\``;
      const nextText = `${before}${block}${after}`;
      const nextCursor = before.length + block.length;
      applyTextInsertion(nextText, nextCursor);
    },
    [
      applyTextInsertion,
      autoWrapPasteCodeLike,
      autoWrapPasteMultiline,
      disabled,
      text,
      textareaRef,
    ],
  );

  const tryExpandFence = useCallback(
    (start: number, end: number) => {
      if (start !== end && !fenceWrapSelection) {
        return false;
      }
      const fence = getFenceTriggerLine(text, start, fenceLanguageTags);
      if (!fence) {
        return false;
      }
      const before = text.slice(0, fence.lineStart);
      const after = text.slice(fence.lineEnd);
      const openFence = `${fence.indent}\`\`\`${fence.tag}`;
      const closeFence = `${fence.indent}\`\`\``;
      if (fenceWrapSelection && start !== end) {
        const selection = normalizePastedText(text.slice(start, end));
        const content = fence.indent
          ? selection
              .split("\n")
              .map((line) => `${fence.indent}${line}`)
              .join("\n")
          : selection;
        const block = `${openFence}\n${content}\n${closeFence}`;
        const nextText = `${before}${block}${after}`;
        const nextCursor = before.length + block.length;
        applyTextInsertion(nextText, nextCursor);
        return true;
      }
      const block = `${openFence}\n${fence.indent}\n${closeFence}`;
      const nextText = `${before}${block}${after}`;
      const nextCursor =
        before.length + openFence.length + 1 + fence.indent.length;
      applyTextInsertion(nextText, nextCursor);
      return true;
    },
    [applyTextInsertion, fenceLanguageTags, fenceWrapSelection, text],
  );


  return (
    <footer className={`composer${disabled ? " is-disabled" : ""}`}>
      <ComposerQueue
        queuedMessages={queuedMessages}
        onEditQueued={onEditQueued}
        onDeleteQueued={onDeleteQueued}
      />
      <ComposerInput
        text={text}
        disabled={disabled}
        sendLabel={sendLabel}
        canStop={canStop}
        canSend={canSend}
        isProcessing={isProcessing}
        onStop={onStop}
        onSend={handleSend}
        dictationEnabled={dictationEnabled}
        dictationState={dictationState}
        dictationLevel={dictationLevel}
        onToggleDictation={onToggleDictation}
        onOpenDictationSettings={onOpenDictationSettings}
        dictationError={dictationError}
        onDismissDictationError={onDismissDictationError}
        dictationHint={dictationHint}
        onDismissDictationHint={onDismissDictationHint}
        attachments={attachedImages}
        onAddAttachment={onPickImages}
        onAttachImages={onAttachImages}
        onRemoveAttachment={onRemoveImage}
        onTextChange={handleTextChangeWithHistory}
        onSelectionChange={handleSelectionChange}
        onTextPaste={handleTextPaste}
        isExpanded={editorExpanded}
        onToggleExpand={onToggleEditorExpanded}
        onKeyDown={(event) => {
          if (isComposingEvent(event)) {
            return;
          }
          handleHistoryKeyDown(event);
          if (event.defaultPrevented) {
            return;
          }
          if (
            expandFenceOnSpace &&
            event.key === " " &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            const textarea = textareaRef.current;
            if (!textarea) {
              return;
            }
            const start = textarea.selectionStart ?? text.length;
            const end = textarea.selectionEnd ?? start;
            if (tryExpandFence(start, end)) {
              event.preventDefault();
              return;
            }
          }
          if (event.key === "Enter" && event.shiftKey) {
            if (continueListOnShiftEnter && !suggestionsOpen) {
              const textarea = textareaRef.current;
              if (textarea) {
                const start = textarea.selectionStart ?? text.length;
                const end = textarea.selectionEnd ?? start;
                if (start === end) {
                  const marker = getListContinuation(text, start);
                  if (marker) {
                    event.preventDefault();
                    const before = text.slice(0, start);
                    const after = text.slice(end);
                    const nextText = `${before}\n${marker}${after}`;
                    const nextCursor = before.length + 1 + marker.length;
                    applyTextInsertion(nextText, nextCursor);
                    return;
                  }
                }
              }
            }
            event.preventDefault();
            const textarea = textareaRef.current;
            if (!textarea) {
              return;
            }
            const start = textarea.selectionStart ?? text.length;
            const end = textarea.selectionEnd ?? start;
            const nextText = `${text.slice(0, start)}\n${text.slice(end)}`;
            const nextCursor = start + 1;
            applyTextInsertion(nextText, nextCursor);
            return;
          }
          if (
            event.key === "Tab" &&
            !event.shiftKey &&
            steerEnabled &&
            isProcessing &&
            !suggestionsOpen
          ) {
            event.preventDefault();
            handleQueue();
            return;
          }
          if (reviewPromptOpen && onReviewPromptKeyDown) {
            const handled = onReviewPromptKeyDown(event);
            if (handled) {
              return;
            }
          }
          handleInputKeyDown(event);
          if (event.defaultPrevented) {
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            if (expandFenceOnEnter) {
              const textarea = textareaRef.current;
              if (textarea) {
                const start = textarea.selectionStart ?? text.length;
                const end = textarea.selectionEnd ?? start;
                if (tryExpandFence(start, end)) {
                  event.preventDefault();
                  return;
                }
              }
            }
            if (isDictationBusy) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            handleSend();
          }
        }}
        textareaRef={textareaRef}
        suggestionsOpen={suggestionsOpen}
        suggestions={suggestions}
        highlightIndex={highlightIndex}
        onHighlightIndex={setHighlightIndex}
        onSelectSuggestion={applyAutocomplete}
        suggestionsStyle={suggestionsStyle}
        reviewPrompt={reviewPrompt}
        onReviewPromptClose={onReviewPromptClose}
        onReviewPromptShowPreset={onReviewPromptShowPreset}
        onReviewPromptChoosePreset={onReviewPromptChoosePreset}
        highlightedPresetIndex={highlightedPresetIndex}
        onReviewPromptHighlightPreset={onReviewPromptHighlightPreset}
        highlightedBranchIndex={highlightedBranchIndex}
        onReviewPromptHighlightBranch={onReviewPromptHighlightBranch}
        highlightedCommitIndex={highlightedCommitIndex}
        onReviewPromptHighlightCommit={onReviewPromptHighlightCommit}
        onReviewPromptSelectBranch={onReviewPromptSelectBranch}
        onReviewPromptSelectBranchAtIndex={onReviewPromptSelectBranchAtIndex}
        onReviewPromptConfirmBranch={onReviewPromptConfirmBranch}
        onReviewPromptSelectCommit={onReviewPromptSelectCommit}
        onReviewPromptSelectCommitAtIndex={onReviewPromptSelectCommitAtIndex}
        onReviewPromptConfirmCommit={onReviewPromptConfirmCommit}
        onReviewPromptUpdateCustomInstructions={onReviewPromptUpdateCustomInstructions}
        onReviewPromptConfirmCustom={onReviewPromptConfirmCustom}
      />
      <ComposerMetaBar
        disabled={disabled}
        collaborationModes={collaborationModes}
        selectedCollaborationModeId={selectedCollaborationModeId}
        onSelectCollaborationMode={onSelectCollaborationMode}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={onSelectModel}
        reasoningOptions={reasoningOptions}
        selectedEffort={selectedEffort}
        onSelectEffort={onSelectEffort}
        reasoningSupported={reasoningSupported}
        accessMode={accessMode}
        onSelectAccessMode={onSelectAccessMode}
        contextUsage={contextUsage}
      />
    </footer>
  );
}
