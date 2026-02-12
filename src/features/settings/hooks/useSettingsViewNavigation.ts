import { useCallback, useEffect, useState } from "react";
import type { CodexSection } from "@settings/components/settingsTypes";
import { SETTINGS_MOBILE_BREAKPOINT_PX } from "@settings/components/settingsViewConstants";
import { isNarrowSettingsViewport } from "@settings/components/settingsViewHelpers";

type UseSettingsViewNavigationParams = {
  initialSection?: CodexSection;
};

export const useSettingsViewNavigation = ({
  initialSection,
}: UseSettingsViewNavigationParams) => {
  const [activeSection, setActiveSection] = useState<CodexSection>("projects");
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    isNarrowSettingsViewport(),
  );
  const [showMobileDetail, setShowMobileDetail] = useState(Boolean(initialSection));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(`(max-width: ${SETTINGS_MOBILE_BREAKPOINT_PX}px)`);
    const applyViewportState = () => {
      setIsNarrowViewport(query.matches);
    };
    applyViewportState();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", applyViewportState);
      return () => {
        query.removeEventListener("change", applyViewportState);
      };
    }
    query.addListener(applyViewportState);
    return () => {
      query.removeListener(applyViewportState);
    };
  }, []);

  const useMobileMasterDetail = isNarrowViewport;

  useEffect(() => {
    if (useMobileMasterDetail) {
      return;
    }
    setShowMobileDetail(false);
  }, [useMobileMasterDetail]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    }
  }, [initialSection, useMobileMasterDetail]);

  const handleSelectSection = useCallback(
    (section: CodexSection) => {
      setActiveSection(section);
      if (useMobileMasterDetail) {
        setShowMobileDetail(true);
      }
    },
    [useMobileMasterDetail],
  );

  return {
    activeSection,
    showMobileDetail,
    setShowMobileDetail,
    useMobileMasterDetail,
    handleSelectSection,
  };
};
