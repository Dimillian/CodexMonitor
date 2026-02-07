import { memo, useMemo } from "react";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";

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
        <span className="review-inline-option-title">基于基础分支审查</span>
        <span className="review-inline-option-subtitle">(PR 风格)</span>
      </button>
      <button
        type="button"
        className={optionClass(1)}
        onClick={() => onChoosePreset("uncommitted")}
        onMouseEnter={() => onHighlightPreset(1)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">审查未提交的更改</span>
      </button>
      <button
        type="button"
        className={optionClass(2)}
        onClick={() => onChoosePreset("commit")}
        onMouseEnter={() => onHighlightPreset(2)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">审查某次提交</span>
      </button>
      <button
        type="button"
        className={optionClass(3)}
        onClick={() => onChoosePreset("custom")}
        onMouseEnter={() => onHighlightPreset(3)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">自定义审查说明</span>
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
          返回
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmBranch()}
          disabled={reviewPrompt.isSubmitting || !reviewPrompt.selectedBranch.trim()}
        >
          开始审查
        </button>
      </div>
      <div className="review-inline-hint">选择最近的本地分支：</div>
      <div className="review-inline-list" role="listbox" aria-label="基础分支">
        {reviewPrompt.isLoadingBranches ? (
          <div className="review-inline-empty">正在加载分支…</div>
        ) : branches.length === 0 ? (
          <div className="review-inline-empty">未找到分支。</div>
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
          返回
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmCommit()}
          disabled={reviewPrompt.isSubmitting || !reviewPrompt.selectedCommitSha}
        >
          开始审查
        </button>
      </div>
      <div className="review-inline-hint">选择最近的提交：</div>
      <div className="review-inline-list" role="listbox" aria-label="提交">
        {reviewPrompt.isLoadingCommits ? (
          <div className="review-inline-empty">正在加载提交…</div>
        ) : commits.length === 0 ? (
          <div className="review-inline-empty">未找到提交。</div>
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
          返回
        </button>
        <button
          type="button"
          className="primary review-inline-confirm"
          onClick={() => void onConfirmCustom()}
          disabled={reviewPrompt.isSubmitting || !canSubmit}
        >
          开始审查
        </button>
      </div>
      <label className="review-inline-label" htmlFor="review-inline-custom-instructions">
        说明
      </label>
      <textarea
        id="review-inline-custom-instructions"
        className="review-inline-textarea"
        value={reviewPrompt.customInstructions}
        onChange={(event) => onUpdateCustomInstructions(event.target.value)}
        placeholder="关注正确性、边界情况和缺失的测试。"
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
  const { step, error, isSubmitting } = reviewPrompt;

  const title = useMemo(() => {
    switch (step) {
      case "baseBranch":
        return "选择基础分支";
      case "commit":
        return "选择要审查的提交";
      case "custom":
        return "自定义审查说明";
      case "preset":
      default:
        return "选择审查预设";
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
          关闭
        </button>
      </div>
    </div>
  );
});
