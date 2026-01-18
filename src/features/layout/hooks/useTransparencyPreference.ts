import { useEffect, useState } from "react";

export function useTransparencyPreference(storageKey = "reduceTransparency") {
  const [reduceTransparency, setReduceTransparency] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(reduceTransparency));
  }, [reduceTransparency, storageKey]);

  return {
    reduceTransparency,
    setReduceTransparency,
  };
}
