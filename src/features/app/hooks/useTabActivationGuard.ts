import { useEffect } from "react";

type AppTab = "home" | "projects" | "opencode" | "git" | "log";

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
      setActiveTab("opencode");
    }
  }, [activeTab, isTablet, setActiveTab]);
}
