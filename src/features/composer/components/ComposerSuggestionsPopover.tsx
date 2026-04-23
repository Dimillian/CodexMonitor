import { useEffect, type CSSProperties, type RefObject } from "react";
import type { AutocompleteItem } from "../hooks/useComposerAutocomplete";
import Brain from "lucide-react/dist/esm/icons/brain";
import FileText from "lucide-react/dist/esm/icons/file-text";
import GitFork from "lucide-react/dist/esm/icons/git-fork";
import Info from "lucide-react/dist/esm/icons/info";
import PlusCircle from "lucide-react/dist/esm/icons/plus-circle";
import Plug from "lucide-react/dist/esm/icons/plug";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import { PopoverSurface } from "../../design-system/components/popover/PopoverPrimitives";
import { ReviewInlinePrompt } from "./ReviewInlinePrompt";
import type { ReviewPromptState, ReviewPromptStep } from "../../threads/hooks/useReviewPrompt";
import { getFileTypeIconUrl } from "../../../utils/fileTypeIcons";
import { useI18n } from "@/i18n";

type ComposerSuggestionsPopoverProps = {
  highlightIndex: number;
  highlightedBranchIndex?: number;
  highlightedCommitIndex?: number;
  highlightedPresetIndex?: number;
  onHighlightIndex: (index: number) => void;
  onReviewPromptChoosePreset?: (
    preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted",
  ) => void;
  onReviewPromptClose?: () => void;
  onReviewPromptConfirmBranch?: () => Promise<void>;
  onReviewPromptConfirmCommit?: () => Promise<void>;
  onReviewPromptConfirmCustom?: () => Promise<void>;
  onReviewPromptHighlightBranch?: (index: number) => void;
  onReviewPromptHighlightCommit?: (index: number) => void;
  onReviewPromptHighlightPreset?: (index: number) => void;
  onReviewPromptSelectBranch?: (value: string) => void;
  onReviewPromptSelectBranchAtIndex?: (index: number) => void;
  onReviewPromptSelectCommit?: (sha: string, title: string) => void;
  onReviewPromptSelectCommitAtIndex?: (index: number) => void;
  onReviewPromptShowPreset?: () => void;
  onReviewPromptUpdateCustomInstructions?: (value: string) => void;
  onSelectSuggestion: (item: AutocompleteItem) => void;
  reviewPrompt?: ReviewPromptState;
  suggestionListRef: RefObject<HTMLDivElement | null>;
  suggestionRefs: RefObject<Array<HTMLButtonElement | null>>;
  suggestions: AutocompleteItem[];
  suggestionsOpen: boolean;
  suggestionsStyle?: CSSProperties;
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
  if (item.id === "mcp" || item.id === "apps") {
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

export function ComposerSuggestionsPopover({
  highlightIndex,
  highlightedBranchIndex,
  highlightedCommitIndex,
  highlightedPresetIndex,
  onHighlightIndex,
  onReviewPromptChoosePreset,
  onReviewPromptClose,
  onReviewPromptConfirmBranch,
  onReviewPromptConfirmCommit,
  onReviewPromptConfirmCustom,
  onReviewPromptHighlightBranch,
  onReviewPromptHighlightCommit,
  onReviewPromptHighlightPreset,
  onReviewPromptSelectBranch,
  onReviewPromptSelectBranchAtIndex,
  onReviewPromptSelectCommit,
  onReviewPromptSelectCommitAtIndex,
  onReviewPromptShowPreset,
  onReviewPromptUpdateCustomInstructions,
  onSelectSuggestion,
  reviewPrompt,
  suggestionListRef,
  suggestionRefs,
  suggestions,
  suggestionsOpen,
  suggestionsStyle,
}: ComposerSuggestionsPopoverProps) {
  const { tx } = useI18n();
  const reviewPromptOpen = Boolean(reviewPrompt);
  const suggestionsCount = suggestions.length;

  useEffect(() => {
    if (!suggestionsOpen || reviewPromptOpen || suggestionsCount === 0) {
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
  }, [
    highlightIndex,
    reviewPromptOpen,
    suggestionListRef,
    suggestionRefs,
    suggestionsCount,
    suggestionsOpen,
  ]);

  if (!suggestionsOpen) {
    return null;
  }

  return (
    <PopoverSurface
      className={`composer-suggestions${reviewPromptOpen ? " review-inline-suggestions" : ""}`}
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
          const Icon = suggestionIcon(item);
          const fileSuggestion = isFileSuggestion(item);
          const skillSuggestion = item.id.startsWith("skill:");
          const title = fileSuggestion ? fileTitle(item.label) : item.label;
          const description = fileSuggestion ? item.label : item.description;
          const fileTypeIconUrl = fileSuggestion ? getFileTypeIconUrl(item.label) : null;

          return (
            <div key={item.id}>
              {showGroup && <div className="composer-suggestion-section">{tx(item.group ?? "")}</div>}
              <button
                type="button"
                className={`composer-suggestion${index === highlightIndex ? " is-active" : ""}`}
                role="option"
                aria-selected={index === highlightIndex}
                ref={(node) => {
                  suggestionRefs.current[index] = node;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelectSuggestion(item)}
                onMouseEnter={() => onHighlightIndex(index)}
              >
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
                      <span className="composer-suggestion-description">{item.hint}</span>
                    )}
                  </span>
                </span>
              </button>
            </div>
          );
        })
      )}
    </PopoverSurface>
  );
}
