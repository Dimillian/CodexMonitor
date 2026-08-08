import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GitHubPullRequest, GitHubPullRequestComment } from "../../../types";
import { formatRelativeTime } from "../../../utils/time";
import { Markdown } from "../../messages/components/Markdown";
import type { DiffStats } from "./GitDiffViewer.types";

export type PullRequestSummaryProps = {
  pullRequest: GitHubPullRequest;
  hasDiffs: boolean;
  diffStats: DiffStats;
  onJumpToFirstFile: () => void;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading: boolean;
  pullRequestCommentsError?: string | null;
  onCheckoutPullRequest?: (
    pullRequest: GitHubPullRequest,
  ) => Promise<void> | void;
};

export const PullRequestSummary = memo(function PullRequestSummary({
  pullRequest,
  hasDiffs,
  diffStats,
  onJumpToFirstFile,
  pullRequestComments,
  pullRequestCommentsLoading,
  pullRequestCommentsError,
  onCheckoutPullRequest,
}: PullRequestSummaryProps) {
  const { t } = useTranslation("git");
  const prUpdatedLabel = pullRequest.updatedAt
    ? formatRelativeTime(new Date(pullRequest.updatedAt).getTime())
    : null;
  const prAuthor = pullRequest.author?.login ?? t("unknown");
  const prBody = pullRequest.body?.trim() ?? "";
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const sortedComments = useMemo(() => {
    if (!pullRequestComments?.length) {
      return [];
    }
    return [...pullRequestComments].sort((a, b) => {
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, [pullRequestComments]);

  const visibleCommentCount = 3;
  const visibleComments = isTimelineExpanded
    ? sortedComments
    : sortedComments.slice(-visibleCommentCount);
  const hiddenCommentCount = Math.max(
    0,
    sortedComments.length - visibleComments.length,
  );

  useEffect(() => {
    setIsTimelineExpanded(false);
  }, [pullRequest.number]);

  return (
    <section className="diff-viewer-pr" aria-label={t("pullRequestSummary")}>
      <div className="diff-viewer-pr-header">
        <div className="diff-viewer-pr-header-row">
          <div className="diff-viewer-pr-title">
            <span className="diff-viewer-pr-number">#{pullRequest.number}</span>
            <span className="diff-viewer-pr-title-text">
              {pullRequest.title}
            </span>
          </div>
          <div className="diff-viewer-pr-header-actions">
            {hasDiffs && (
              <button
                type="button"
                className="ghost diff-viewer-pr-jump"
                onClick={onJumpToFirstFile}
                aria-label={t("jumpToFirstFile")}
              >
                <span className="diff-viewer-pr-jump-add">
                  +{diffStats.additions}
                </span>
                <span className="diff-viewer-pr-jump-sep">/</span>
                <span className="diff-viewer-pr-jump-del">
                  -{diffStats.deletions}
                </span>
              </button>
            )}
            {onCheckoutPullRequest ? (
              <button
                type="button"
                className="ghost diff-viewer-pr-checkout"
                aria-label={t("checkoutPrAria", { number: pullRequest.number })}
                disabled={isCheckingOut}
                onClick={() => {
                  setIsCheckingOut(true);
                  Promise.resolve(onCheckoutPullRequest(pullRequest)).finally(() => {
                    setIsCheckingOut(false);
                  });
                }}
              >
                {isCheckingOut ? t("checkingOut") : t("checkoutBranch")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="diff-viewer-pr-meta">
          <span className="diff-viewer-pr-author">@{prAuthor}</span>
          {prUpdatedLabel && (
            <>
              <span className="diff-viewer-pr-sep">·</span>
              <span>{prUpdatedLabel}</span>
            </>
          )}
          <span className="diff-viewer-pr-sep">·</span>
          <span className="diff-viewer-pr-branch">
            {pullRequest.baseRefName} ← {pullRequest.headRefName}
          </span>
          {pullRequest.isDraft && (
            <span className="diff-viewer-pr-pill">{t("draft")}</span>
          )}
        </div>
      </div>
      <div className="diff-viewer-pr-body">
        {prBody ? (
          <Markdown
            value={prBody}
            className="diff-viewer-pr-markdown markdown"
          />
        ) : (
          <div className="diff-viewer-pr-empty">{t("noDescriptionProvided")}</div>
        )}
      </div>
      <div className="diff-viewer-pr-timeline">
        <div className="diff-viewer-pr-timeline-header">
          <span className="diff-viewer-pr-timeline-title">{t("activity")}</span>
          <span className="diff-viewer-pr-timeline-count">
            {t("commentCount", { count: sortedComments.length })}
          </span>
          {hiddenCommentCount > 0 && (
            <button
              type="button"
              className="ghost diff-viewer-pr-timeline-button"
              onClick={() => setIsTimelineExpanded(true)}
            >
              {t("showAll")}
            </button>
          )}
          {isTimelineExpanded &&
            sortedComments.length > visibleCommentCount && (
              <button
                type="button"
                className="ghost diff-viewer-pr-timeline-button"
                onClick={() => setIsTimelineExpanded(false)}
              >
                {t("collapse")}
              </button>
            )}
        </div>
        <div className="diff-viewer-pr-timeline-list">
          {pullRequestCommentsLoading && (
            <div className="diff-viewer-pr-timeline-state">
              {t("loadingComments")}
            </div>
          )}
          {pullRequestCommentsError && (
            <div className="diff-viewer-pr-timeline-state diff-viewer-pr-timeline-error">
              {pullRequestCommentsError}
            </div>
          )}
          {!pullRequestCommentsLoading &&
            !pullRequestCommentsError &&
            !sortedComments.length && (
              <div className="diff-viewer-pr-timeline-state">
                {t("noCommentsYet")}
              </div>
            )}
          {hiddenCommentCount > 0 && !isTimelineExpanded && (
            <div className="diff-viewer-pr-timeline-divider">
              {t("earlierCommentCount", { count: hiddenCommentCount })}
            </div>
          )}
          {visibleComments.map((comment) => {
            const commentAuthor = comment.author?.login ?? "unknown";
            const commentTime = formatRelativeTime(
              new Date(comment.createdAt).getTime(),
            );
            return (
              <div key={comment.id} className="diff-viewer-pr-timeline-item">
                <div className="diff-viewer-pr-timeline-marker" />
                <div className="diff-viewer-pr-timeline-content">
                  <div className="diff-viewer-pr-timeline-meta">
                    <span className="diff-viewer-pr-timeline-author">
                      @{commentAuthor}
                    </span>
                    <span className="diff-viewer-pr-sep">·</span>
                    <span>{commentTime}</span>
                  </div>
                  {comment.body.trim() ? (
                    <Markdown
                      value={comment.body}
                      className="diff-viewer-pr-comment markdown"
                    />
                  ) : (
                    <div className="diff-viewer-pr-timeline-text">
                      {t("noCommentBody")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
