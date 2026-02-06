import { useEffect } from "react";

type AutoExitEmptyDiffOptions = {
  centerMode: "chat" | "diff";
  autoExitEnabled: boolean;
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
  autoExitEnabled,
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
    if (!autoExitEnabled) {
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
    autoExitEnabled,
    activeThreadId,
    centerMode,
    isCompact,
    setActiveTab,
    setCenterMode,
    setSelectedDiffPath,
  ]);
}
