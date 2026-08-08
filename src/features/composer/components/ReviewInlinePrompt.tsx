import { memo, useMemo } from "react";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";
import { useTranslation } from "react-i18next";

type ReviewInlinePromptProps = {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onClose: () => void;
  onShowPreset: () => void;
  onChoosePreset: (preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted") => void;
  highlightedPresetIndex: number;
  onHighlightPreset: (index: number) => void;
  highlightedBranchIndex: number;
  onHighlightBranch: (index: number) => void;
  highlightedCommitIndex: number;
  onHighlightCommit: (index: number) => void;
  onSelectBranch: (value: string) => void;
  onSelectBranchAtIndex: (index: number) => void;
  onConfirmBranch: () => Promise<void>;
  onSelectCommit: (sha: string, title: string) => void;
  onSelectCommitAtIndex: (index: number) => void;
  onConfirmCommit: () => Promise<void>;
  onUpdateCustomInstructions: (value: string) => void;
  onConfirmCustom: () => Promise<void>;
};

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

const PresetStep = memo(function PresetStep({
  onChoosePreset,
  isSubmitting,
  highlightedPresetIndex,
  onHighlightPreset,
}: {
  onChoosePreset: ReviewInlinePromptProps["onChoosePreset"];
  isSubmitting: boolean;
  highlightedPresetIndex: number;
  onHighlightPreset: (index: number) => void;
}) {
  const { t } = useTranslation("composer");
  const optionClass = (index: number) =>
    `review-inline-option${index === highlightedPresetIndex ? " is-selected" : ""}`;
  return (
    <div className="review-inline-section">
      <button
        type="button"
        className={optionClass(0)}
        onClick={() => onChoosePreset("baseBranch")}
        onMouseEnter={() => onHighlightPreset(0)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("reviewAgainstBaseBranch")}</span>
        <span className="review-inline-option-subtitle">{t("prStyle")}</span>
      </button>
      <button
        type="button"
        className={optionClass(1)}
        onClick={() => onChoosePreset("uncommitted")}
        onMouseEnter={() => onHighlightPreset(1)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("reviewUncommittedChanges")}</span>
      </button>
      <button
        type="button"
        className={optionClass(2)}
        onClick={() => onChoosePreset("commit")}
        onMouseEnter={() => onHighlightPreset(2)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("reviewCommit")}</span>
      </button>
      <button
        type="button"
        className={optionClass(3)}
        onClick={() => onChoosePreset("custom")}
        onMouseEnter={() => onHighlightPreset(3)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("customReviewInstructions")}</span>
      </button>
    </div>
  );
});

const BaseBranchStep = memo(function BaseBranchStep({
  reviewPrompt,
  onShowPreset,
  onSelectBranch,
  onSelectBranchAtIndex,
  onConfirmBranch,
  highlightedBranchIndex,
  onHighlightBranch,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onShowPreset: () => void;
  onSelectBranch: (value: string) => void;
  onSelectBranchAtIndex: (index: number) => void;
  onConfirmBranch: () => Promise<void>;
  highlightedBranchIndex: number;
  onHighlightBranch: (index: number) => void;
}) {
  const { t } = useTranslation("composer");
  const branches = reviewPrompt.branches;
  return (
    <div className="review-inline-section">
      <div className="review-inline-row">
        <button
          type="button"
          className="ghost review-inline-back"
          onClick={onShowPreset}
          disabled={reviewPrompt.isSubmitting}
        >
          {t("back")}
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmBranch()}
          disabled={reviewPrompt.isSubmitting || !reviewPrompt.selectedBranch.trim()}
        >
          {t("startReview")}
        </button>
      </div>
      <div className="review-inline-hint">{t("pickBranch")}</div>
      <div className="review-inline-list" role="listbox" aria-label={t("baseBranches")}>
        {reviewPrompt.isLoadingBranches ? (
          <div className="review-inline-empty">{t("loadingBranches")}</div>
        ) : branches.length === 0 ? (
          <div className="review-inline-empty">{t("noBranchesFound")}</div>
        ) : (
          branches.map((branch, index) => {
            const selected = index === highlightedBranchIndex;
            return (
              <button
                key={branch.name}
                type="button"
                role="option"
                aria-selected={selected}
                className={`review-inline-list-item${selected ? " is-selected" : ""}`}
                onClick={() => onSelectBranch(branch.name)}
                onMouseEnter={() => {
                  onHighlightBranch(index);
                  onSelectBranchAtIndex(index);
                }}
                disabled={reviewPrompt.isSubmitting}
              >
                {branch.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

const CommitStep = memo(function CommitStep({
  reviewPrompt,
  onShowPreset,
  onSelectCommit,
  onSelectCommitAtIndex,
  onConfirmCommit,
  highlightedCommitIndex,
  onHighlightCommit,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onShowPreset: () => void;
  onSelectCommit: (sha: string, title: string) => void;
  onSelectCommitAtIndex: (index: number) => void;
  onConfirmCommit: () => Promise<void>;
  highlightedCommitIndex: number;
  onHighlightCommit: (index: number) => void;
}) {
  const { t } = useTranslation("composer");
  const commits = reviewPrompt.commits;
  return (
    <div className="review-inline-section">
      <div className="review-inline-row">
        <button
          type="button"
          className="ghost review-inline-back"
          onClick={onShowPreset}
          disabled={reviewPrompt.isSubmitting}
        >
          {t("back")}
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmCommit()}
          disabled={reviewPrompt.isSubmitting || !reviewPrompt.selectedCommitSha}
        >
          {t("startReview")}
        </button>
      </div>
      <div className="review-inline-hint">{t("selectCommit")}</div>
      <div className="review-inline-list" role="listbox" aria-label={t("commits")}>
        {reviewPrompt.isLoadingCommits ? (
          <div className="review-inline-empty">{t("loadingCommits")}</div>
        ) : commits.length === 0 ? (
          <div className="review-inline-empty">{t("noCommitsFound")}</div>
        ) : (
          commits.map((commit, index) => {
            const title = commit.summary || commit.sha;
            const selected = index === highlightedCommitIndex;
            return (
              <button
                key={commit.sha}
                type="button"
                role="option"
                aria-selected={selected}
                className={`review-inline-list-item review-inline-commit${
                  selected ? " is-selected" : ""
                }`}
                onClick={() => onSelectCommit(commit.sha, title)}
                onMouseEnter={() => {
                  onHighlightCommit(index);
                  onSelectCommitAtIndex(index);
                }}
                disabled={reviewPrompt.isSubmitting}
              >
                <span className="review-inline-commit-title">{title}</span>
                <span className="review-inline-commit-meta">{shortSha(commit.sha)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

const CustomStep = memo(function CustomStep({
  reviewPrompt,
  onShowPreset,
  onUpdateCustomInstructions,
  onConfirmCustom,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onShowPreset: () => void;
  onUpdateCustomInstructions: (value: string) => void;
  onConfirmCustom: () => Promise<void>;
}) {
  const { t } = useTranslation("composer");
  const canSubmit = reviewPrompt.customInstructions.trim().length > 0;
  return (
    <div className="review-inline-section">
      <div className="review-inline-row">
        <button
          type="button"
          className="ghost review-inline-back"
          onClick={onShowPreset}
          disabled={reviewPrompt.isSubmitting}
        >
          {t("back")}
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmCustom()}
          disabled={reviewPrompt.isSubmitting || !canSubmit}
        >
          {t("startReview")}
        </button>
      </div>
      <label className="review-inline-label" htmlFor="review-inline-custom-instructions">
        {t("instructions")}
      </label>
      <textarea
        id="review-inline-custom-instructions"
        className="review-inline-textarea"
        value={reviewPrompt.customInstructions}
        onChange={(event) => onUpdateCustomInstructions(event.target.value)}
        placeholder={t("placeholderCustomInstructions")}
        autoFocus
        rows={6}
      />
    </div>
  );
});

export const ReviewInlinePrompt = memo(function ReviewInlinePrompt({
  reviewPrompt,
  onClose,
  onShowPreset,
  onChoosePreset,
  highlightedPresetIndex,
  onHighlightPreset,
  highlightedBranchIndex,
  onHighlightBranch,
  highlightedCommitIndex,
  onHighlightCommit,
  onSelectBranch,
  onSelectBranchAtIndex,
  onConfirmBranch,
  onSelectCommit,
  onSelectCommitAtIndex,
  onConfirmCommit,
  onUpdateCustomInstructions,
  onConfirmCustom,
}: ReviewInlinePromptProps) {
  const { t } = useTranslation("composer");
  const { step, error, isSubmitting } = reviewPrompt;

  const title = useMemo(() => {
    switch (step) {
      case "baseBranch":
        return t("selectBaseBranch");
      case "commit":
        return t("selectCommitToReview");
      case "custom":
        return t("customReviewInstructions");
      case "preset":
      default:
        return t("selectReviewPreset");
    }
  }, [step]);

  return (
    <div className="review-inline" role="dialog" aria-label={title}>
      <div className="review-inline-header">
        <div className="review-inline-title">{title}</div>
        <div className="review-inline-subtitle">{reviewPrompt.workspace.name}</div>
      </div>

      {step === "preset" ? (
        <PresetStep
          onChoosePreset={onChoosePreset}
          isSubmitting={isSubmitting}
          highlightedPresetIndex={highlightedPresetIndex}
          onHighlightPreset={onHighlightPreset}
        />
      ) : step === "baseBranch" ? (
        <BaseBranchStep
          reviewPrompt={reviewPrompt}
          onShowPreset={onShowPreset}
          onSelectBranch={onSelectBranch}
          onSelectBranchAtIndex={onSelectBranchAtIndex}
          onConfirmBranch={onConfirmBranch}
          highlightedBranchIndex={highlightedBranchIndex}
          onHighlightBranch={onHighlightBranch}
        />
      ) : step === "commit" ? (
        <CommitStep
          reviewPrompt={reviewPrompt}
          onShowPreset={onShowPreset}
          onSelectCommit={onSelectCommit}
          onSelectCommitAtIndex={onSelectCommitAtIndex}
          onConfirmCommit={onConfirmCommit}
          highlightedCommitIndex={highlightedCommitIndex}
          onHighlightCommit={onHighlightCommit}
        />
      ) : (
        <CustomStep
          reviewPrompt={reviewPrompt}
          onShowPreset={onShowPreset}
          onUpdateCustomInstructions={onUpdateCustomInstructions}
          onConfirmCustom={onConfirmCustom}
        />
      )}

      {error && <div className="review-inline-error">{error}</div>}

      <div className="review-inline-actions">
        <button type="button" className="ghost review-inline-button" onClick={onClose}>
          {t("common:close")}
        </button>
      </div>
    </div>
  );
});
