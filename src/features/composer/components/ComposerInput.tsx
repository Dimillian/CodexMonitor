import { useEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent, RefObject } from "react";
import type { AutocompleteItem } from "../hooks/useComposerAutocomplete";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Mic from "lucide-react/dist/esm/icons/mic";
import Square from "lucide-react/dist/esm/icons/square";
import { useComposerImageDrop } from "../hooks/useComposerImageDrop";
import { ComposerAttachments } from "./ComposerAttachments";
import { DictationWaveform } from "../../dictation/components/DictationWaveform";

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
}: ComposerInputProps) {
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const minTextareaHeight = isExpanded ? 180 : 60;
  const maxTextareaHeight = isExpanded ? 320 : 120;
  const isFileSuggestion = (item: AutocompleteItem) =>
    item.label.includes("/") || item.label.includes("\\");
  const fileTitle = (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : path;
  };
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
    if (!suggestionsOpen) {
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

  const handleActionClick = () => {
    if (canStop) {
      onStop();
    } else {
      onSend();
    }
  };
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
  const handleMicClick = () => {
    if (allowOpenDictationSettings) {
      onOpenDictationSettings?.();
      return;
    }
    if (!onToggleDictation || micDisabled) {
      return;
    }
    onToggleDictation();
  };

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
            onChange={(event) =>
              onTextChange(event.target.value, event.target.selectionStart)
            }
            onSelect={(event) =>
              onSelectionChange(
                (event.target as HTMLTextAreaElement).selectionStart,
              )
            }
            disabled={disabled}
            onKeyDown={onKeyDown}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={(event) => {
              void handlePaste(event);
              if (!event.defaultPrevented) {
                onTextPaste?.(event);
              }
            }}
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
            className="composer-suggestions popover-surface"
            role="listbox"
            ref={suggestionListRef}
            style={suggestionsStyle}
          >
            {suggestions.map((item, index) => (
              <button
                key={item.id}
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
                {isFileSuggestion(item) ? (
                  <>
                    <span className="composer-suggestion-title">
                      {fileTitle(item.label)}
                    </span>
                    <span className="composer-suggestion-description">
                      {item.label}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="composer-suggestion-title">{item.label}</span>
                    {item.description && (
                      <span className="composer-suggestion-description">
                        {item.description}
                      </span>
                    )}
                    {item.hint && (
                      <span className="composer-suggestion-description">
                        {item.hint}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
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
