import { useCallback, useEffect, useRef } from "react";
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
import Brain from "lucide-react/dist/esm/icons/brain";
import GitFork from "lucide-react/dist/esm/icons/git-fork";
import PlusCircle from "lucide-react/dist/esm/icons/plus-circle";
import Info from "lucide-react/dist/esm/icons/info";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Plug from "lucide-react/dist/esm/icons/plug";
import { useComposerImageDrop } from "../hooks/useComposerImageDrop";
import { ComposerAttachments } from "./ComposerAttachments";
import { DictationWaveform } from "../../dictation/components/DictationWaveform";
import { ReviewInlinePrompt } from "./ReviewInlinePrompt";
import type { ReviewPromptState, ReviewPromptStep } from "../../threads/hooks/useReviewPrompt";
import { getFileTypeIconUrl } from "../../../utils/fileTypeIcons";

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

const isFileSuggestion = (item: AutocompleteItem) => item.group === "Files";

const suggestionIcon = (item: AutocompleteItem) => {
  if (isFileSuggestion(item)) {
    return FileText;
  }
  if (item.id.startsWith("skill:")) {
    return Wrench;
  }
  if (item.id.startsWith("app:")) {
    return Plug;
  }
  if (item.id === "review") {
    return Brain;
  }
  if (item.id === "fork") {
    return GitFork;
  }
  if (item.id === "mcp") {
    return Plug;
  }
  if (item.id === "apps") {
    return Plug;
  }
  if (item.id === "new") {
    return PlusCircle;
  }
  if (item.id === "resume") {
    return RotateCcw;
  }
  if (item.id === "status") {
    return Info;
  }
  if (item.id.startsWith("prompt:")) {
    return ScrollText;
  }
  return Wrench;
};

