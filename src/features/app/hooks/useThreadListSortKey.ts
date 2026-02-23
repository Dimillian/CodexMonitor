import { useCallback, useState } from "react";
import type { ThreadListOrganizeMode, ThreadListSortKey } from "../../../types";

const THREAD_LIST_SORT_KEY_STORAGE_KEY = "codexmonitor.threadListSortKey";
const THREAD_LIST_ORGANIZE_MODE_STORAGE_KEY = "codexmonitor.threadListOrganizeMode";

function getStoredThreadListSortKey(): ThreadListSortKey {
  if (typeof window === "undefined") {
    return "updated_at";
  }
  const stored = window.localStorage.getItem(THREAD_LIST_SORT_KEY_STORAGE_KEY);
  if (stored === "created_at" || stored === "updated_at") {
    return stored;
  }
  return "updated_at";
}

function getStoredThreadListOrganizeMode(): ThreadListOrganizeMode {
  if (typeof window === "undefined") {
    return "by_project";
  }
  const stored = window.localStorage.getItem(THREAD_LIST_ORGANIZE_MODE_STORAGE_KEY);
  if (stored === "by_project" || stored === "by_project_activity" || stored === "threads_only") {
    return stored;
  }
  return "by_project";
}

export function useThreadListSortKey() {
  const [threadListSortKey, setThreadListSortKeyState] = useState<ThreadListSortKey>(
    () => getStoredThreadListSortKey(),
  );
  const [threadListOrganizeMode, setThreadListOrganizeModeState] = useState<ThreadListOrganizeMode>(
    () => getStoredThreadListOrganizeMode(),
  );

  const setThreadListSortKey = useCallback((nextSortKey: ThreadListSortKey) => {
    setThreadListSortKeyState(nextSortKey);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THREAD_LIST_SORT_KEY_STORAGE_KEY, nextSortKey);
    }
  }, []);

  const setThreadListOrganizeMode = useCallback(
    (nextOrganizeMode: ThreadListOrganizeMode) => {
      setThreadListOrganizeModeState(nextOrganizeMode);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          THREAD_LIST_ORGANIZE_MODE_STORAGE_KEY,
          nextOrganizeMode,
        );
      }
    },
    [],
  );

  return {
    threadListSortKey,
    setThreadListSortKey,
    threadListOrganizeMode,
    setThreadListOrganizeMode,
  };
}
