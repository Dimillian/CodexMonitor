import { useEffect } from "react";

type AutoExitEmptyDiffOptions = {
  centerMode: "chat" | "diff";
  activeDiffCount: number;
  activeDiffLoading: boolean;
  activeDiffError: string | null;
  activeThreadId: string | null;
  isCompact: boolean;
  setCenterMode: (mode: "chat" | "diff") => void;
  setSelectedDiffPath: (path: string | null) => void;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
};

export function useAutoExitEmptyDiff({
  centerMode,
  activeDiffCount,
  activeDiffLoading,
  activeDiffError,
  activeThreadId,
  isCompact,
  setCenterMode,
  setSelectedDiffPath,
  setActiveTab,
}: AutoExitEmptyDiffOptions) {
  useEffect(() => {
    if (centerMode !== "diff") {
      return;
    }
    if (activeDiffLoading || activeDiffError) {
      return;
    }
    if (activeDiffCount > 0) {
      return;
    }
    if (!activeThreadId) {
      return;
    }
    setCenterMode("chat");
    setSelectedDiffPath(null);
    if (isCompact) {
      setActiveTab("codex");
    }
  }, [
    activeDiffCount,
    activeDiffError,
    activeDiffLoading,
    activeThreadId,
    centerMode,
    isCompact,
    setActiveTab,
    setCenterMode,
    setSelectedDiffPath,
  ]);
}
