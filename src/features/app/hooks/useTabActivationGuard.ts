import { useEffect } from "react";
import type { WorkspaceInfo } from "../../../types";

type AppTab = "home" | "projects" | "codex" | "git" | "log";

type UseTabActivationGuardOptions = {
  activeTab: AppTab;
  activeWorkspace: WorkspaceInfo | null;
  isPhone: boolean;
  isTablet: boolean;
  setActiveTab: (tab: AppTab) => void;
};

export function useTabActivationGuard({
  activeTab,
  activeWorkspace,
  isPhone,
  isTablet,
  setActiveTab,
}: UseTabActivationGuardOptions) {
  useEffect(() => {
    if (!isPhone) {
      return;
    }
    if (!activeWorkspace && activeTab !== "home" && activeTab !== "projects") {
      setActiveTab("home");
    }
  }, [activeTab, activeWorkspace, isPhone, setActiveTab]);

  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects" || activeTab === "home") {
      setActiveTab("codex");
    }
  }, [activeTab, isTablet, setActiveTab]);
}