const fileTitle = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
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
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const minTextareaHeight = isExpanded ? 180 : 60;
  const maxTextareaHeight = isExpanded ? 320 : 120;
  const reviewPromptOpen = Boolean(reviewPrompt);
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

  useEffect(() => {
    if (!suggestionsOpen || suggestions.length === 0) {
      return;
    }
    const list = suggestionListRef.current;
    const item = suggestionRefs.current[highlightIndex];
    if (!list || !item) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      item.scrollIntoView({ block: "nearest" });
      return;
    }
    if (itemRect.bottom > listRect.bottom) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, suggestionsOpen, suggestions.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.minHeight = `${minTextareaHeight}px`;
    textarea.style.maxHeight = `${maxTextareaHeight}px`;
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, minTextareaHeight),
      maxTextareaHeight,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
  }, [maxTextareaHeight, minTextareaHeight, text, textareaRef]);

  const handleActionClick = useCallback(() => {
    if (canStop) {
      onStop();
    } else {
      onSend();
    }
  }, [canStop, onSend, onStop]);
  const isDictating = dictationState === "listening";
  const isDictationBusy = dictationState !== "idle";
  const allowOpenDictationSettings = Boolean(
    onOpenDictationSettings && !dictationEnabled && !disabled,
  );
  const micDisabled =
    disabled || dictationState === "processing" || !dictationEnabled || !onToggleDictation;
  const micAriaLabel = allowOpenDictationSettings
    ? "Open dictation settings"
    : dictationState === "processing"
      ? "Dictation processing"
      : isDictating
        ? "Stop dictation"
        : "Start dictation";
  const micTitle = allowOpenDictationSettings
    ? "Dictation disabled. Open settings"
    : dictationState === "processing"
      ? "Processing dictation"
      : isDictating
        ? "Stop dictation"
        : "Start dictation";
  const handleMicClick = useCallback(() => {
    if (allowOpenDictationSettings) {
      onOpenDictationSettings?.();
      return;
    }
    if (!onToggleDictation || micDisabled) {
      return;
    }
    onToggleDictation();
  }, [
    allowOpenDictationSettings,
    micDisabled,
    onOpenDictationSettings,
    onToggleDictation,
  ]);

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

  return (
    <div className="composer-input">
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
            aria-label="Add image"
            title="Add image"
          >
            <ImagePlus size={14} aria-hidden />
          </button>
          <textarea
            ref={textareaRef}
            placeholder={
              disabled
                ? "Review in progress. Chat will re-enable when it completes."
                : "Ask Codex to do something..."
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
              Dismiss
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
                Dismiss
              </button>
            )}
          </div>
        )}
        {suggestionsOpen && (
          <div
            className={`composer-suggestions popover-surface${
              reviewPromptOpen ? " review-inline-suggestions" : ""
            }`}
            role="listbox"
            ref={suggestionListRef}
            style={suggestionsStyle}
          >
            {reviewPromptOpen &&
            reviewPrompt &&
            onReviewPromptClose &&
            onReviewPromptShowPreset &&
            onReviewPromptChoosePreset &&
            highlightedPresetIndex !== undefined &&
            onReviewPromptHighlightPreset &&
            highlightedBranchIndex !== undefined &&
            onReviewPromptHighlightBranch &&
            highlightedCommitIndex !== undefined &&
            onReviewPromptHighlightCommit &&
            onReviewPromptSelectBranch &&
            onReviewPromptSelectBranchAtIndex &&
            onReviewPromptConfirmBranch &&
            onReviewPromptSelectCommit &&
            onReviewPromptSelectCommitAtIndex &&
            onReviewPromptConfirmCommit &&
            onReviewPromptUpdateCustomInstructions &&
            onReviewPromptConfirmCustom ? (
              <ReviewInlinePrompt
                reviewPrompt={reviewPrompt}
                onClose={onReviewPromptClose}
                onShowPreset={onReviewPromptShowPreset}
                onChoosePreset={onReviewPromptChoosePreset}
                highlightedPresetIndex={highlightedPresetIndex}
                onHighlightPreset={onReviewPromptHighlightPreset}
                highlightedBranchIndex={highlightedBranchIndex}
                onHighlightBranch={onReviewPromptHighlightBranch}
                highlightedCommitIndex={highlightedCommitIndex}
                onHighlightCommit={onReviewPromptHighlightCommit}
                onSelectBranch={onReviewPromptSelectBranch}
                onSelectBranchAtIndex={onReviewPromptSelectBranchAtIndex}
                onConfirmBranch={onReviewPromptConfirmBranch}
                onSelectCommit={onReviewPromptSelectCommit}
                onSelectCommitAtIndex={onReviewPromptSelectCommitAtIndex}
                onConfirmCommit={onReviewPromptConfirmCommit}
                onUpdateCustomInstructions={onReviewPromptUpdateCustomInstructions}
                onConfirmCustom={onReviewPromptConfirmCustom}
              />
            ) : (
              suggestions.map((item, index) => {
                const prevGroup = suggestions[index - 1]?.group;
                const showGroup = Boolean(item.group && item.group !== prevGroup);
                return (
                  <div key={item.id}>
                    {showGroup && (
                      <div className="composer-suggestion-section">{item.group}</div>
                    )}
                    <button
                      type="button"
                      className={`composer-suggestion${
                        index === highlightIndex ? " is-active" : ""
                      }`}
                      role="option"
                      aria-selected={index === highlightIndex}
                      ref={(node) => {
                        suggestionRefs.current[index] = node;
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectSuggestion(item)}
                      onMouseEnter={() => onHighlightIndex(index)}
                    >
                      {(() => {
                        const Icon = suggestionIcon(item);
                        const fileSuggestion = isFileSuggestion(item);
                        const skillSuggestion = item.id.startsWith("skill:");
                        const title = fileSuggestion ? fileTitle(item.label) : item.label;
                        const description = fileSuggestion ? item.label : item.description;
                        const fileTypeIconUrl = fileSuggestion
                          ? getFileTypeIconUrl(item.label)
                          : null;
                        return (
                          <span className="composer-suggestion-row">
                            <span className="composer-suggestion-icon" aria-hidden>
                              {fileTypeIconUrl ? (
                                <img
                                  className="composer-suggestion-icon-image"
                                  src={fileTypeIconUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Icon size={14} />
                              )}
                            </span>
                            <span className="composer-suggestion-content">
                              <span className="composer-suggestion-title">{title}</span>
                              {description && (
                                <span
                                  className={`composer-suggestion-description${
                                    skillSuggestion ? " composer-suggestion-description--skill" : ""
                                  }`}
                                >
                                  {description}
                                </span>
                              )}
                              {!fileSuggestion && item.hint && (
                                <span className="composer-suggestion-description">
                                  {item.hint}
                                </span>
                              )}
                            </span>
                          </span>
                        );
                      })()}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {onToggleExpand && (
        <button
          className={`composer-action composer-action--expand${
            isExpanded ? " is-active" : ""
          }`}
          onClick={onToggleExpand}
          disabled={disabled}
          aria-label={isExpanded ? "Collapse input" : "Expand input"}
          title={isExpanded ? "Collapse input" : "Expand input"}
        >
          {isExpanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
        </button>
      )}
      <button
        className={`composer-action composer-action--mic${
          isDictationBusy ? " is-active" : ""
        }${dictationState === "processing" ? " is-processing" : ""}${
          micDisabled ? " is-disabled" : ""
        }`}
        onClick={handleMicClick}
        disabled={
          disabled ||
          dictationState === "processing" ||
          (!onToggleDictation && !allowOpenDictationSettings)
        }
        aria-label={micAriaLabel}
        title={micTitle}
      >
        {isDictating ? <Square aria-hidden /> : <Mic aria-hidden />}
      </button>
      <button
        className={`composer-action${canStop ? " is-stop" : " is-send"}${
          canStop && isProcessing ? " is-loading" : ""
        }`}
        onClick={handleActionClick}
        disabled={disabled || isDictationBusy || (!canStop && !canSend)}
        aria-label={canStop ? "Stop" : sendLabel}
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
  );
}
