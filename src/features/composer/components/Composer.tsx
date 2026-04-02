import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  AppMention,
  AppOption,
  ComposerSendIntent,
  ComposerEditorSettings,
  CustomPromptOption,
  DictationTranscript,
  FollowUpMessageBehavior,
  QueuedMessage,
  ServiceTier,
  ThreadTokenUsage,
} from "../../../types";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";
import {
  connectorMentionSlug,
  resolveBoundAppMentions,
  type AppMentionBinding,
} from "../../apps/utils/appMentions";
import {
  getFenceTriggerLine,
  getLineIndent,
  isCodeLikeSingleLine,
  isCursorInsideFence,
  normalizePastedText,
} from "../../../utils/composerText";
import { useComposerAutocompleteState } from "../hooks/useComposerAutocompleteState";
import { useComposerDraftEffects } from "../hooks/useComposerDraftEffects";
import { useComposerKeyDown } from "../hooks/useComposerKeyDown";
import { useComposerSuggestionStyle } from "../hooks/useComposerSuggestionStyle";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { ComposerInput } from "./ComposerInput";
import { ComposerMetaBar } from "./ComposerMetaBar";
import { ComposerQueue } from "./ComposerQueue";
import { isMacPlatform } from "../../../utils/platformPaths";
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";

type ComposerProps = {
  onSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
    submitIntent?: ComposerSendIntent,
  ) => void;
  onStop: () => void;
  canStop: boolean;
  disabled?: boolean;
  appsEnabled: boolean;
  isProcessing: boolean;
  steerAvailable: boolean;
  followUpMessageBehavior: FollowUpMessageBehavior;
  composerFollowUpHintEnabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  selectedServiceTier: ServiceTier | null;
  reasoningSupported: boolean;
  codexArgsOptions?: CodexArgsOption[];
  selectedCodexArgsOverride?: string | null;
  onSelectCodexArgsOverride?: (value: string | null) => void;
  accessMode: "read-only" | "current" | "full-access";
  onSelectAccessMode: (mode: "read-only" | "current" | "full-access") => void;
  skills: { name: string; description?: string }[];
  apps: AppOption[];
  prompts: CustomPromptOption[];
  files: string[];
  contextUsage?: ThreadTokenUsage | null;
  queuedMessages?: QueuedMessage[];
  queuePausedReason?: string | null;
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
  onCancelDictation?: () => void;
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
  contextActions?: {
    id: string;
    label: string;
    title?: string;
    disabled?: boolean;
    onSelect: () => void | Promise<void>;
  }[];
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

