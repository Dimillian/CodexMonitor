import { useCallback, useState } from "react";

export function useUsageDetailsModalState() {
  const [usageDetailsOpen, setUsageDetailsOpen] = useState(false);

  const openUsageDetails = useCallback(() => {
    setUsageDetailsOpen(true);
  }, []);

  const closeUsageDetails = useCallback(() => {
    setUsageDetailsOpen(false);
  }, []);

  return {
    usageDetailsOpen,
    openUsageDetails,
    closeUsageDetails,
    setUsageDetailsOpen,
  };
}
