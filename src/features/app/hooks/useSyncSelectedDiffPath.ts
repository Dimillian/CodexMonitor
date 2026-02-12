import { useEffect } from "react";
import type { GitCommitDiff, GitHubPullRequestDiff } from "../../../types";
import type { GitDiffSource } from "../../git/types";
import type { PerFileDiffGroup } from "../../git/utils/perFileThreadDiffs";

type Params = {
  diffSource: GitDiffSource;
  centerMode: "chat" | "diff";
  gitPullRequestDiffs: GitHubPullRequestDiff[];
  gitCommitDiffs: GitCommitDiff[];
  perFileDiffGroups: PerFileDiffGroup[];
  selectedDiffPath: string | null;
  setSelectedDiffPath: (path: string | null) => void;
};

export function useSyncSelectedDiffPath({
  diffSource,
  centerMode,
  gitPullRequestDiffs,
  gitCommitDiffs,
  perFileDiffGroups,
  selectedDiffPath,
  setSelectedDiffPath,
}: Params) {
  useEffect(() => {
    if (diffSource !== "pr" || centerMode !== "diff") {
      return;
    }
    if (!gitPullRequestDiffs.length) {
      return;
    }
    if (
      selectedDiffPath &&
      gitPullRequestDiffs.some((entry) => entry.path === selectedDiffPath)
    ) {
      return;
    }
    setSelectedDiffPath(gitPullRequestDiffs[0].path);
  }, [
    centerMode,
    diffSource,
    gitPullRequestDiffs,
    selectedDiffPath,
    setSelectedDiffPath,
  ]);

  useEffect(() => {
    if (diffSource !== "perFile" || centerMode !== "diff") {
      return;
    }
    const perFileDiffs = perFileDiffGroups.flatMap((group) => group.edits);
    if (!perFileDiffs.length) {
      return;
    }
    if (selectedDiffPath && perFileDiffs.some((entry) => entry.id === selectedDiffPath)) {
      return;
    }
    setSelectedDiffPath(perFileDiffs[0].id);
  }, [
    centerMode,
    diffSource,
    perFileDiffGroups,
    selectedDiffPath,
    setSelectedDiffPath,
  ]);

  useEffect(() => {
    if (diffSource !== "commit" || centerMode !== "diff") {
      return;
    }
    if (!gitCommitDiffs.length) {
      return;
    }
    if (
      selectedDiffPath &&
      gitCommitDiffs.some((entry) => entry.path === selectedDiffPath)
    ) {
      return;
    }
    setSelectedDiffPath(gitCommitDiffs[0].path);
  }, [
    centerMode,
    diffSource,
    gitCommitDiffs,
    selectedDiffPath,
    setSelectedDiffPath,
  ]);
}
