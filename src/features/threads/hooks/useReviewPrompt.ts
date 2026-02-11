import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BranchInfo,
  DebugEntry,
  GitLogEntry,
  ReviewTarget,
  WorkspaceInfo,
} from "@/types";
import { getGitLog, listGitBranches } from "@services/tauri";

export type ReviewPromptStep = "preset" | "baseBranch" | "commit" | "custom";

export type ReviewPromptState = {
  workspace: WorkspaceInfo;
  threadIdSnapshot: string | null;
  step: ReviewPromptStep;
  branches: BranchInfo[];
  commits: GitLogEntry[];
  isLoadingBranches: boolean;
  isLoadingCommits: boolean;
  selectedBranch: string;
  selectedCommitSha: string;
  selectedCommitTitle: string;
  customInstructions: string;
  error: string | null;
  isSubmitting: boolean;
} | null;

type UseReviewPromptOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  onDebug?: (entry: DebugEntry) => void;
  startReviewTarget: (target: ReviewTarget, workspaceId?: string) => Promise<boolean>;
};

type UseReviewPromptResult = {
  reviewPrompt: ReviewPromptState;
  openReviewPrompt: () => void;
  closeReviewPrompt: () => void;
  showPresetStep: () => void;
  choosePreset: (preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted") => void;
  highlightedPresetIndex: number;
  setHighlightedPresetIndex: (index: number) => void;
  highlightedBranchIndex: number;
  setHighlightedBranchIndex: (index: number) => void;
  highlightedCommitIndex: number;
  setHighlightedCommitIndex: (index: number) => void;
  handleReviewPromptKeyDown: (event: {
    key: string;
    shiftKey?: boolean;
    preventDefault: () => void;
  }) => boolean;
  confirmBranch: () => Promise<void>;
  selectBranch: (value: string) => void;
  selectBranchAtIndex: (index: number) => void;
  selectCommit: (sha: string, title: string) => void;
  selectCommitAtIndex: (index: number) => void;
  confirmCommit: () => Promise<void>;
  updateCustomInstructions: (value: string) => void;
  confirmCustom: () => Promise<void>;
};

const PRESET_OPTIONS = ["baseBranch", "uncommitted", "commit", "custom"] as const;

type PresetOption = (typeof PRESET_OPTIONS)[number];

function extractBranches(response: unknown): BranchInfo[] {
  const record = (response ?? {}) as Record<string, unknown>;
  const data = record.branches ?? (record.result as Record<string, unknown> | undefined)?.branches;
  if (!Array.isArray(data)) {
    return [];
  }
  const branches = data
    .map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        name: String(entry.name ?? "").trim(),
        lastCommit: Number(entry.lastCommit ?? entry.last_commit ?? 0),
      } satisfies BranchInfo;
    })
    .filter((branch) => branch.name.length > 0);
  branches.sort((a, b) => {
    const aMain = a.name === "main" ? 0 : 1;
    const bMain = b.name === "main" ? 0 : 1;
    if (aMain !== bMain) {
      return aMain - bMain;
    }
    if (a.lastCommit !== b.lastCommit) {
      return b.lastCommit - a.lastCommit;
    }
    return a.name.localeCompare(b.name);
  });
  return branches;
}

function extractCommits(response: unknown): GitLogEntry[] {
  const record = (response ?? {}) as Record<string, unknown>;
  const resultRecord = record.result as Record<string, unknown> | undefined;
  const data = record.entries ?? resultRecord?.entries;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      const entry = item as Record<string, unknown>;
      return {
        sha: String(entry.sha ?? "").trim(),
        summary: String(entry.summary ?? "").trim(),
        author: String(entry.author ?? "").trim(),
        timestamp: Number(entry.timestamp ?? 0),
      } satisfies GitLogEntry;
    })
    .filter((entry) => entry.sha.length > 0);
}