export const Composer = memo(function Composer({
  onSend,
  onStop,
  canStop,
  disabled = false,
  appsEnabled,
  isProcessing,
  steerAvailable,
  followUpMessageBehavior,
  composerFollowUpHintEnabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  selectedServiceTier,
  reasoningSupported,
  codexArgsOptions = [],
  selectedCodexArgsOverride = null,
  onSelectCodexArgsOverride,
  accessMode,
  onSelectAccessMode,
  skills,
  apps,
  prompts,
  files,
  contextUsage = null,
  queuedMessages = [],
  queuePausedReason = null,
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
  onCancelDictation,
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
  contextActions = [],
}: ComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(draftText);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [appMentionBindings, setAppMentionBindings] = useState<AppMentionBinding[]>([]);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const editorSettings = editorSettingsProp ?? DEFAULT_EDITOR_SETTINGS;
  const isDictationBusy = dictationState !== "idle";
  const canSend = text.trim().length > 0 || attachedImages.length > 0;
  const isMac = isMacPlatform();
  const followUpShortcutLabel = isMac ? "Shift+Cmd+Enter" : "Shift+Ctrl+Enter";
  const effectiveFollowUpBehavior: FollowUpMessageBehavior =
    followUpMessageBehavior === "steer" && steerAvailable ? "steer" : "queue";
  const oppositeFollowUpIntent: ComposerSendIntent =
    effectiveFollowUpBehavior === "queue" ? "steer" : "queue";
  const oppositeFallsBackToQueue =
    oppositeFollowUpIntent === "steer" && !steerAvailable;
  const defaultSubmitIntent: ComposerSendIntent = isProcessing
    ? effectiveFollowUpBehavior
    : "default";
  const oppositeSubmitIntent: ComposerSendIntent = isProcessing
    ? oppositeFollowUpIntent
    : "default";
  const effectiveSendLabel = isProcessing
    ? effectiveFollowUpBehavior === "steer"
      ? "Steer"
      : "Queue"
    : sendLabel;
  const {
    expandFenceOnSpace,
    expandFenceOnEnter,
    fenceLanguageTags,
    fenceWrapSelection,
    autoWrapPasteMultiline,
    autoWrapPasteCodeLike,
    continueListOnShiftEnter,
  } = editorSettings;

  const setComposerText = useCallback(
    (next: string) => {
      setText(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );
  const syncDraftText = useCallback((next: string) => {
    setText((prev) => (prev === next ? prev : next));
  }, []);

  const bindingsFromMentions = useCallback(
    (mentions?: AppMention[]) =>
      (mentions ?? []).map((mention) => ({
        slug: connectorMentionSlug(mention.name),
        mention,
      })),
    [],
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
    onItemApplied: (item, context) => {
      if (context.triggerChar !== "$" || item.group !== "Apps" || !item.mentionPath) {
        return;
      }
      const slug = context.insertedText.trim().toLowerCase();
      if (!slug) {
        return;
      }
      const nextBinding: AppMentionBinding = {
        slug,
        mention: {
          name: item.label,
          path: item.mentionPath,
        },
      };
      setAppMentionBindings((prev) => {
        const filtered = prev.filter(
          (binding) =>
            !(
              binding.slug === nextBinding.slug &&
              binding.mention.path === nextBinding.mention.path
            ),
        );
        return [...filtered, nextBinding];
      });
    },
  });
  useEffect(() => {
    onFileAutocompleteActiveChange?.(fileTriggerActive);
  }, [fileTriggerActive, onFileAutocompleteActiveChange]);
  const reviewPromptOpen = Boolean(reviewPrompt);
  const suggestionsOpen = reviewPromptOpen || isAutocompleteOpen;
  const suggestions = reviewPromptOpen ? [] : autocompleteMatches;
  const suggestionsStyle = useComposerSuggestionStyle({
    isAutocompleteOpen,
    autocompleteAnchorIndex,
    selectionStart,
    text,
    textareaRef,
  });

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

  const handleSend = useCallback((submitIntent: ComposerSendIntent = "default") => {
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
    const resolvedMentions = resolveBoundAppMentions(trimmed, appMentionBindings);
    if (resolvedMentions.length > 0) {
      onSend(trimmed, attachedImages, resolvedMentions, submitIntent);
    } else {
      onSend(trimmed, attachedImages, undefined, submitIntent);
    }
    resetHistoryNavigation();
    setComposerText("");
    setAppMentionBindings([]);
  }, [
    appMentionBindings,
    attachedImages,
    disabled,
    onSend,
    recordHistory,
    resetHistoryNavigation,
    setComposerText,
    text,
  ]);

  useComposerDraftEffects({
    draftText,
    historyKey,
    prefillDraft,
    onPrefillHandled,
    insertText,
    onInsertHandled,
    dictationTranscript,
    onDictationTranscriptHandled,
    textareaRef,
    selectionStart,
    syncDraftText,
    text,
    setComposerText,
    setAppMentionBindings,
    bindingsFromMentions,
    resetHistoryNavigation,
    handleSelectionChange,
  });

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
  const handleKeyDown = useComposerKeyDown({
    applyTextInsertion,
    canSend,
    continueListOnShiftEnter,
    defaultSubmitIntent,
    expandFenceOnEnter,
    expandFenceOnSpace,
    handleHistoryKeyDown,
    handleInputKeyDown,
    handleSend,
    isDictationBusy,
    isMac,
    onReviewPromptKeyDown,
    oppositeSubmitIntent,
    reviewPromptOpen,
    suggestionsOpen,
    text,
    textareaRef,
    tryExpandFence,
  });


  return (
    <footer className={`composer${disabled ? " is-disabled" : ""}`}>
      <ComposerQueue
        queuedMessages={queuedMessages}
        pausedReason={queuePausedReason}
        onEditQueued={onEditQueued}
        onDeleteQueued={onDeleteQueued}
      />
      {isProcessing && composerFollowUpHintEnabled && (
        <div className="composer-followup-hint" role="status" aria-live="polite">
          <div className="composer-followup-title">
            {t("uiText.composerFollowUp.title")}
          </div>
          <div className="composer-followup-copy">
            {oppositeFallsBackToQueue ? (
              t("uiText.composerFollowUp.unavailableCopy", {
                shortcut: followUpShortcutLabel,
                queueLabel: t("settings.composer.queue"),
                steerLabel: t("settings.composer.steer"),
                queueVerb: t("uiText.composerFollowUp.queueVerb"),
              })
            ) : (
              t("uiText.composerFollowUp.defaultCopy", {
                behavior:
                  effectiveFollowUpBehavior === "steer"
                    ? t("settings.composer.steer")
                    : t("settings.composer.queue"),
                shortcut: followUpShortcutLabel,
                action:
                  oppositeFollowUpIntent === "steer"
                    ? t("uiText.composerFollowUp.steerVerb")
                    : t("uiText.composerFollowUp.queueVerb"),
              })
            )}
          </div>
        </div>
      )}
      {contextActions.length > 0 ? (
        <div className="composer-context-actions" role="toolbar" aria-label="Review tools">
          {contextActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ghost composer-context-action"
              title={action.title}
              disabled={disabled || Boolean(action.disabled)}
              onClick={() => {
                void action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <ComposerInput
        text={text}
        disabled={disabled}
        sendLabel={effectiveSendLabel}
        canStop={canStop}
        canSend={canSend}
        isProcessing={isProcessing}
        onStop={onStop}
        onSend={() => handleSend(defaultSubmitIntent)}
        dictationEnabled={dictationEnabled}
        dictationState={dictationState}
        dictationLevel={dictationLevel}
        onToggleDictation={onToggleDictation}
        onCancelDictation={onCancelDictation}
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
        onKeyDown={handleKeyDown}
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
        selectedServiceTier={selectedServiceTier}
        reasoningSupported={reasoningSupported}
        codexArgsOptions={codexArgsOptions}
        selectedCodexArgsOverride={selectedCodexArgsOverride}
        onSelectCodexArgsOverride={onSelectCodexArgsOverride}
        accessMode={accessMode}
        onSelectAccessMode={onSelectAccessMode}
        contextUsage={contextUsage}
      />
    </footer>
  );
});

Composer.displayName = "Composer";
