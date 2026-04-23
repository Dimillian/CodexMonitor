import { useCallback, useRef } from "react";
import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
  SyntheticEvent,
} from "react";
import type { AutocompleteItem } from "../hooks/useComposerAutocomplete";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Mic from "lucide-react/dist/esm/icons/mic";
import Square from "lucide-react/dist/esm/icons/square";
import X from "lucide-react/dist/esm/icons/x";
import { useComposerImageDrop } from "../hooks/useComposerImageDrop";
import { ComposerMobileActionsMenu } from "./ComposerMobileActionsMenu";
import { ComposerSuggestionsPopover } from "./ComposerSuggestionsPopover";
import { ComposerAttachments } from "./ComposerAttachments";
import { DictationWaveform } from "../../dictation/components/DictationWaveform";
import { useComposerDictationControls } from "../hooks/useComposerDictationControls";
import { useComposerInputLayout } from "../hooks/useComposerInputLayout";
import { useComposerMobileActions } from "../hooks/useComposerMobileActions";
import type { ReviewPromptState, ReviewPromptStep } from "../../threads/hooks/useReviewPrompt";
import { useI18n } from "@/i18n";

type ComposerInputProps = {
  text: string;
  disabled: boolean;
  sendLabel: string;
  canStop: boolean;
  canSend: boolean;
  isProcessing: boolean;
  onStop: () => void;
  onSend: () => void;
  dictationState?: "idle" | "listening" | "processing";
  dictationLevel?: number;
  dictationEnabled?: boolean;
  onToggleDictation?: () => void;
  onCancelDictation?: () => void;
  onOpenDictationSettings?: () => void;
  dictationError?: string | null;
  onDismissDictationError?: () => void;
  dictationHint?: string | null;
  onDismissDictationHint?: () => void;
  attachments?: string[];
  onAddAttachment?: () => void;
  onAttachImages?: (paths: string[]) => void;
  onRemoveAttachment?: (path: string) => void;
  onTextChange: (next: string, selectionStart: number | null) => void;
  onTextPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSelectionChange: (selectionStart: number | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  suggestionsOpen: boolean;
  suggestions: AutocompleteItem[];
  highlightIndex: number;
  onHighlightIndex: (index: number) => void;
  onSelectSuggestion: (item: AutocompleteItem) => void;
  suggestionsStyle?: React.CSSProperties;
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
  onReviewPromptSelectBranch?: (value: string) => void;
  onReviewPromptSelectBranchAtIndex?: (index: number) => void;
  onReviewPromptConfirmBranch?: () => Promise<void>;
  onReviewPromptSelectCommit?: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex?: (index: number) => void;
  onReviewPromptConfirmCommit?: () => Promise<void>;
  onReviewPromptUpdateCustomInstructions?: (value: string) => void;
  onReviewPromptConfirmCustom?: () => Promise<void>;
};

export function ComposerInput({
  text,
  disabled,
  sendLabel,
  canStop,
  canSend,
  isProcessing,
  onStop,
  onSend,
  dictationState = "idle",
  dictationLevel = 0,
  dictationEnabled = false,
  onToggleDictation,
  onCancelDictation,
  onOpenDictationSettings,
  dictationError = null,
  onDismissDictationError,
  dictationHint = null,
  onDismissDictationHint,
  attachments = [],
  onAddAttachment,
  onAttachImages,
  onRemoveAttachment,
  onTextChange,
  onTextPaste,
  onSelectionChange,
  onKeyDown,
  isExpanded = false,
  onToggleExpand,
  textareaRef,
  suggestionsOpen,
  suggestions,
  highlightIndex,
  onHighlightIndex,
  onSelectSuggestion,
  suggestionsStyle,
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
  onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex,
  onReviewPromptConfirmBranch,
  onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex,
  onReviewPromptConfirmCommit,
  onReviewPromptUpdateCustomInstructions,
  onReviewPromptConfirmCustom,
}: ComposerInputProps) {
  const { tx } = useI18n();
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { isPhoneLayout, isPhoneTallInput } = useComposerInputLayout({
    isExpanded,
    text,
    textareaRef,
  });
  const { mobileActionsOpen, mobileActionsRef, setMobileActionsOpen } =
    useComposerMobileActions({ disabled });
  const {
    dropTargetRef,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  } = useComposerImageDrop({
    disabled,
    onAttachImages,
  });
  const handleActionClick = useCallback(() => {
    if (canStop) {
      onStop();
      return;
    }
    onSend();
  }, [canStop, onSend, onStop]);
  const {
    handleMicClick,
    isDictating,
    isDictationBusy,
    isDictationProcessing,
    micAriaLabel,
    micDisabled,
    micTitle,
  } = useComposerDictationControls({
    disabled,
    dictationEnabled,
    dictationState,
    onToggleDictation,
    onCancelDictation,
    onOpenDictationSettings,
  });

  const handleTextareaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onTextChange(event.target.value, event.target.selectionStart);
    },
    [onTextChange],
  );

  const handleTextareaSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      onSelectionChange((event.target as HTMLTextAreaElement).selectionStart);
    },
    [onSelectionChange],
  );

  const handleTextareaPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      void handlePaste(event);
      if (!event.defaultPrevented) {
        onTextPaste?.(event);
      }
    },
    [handlePaste, onTextPaste],
  );

  const handleMobileAttachClick = useCallback(() => {
    if (disabled || !onAddAttachment) {
      return;
    }
    setMobileActionsOpen(false);
    onAddAttachment();
  }, [disabled, onAddAttachment]);

  const handleMobileExpandClick = useCallback(() => {
    if (disabled || !onToggleExpand) {
      return;
    }
    setMobileActionsOpen(false);
    onToggleExpand();
  }, [disabled, onToggleExpand]);

  const handleMobileDictationClick = useCallback(() => {
    setMobileActionsOpen(false);
    handleMicClick();
  }, [handleMicClick]);

  return (
    <div className={`composer-input${isPhoneLayout && isPhoneTallInput ? " is-phone-tall" : ""}`}>
      <div
        className={`composer-input-area${isDragOver ? " is-drag-over" : ""}`}
        ref={dropTargetRef}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ComposerAttachments
          attachments={attachments}
          disabled={disabled}
          onRemoveAttachment={onRemoveAttachment}
        />
        <div className="composer-input-row">
          <button
            type="button"
            className="composer-attach"
            onClick={onAddAttachment}
            disabled={disabled || !onAddAttachment}
            aria-label={tx("Add image")}
            title={tx("Add image")}
          >
            <ImagePlus size={14} aria-hidden />
          </button>
          <ComposerMobileActionsMenu
            disabled={disabled}
            handleMobileAttachClick={handleMobileAttachClick}
            handleMobileDictationClick={handleMobileDictationClick}
            handleMobileExpandClick={handleMobileExpandClick}
            isDictating={isDictating}
            isDictationProcessing={isDictationProcessing}
            isExpanded={isExpanded}
            micAriaLabel={micAriaLabel}
            micDisabled={micDisabled}
            mobileActionsOpen={mobileActionsOpen}
            mobileActionsRef={mobileActionsRef}
            onAddAttachment={onAddAttachment}
            onToggleExpand={onToggleExpand}
            setMobileActionsOpen={setMobileActionsOpen}
            showDictationAction={Boolean(
              onToggleDictation || onOpenDictationSettings || onCancelDictation,
            )}
          />
          <textarea
            ref={textareaRef}
            placeholder={
              disabled
                ? tx("Review in progress. Chat will re-enable when it completes.")
                : tx("Ask Codex to do something...")
            }
            value={text}
            onChange={handleTextareaChange}
            onSelect={handleTextareaSelect}
            disabled={disabled}
            onKeyDown={onKeyDown}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handleTextareaPaste}
          />
          <div className="composer-input-actions">
            {onToggleExpand && (
              <button
                className={`composer-action composer-action--expand${
                  isExpanded ? " is-active" : ""
                }`}
                onClick={onToggleExpand}
                disabled={disabled}
                aria-label={isExpanded ? tx("Collapse input") : tx("Expand input")}
                title={isExpanded ? tx("Collapse input") : tx("Expand input")}
              >
                {isExpanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
              </button>
            )}
            <button
              className={`composer-action composer-action--mic${
                isDictationBusy ? " is-active" : ""
              }${isDictationProcessing ? " is-processing is-stop" : ""}${
                micDisabled ? " is-disabled" : ""
              }`}
              onClick={handleMicClick}
              disabled={micDisabled}
              aria-label={micAriaLabel}
              title={micTitle}
            >
              {isDictationProcessing ? (
                <X aria-hidden />
              ) : isDictating ? (
                <Square aria-hidden />
              ) : (
                <Mic aria-hidden />
              )}
            </button>
            <button
              className={`composer-action${canStop ? " is-stop" : " is-send"}${
                canStop && isProcessing ? " is-loading" : ""
              }`}
              onClick={handleActionClick}
              disabled={(disabled && !canStop) || isDictationBusy || (!canStop && !canSend)}
              aria-label={canStop ? tx("Stop") : sendLabel}
              title={canStop ? tx("Stop") : sendLabel}
            >
              {canStop ? (
                <>
                  <span className="composer-action-stop-square" aria-hidden />
                  {isProcessing && (
                    <span className="composer-action-spinner" aria-hidden />
                  )}
                </>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5l6 6m-6-6L6 11m6-6v14"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
        {isDictationBusy && (
          <DictationWaveform
            active={isDictating}
            processing={dictationState === "processing"}
            level={dictationLevel}
          />
        )}
        {dictationError && (
          <div className="composer-dictation-error" role="status">
            <span>{dictationError}</span>
            <button
              type="button"
              className="ghost composer-dictation-error-dismiss"
              onClick={onDismissDictationError}
            >
              {tx("Dismiss")}
            </button>
          </div>
        )}
        {dictationHint && (
          <div className="composer-dictation-hint" role="status">
            <span>{dictationHint}</span>
            {onDismissDictationHint && (
              <button
                type="button"
                className="ghost composer-dictation-error-dismiss"
                onClick={onDismissDictationHint}
              >
                {tx("Dismiss")}
              </button>
            )}
          </div>
        )}
        <ComposerSuggestionsPopover
          highlightIndex={highlightIndex}
          highlightedBranchIndex={highlightedBranchIndex}
          highlightedCommitIndex={highlightedCommitIndex}
          highlightedPresetIndex={highlightedPresetIndex}
          onHighlightIndex={onHighlightIndex}
          onReviewPromptChoosePreset={onReviewPromptChoosePreset}
          onReviewPromptClose={onReviewPromptClose}
          onReviewPromptConfirmBranch={onReviewPromptConfirmBranch}
          onReviewPromptConfirmCommit={onReviewPromptConfirmCommit}
          onReviewPromptConfirmCustom={onReviewPromptConfirmCustom}
          onReviewPromptHighlightBranch={onReviewPromptHighlightBranch}
          onReviewPromptHighlightCommit={onReviewPromptHighlightCommit}
          onReviewPromptHighlightPreset={onReviewPromptHighlightPreset}
          onReviewPromptSelectBranch={onReviewPromptSelectBranch}
          onReviewPromptSelectBranchAtIndex={onReviewPromptSelectBranchAtIndex}
          onReviewPromptSelectCommit={onReviewPromptSelectCommit}
          onReviewPromptSelectCommitAtIndex={onReviewPromptSelectCommitAtIndex}
          onReviewPromptShowPreset={onReviewPromptShowPreset}
          onReviewPromptUpdateCustomInstructions={onReviewPromptUpdateCustomInstructions}
          onSelectSuggestion={onSelectSuggestion}
          reviewPrompt={reviewPrompt}
          suggestionListRef={suggestionListRef}
          suggestionRefs={suggestionRefs}
          suggestions={suggestions}
          suggestionsOpen={suggestionsOpen}
          suggestionsStyle={suggestionsStyle}
        />
      </div>
    </div>
  );
}