export function useReviewPrompt({
  activeWorkspace,
  activeThreadId,
  onDebug,
  startReviewTarget,
}: UseReviewPromptOptions): UseReviewPromptResult {
  const [reviewPrompt, setReviewPrompt] = useState<ReviewPromptState>(null);
  const [highlightedPresetIndex, setHighlightedPresetIndex] = useState(0);
  const [highlightedBranchIndex, setHighlightedBranchIndex] = useState(0);
  const [highlightedCommitIndex, setHighlightedCommitIndex] = useState(0);

  const presetCount = useMemo(() => PRESET_OPTIONS.length, []);
  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const activeThreadSnapshot = activeThreadId ?? null;

  const closeReviewPrompt = useCallback(() => {
    setReviewPrompt(null);
  }, []);

  useEffect(() => {
    if (!reviewPrompt) {
      return;
    }
    const workspaceMismatch = activeWorkspaceId !== reviewPrompt.workspace.id;
    const threadMismatch = activeThreadSnapshot !== reviewPrompt.threadIdSnapshot;
    if (!workspaceMismatch && !threadMismatch) {
      return;
    }
    onDebug?.({
      id: `${Date.now()}-client-review-prompt-close-mismatch`,
      timestamp: Date.now(),
      source: "client",
      label: "review/prompt close mismatch",
      payload: {
        activeWorkspaceId,
        promptWorkspaceId: reviewPrompt.workspace.id,
        activeThreadId: activeThreadSnapshot,
        promptThreadId: reviewPrompt.threadIdSnapshot,
        workspaceMismatch,
        threadMismatch,
      },
    });
    setReviewPrompt(null);
  }, [activeThreadSnapshot, activeWorkspaceId, onDebug, reviewPrompt]);

  const showPresetStep = useCallback(() => {
    setHighlightedPresetIndex(0);
    setReviewPrompt((prev) => (prev ? { ...prev, step: "preset", error: null } : prev));
  }, [setHighlightedPresetIndex]);

  const openReviewPrompt = useCallback(() => {
    if (!activeWorkspace) {
      return;
    }
    const workspaceId = activeWorkspace.id;
    setHighlightedPresetIndex(0);
    setHighlightedBranchIndex(0);
    setHighlightedCommitIndex(0);
    setReviewPrompt({
      workspace: activeWorkspace,
      threadIdSnapshot: activeThreadSnapshot,
      step: "preset",
      branches: [],
      commits: [],
      isLoadingBranches: true,
      isLoadingCommits: true,
      selectedBranch: "",
      selectedCommitSha: "",
      selectedCommitTitle: "",
      customInstructions: "",
      error: null,
      isSubmitting: false,
    });

    onDebug?.({
      id: `${Date.now()}-client-review-prompt-load`,
      timestamp: Date.now(),
      source: "client",
      label: "review/prompt load",
      payload: { workspaceId },
    });

    void (async () => {
      const [branchesResult, commitsResult] = await Promise.allSettled([
        listGitBranches(workspaceId),
        getGitLog(workspaceId, 100),
      ]);

      const branches =
        branchesResult.status === "fulfilled" ? extractBranches(branchesResult.value) : [];
      const commits =
        commitsResult.status === "fulfilled" ? extractCommits(commitsResult.value) : [];

      onDebug?.({
        id: `${Date.now()}-server-review-prompt-load`,
        timestamp: Date.now(),
        source: "server",
        label: "review/prompt load response",
        payload: {
          branches: branches.length,
          commits: commits.length,
          branchesError:
            branchesResult.status === "rejected"
              ? branchesResult.reason instanceof Error
                ? branchesResult.reason.message
                : String(branchesResult.reason)
              : null,
          commitsError:
            commitsResult.status === "rejected"
              ? commitsResult.reason instanceof Error
                ? commitsResult.reason.message
                : String(commitsResult.reason)
              : null,
        },
      });

      setReviewPrompt((prev) => {
        if (!prev || prev.workspace.id !== workspaceId) {
          return prev;
        }
        const mainIndex = branches.findIndex((branch) => branch.name === "main");
        const mainBranch = mainIndex >= 0 ? branches[mainIndex] : null;
        const nextSelectedBranch =
          prev.selectedBranch || mainBranch?.name || branches[0]?.name || "";
        const nextSelectedCommitSha = prev.selectedCommitSha || commits[0]?.sha || "";
        const nextSelectedCommitTitle =
          prev.selectedCommitTitle || commits[0]?.summary || commits[0]?.sha || "";
        const nextBranchIndex = branches.findIndex(
          (branch) => branch.name === nextSelectedBranch,
        );
        const nextCommitIndex = commits.findIndex(
          (commit) => commit.sha === nextSelectedCommitSha,
        );
        setHighlightedBranchIndex(nextBranchIndex >= 0 ? nextBranchIndex : 0);
        setHighlightedCommitIndex(nextCommitIndex >= 0 ? nextCommitIndex : 0);
        return {
          ...prev,
          branches,
          commits,
          isLoadingBranches: false,
          isLoadingCommits: false,
          selectedBranch: nextSelectedBranch,
          selectedCommitSha: nextSelectedCommitSha,
          selectedCommitTitle: nextSelectedCommitTitle,
        };
      });
    })();
  }, [activeThreadSnapshot, activeWorkspace, onDebug]);

  const runReviewTarget = useCallback(
    async (target: ReviewTarget) => {
      if (!reviewPrompt) {
        return;
      }
      const workspaceId = reviewPrompt.workspace.id;
      setReviewPrompt((prev) =>
        prev && prev.workspace.id === workspaceId
          ? { ...prev, isSubmitting: true, error: null }
          : prev,
      );
      let success = false;
      try {
        success = await startReviewTarget(target, workspaceId);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-review-start-throw`,
          timestamp: Date.now(),
          source: "error",
          label: "review/start threw",
          payload: error instanceof Error ? error.message : String(error),
        });
        success = false;
      } finally {
        if (success) {
          setReviewPrompt(null);
        } else {
          setReviewPrompt((prev) =>
            prev && prev.workspace.id === workspaceId
              ? { ...prev, isSubmitting: false }
              : prev,
          );
        }
      }
    },
    [onDebug, reviewPrompt, startReviewTarget],
  );

  const choosePreset = useCallback(
    (preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted") => {
      if (!reviewPrompt) {
        return;
      }
      if (preset === "uncommitted") {
        void runReviewTarget({ type: "uncommittedChanges" });
        return;
      }
      setHighlightedBranchIndex(0);
      setHighlightedCommitIndex(0);
      setReviewPrompt((prev) =>
        prev
          ? {
              ...prev,
              step: preset,
              error: null,
              selectedBranch:
                preset === "baseBranch" ? prev.branches[0]?.name ?? "" : prev.selectedBranch,
              selectedCommitSha:
                preset === "commit"
                  ? prev.commits[0]?.sha ?? ""
                  : prev.selectedCommitSha,
              selectedCommitTitle:
                preset === "commit"
                  ? prev.commits[0]?.summary ?? prev.commits[0]?.sha ?? ""
                  : prev.selectedCommitTitle,
            }
          : prev,
      );
    },
    [reviewPrompt, runReviewTarget],
  );

  const selectBranch = useCallback((value: string) => {
    setReviewPrompt((prev) => {
      if (!prev) {
        return prev;
      }
      const nextIndex = prev.branches.findIndex((branch) => branch.name === value);
      if (nextIndex >= 0) {
        setHighlightedBranchIndex(nextIndex);
      }
      return { ...prev, selectedBranch: value, error: null };
    });
  }, []);

  const selectBranchAtIndex = useCallback((index: number) => {
    setReviewPrompt((prev) => {
      if (!prev || prev.branches.length === 0) {
        return prev;
      }
      const safeIndex = Math.max(0, Math.min(index, prev.branches.length - 1));
      const branch = prev.branches[safeIndex];
      if (!branch) {
        return prev;
      }
      setHighlightedBranchIndex(safeIndex);
      return { ...prev, selectedBranch: branch.name, error: null };
    });
  }, []);

  const confirmBranch = useCallback(async () => {
    if (!reviewPrompt) {
      return;
    }
    const branch = reviewPrompt.selectedBranch.trim();
    if (!branch) {
      setReviewPrompt((prev) =>
        prev ? { ...prev, error: "Choose a base branch." } : prev,
      );
      return;
    }
    await runReviewTarget({ type: "baseBranch", branch });
  }, [reviewPrompt, runReviewTarget]);

  const selectCommit = useCallback((sha: string, title: string) => {
    setReviewPrompt((prev) => {
      if (!prev) {
        return prev;
      }
      const nextIndex = prev.commits.findIndex((commit) => commit.sha === sha);
      if (nextIndex >= 0) {
        setHighlightedCommitIndex(nextIndex);
      }
      return {
        ...prev,
        selectedCommitSha: sha,
        selectedCommitTitle: title,
        error: null,
      };
    });
  }, []);

  const selectCommitAtIndex = useCallback((index: number) => {
    setReviewPrompt((prev) => {
      if (!prev || prev.commits.length === 0) {
        return prev;
      }
      const safeIndex = Math.max(0, Math.min(index, prev.commits.length - 1));
      const commit = prev.commits[safeIndex];
      if (!commit) {
        return prev;
      }
      const title = commit.summary || commit.sha;
      setHighlightedCommitIndex(safeIndex);
      return {
        ...prev,
        selectedCommitSha: commit.sha,
        selectedCommitTitle: title,
        error: null,
      };
    });
  }, []);

  const confirmCommit = useCallback(async () => {
    if (!reviewPrompt) {
      return;
    }
    const sha = reviewPrompt.selectedCommitSha.trim();
    if (!sha) {
      setReviewPrompt((prev) =>
        prev ? { ...prev, error: "Choose a commit to review." } : prev,
      );
      return;
    }
    const title = reviewPrompt.selectedCommitTitle.trim();
    await runReviewTarget({
      type: "commit",
      sha,
      ...(title ? { title } : {}),
    });
  }, [reviewPrompt, runReviewTarget]);

  const updateCustomInstructions = useCallback((value: string) => {
    setReviewPrompt((prev) =>
      prev ? { ...prev, customInstructions: value, error: null } : prev,
    );
  }, []);

  const confirmCustom = useCallback(async () => {
    if (!reviewPrompt) {
      return;
    }
    const instructions = reviewPrompt.customInstructions.trim();
    if (!instructions) {
      setReviewPrompt((prev) =>
        prev ? { ...prev, error: "Enter custom review instructions." } : prev,
      );
      return;
    }
    await runReviewTarget({ type: "custom", instructions });
  }, [reviewPrompt, runReviewTarget]);

  const handleReviewPromptKeyDown = useCallback(
    (event: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
      if (!reviewPrompt) {
        return false;
      }
      const { key } = event;
      if (reviewPrompt.isSubmitting) {
        if (key === "Enter" || key === "Escape" || key.startsWith("Arrow")) {
          event.preventDefault();
        }
        return true;
      }
      const isRoot = reviewPrompt.step === "preset";

      if (key === "Escape") {
        event.preventDefault();
        if (isRoot) {
          closeReviewPrompt();
        } else {
          showPresetStep();
        }
        return true;
      }

      if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        const direction = key === "ArrowDown" ? 1 : -1;
        if (reviewPrompt.step === "preset") {
          const next = (highlightedPresetIndex + direction + presetCount) % presetCount;
          setHighlightedPresetIndex(next);
          return true;
        }
        if (reviewPrompt.step === "baseBranch") {
          if (reviewPrompt.branches.length === 0) {
            return true;
          }
          const count = reviewPrompt.branches.length;
          const next = (highlightedBranchIndex + direction + count) % count;
          selectBranchAtIndex(next);
          return true;
        }
        if (reviewPrompt.step === "commit") {
          if (reviewPrompt.commits.length === 0) {
            return true;
          }
          const count = reviewPrompt.commits.length;
          const next = (highlightedCommitIndex + direction + count) % count;
          selectCommitAtIndex(next);
          return true;
        }
      }

      if (key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (reviewPrompt.step === "preset") {
          const preset = PRESET_OPTIONS[highlightedPresetIndex] ?? "baseBranch";
          choosePreset(preset as PresetOption);
          return true;
        }
        if (reviewPrompt.step === "baseBranch") {
          void confirmBranch();
          return true;
        }
        if (reviewPrompt.step === "commit") {
          void confirmCommit();
          return true;
        }
        if (reviewPrompt.step === "custom") {
          void confirmCustom();
          return true;
        }
      }

      return false;
    },
    [
      reviewPrompt,
      closeReviewPrompt,
      showPresetStep,
      highlightedPresetIndex,
      presetCount,
      highlightedBranchIndex,
      highlightedCommitIndex,
      selectBranchAtIndex,
      selectCommitAtIndex,
      choosePreset,
      confirmBranch,
      confirmCommit,
      confirmCustom,
    ],
  );

  return {
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  };
}
