import { useEffect } from "react";

type AppTab = "home" | "projects" | "codex" | "git" | "log";

type UseTabActivationGuardOptions = {
  activeTab: AppTab;
  isTablet: boolean;
  setActiveTab: (tab: AppTab) => void;
};

export function useTabActivationGuard({
  activeTab,
  isTablet,
  setActiveTab,
}: UseTabActivationGuardOptions) {
  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects" || activeTab === "home") {
      setActiveTab("codex");
    }
  }, [activeTab, isTablet, setActiveTab]);
}
