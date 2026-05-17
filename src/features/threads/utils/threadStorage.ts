import type { AccessMode, ServiceTier } from "@/types";

const STORAGE_KEY_THREAD_ACTIVITY = "opencodemonitor.threadLastUserActivity";
export const STORAGE_KEY_PINNED_THREADS = "opencodemonitor.pinnedThreads";
export const STORAGE_KEY_CUSTOM_NAMES = "opencodemonitor.threadCustomNames";
export const STORAGE_KEY_THREAD_OPENCODE_PARAMS = "opencodemonitor.threadOpenCodeParams";
export const STORAGE_KEY_DETACHED_REVIEW_LINKS = "opencodemonitor.detachedReviewLinks";
export const MAX_PINS_SOFT_LIMIT = 5;

export type ThreadActivityMap = Record<string, Record<string, number>>;
export type PinnedThreadsMap = Record<string, number>;
export type CustomNamesMap = Record<string, string>;
type DetachedReviewLinksMap = Record<string, Record<string, string>>;

// Per-thread OpenCode parameter overrides. Keyed by `${workspaceId}:${threadId}`.
// These are UI-level preferences (not server state) and are best-effort persisted.
export type ThreadOpenCodeParams = {
  modelId: string | null;
  effort: string | null;
  // string => explicit per-thread tier override
  // null => explicit "Default/off" override
  // undefined => legacy/unset thread value that should inherit no-thread scope
  serviceTier: ServiceTier | null | undefined;
  accessMode: AccessMode | null;
  collaborationModeId: string | null;
  // string => explicit per-thread override
  // null => explicit "Default" (no override)
  // undefined => legacy/unset thread value that should inherit no-thread scope
  opencodeArgsOverride: string | null | undefined;
  updatedAt: number;
};

export type ThreadOpenCodeParamsMap = Record<string, ThreadOpenCodeParams>;

export function makeThreadOpenCodeParamsKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadThreadOpenCodeParams(): ThreadOpenCodeParamsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_OPENCODE_PARAMS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadOpenCodeParamsMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveThreadOpenCodeParams(next: ThreadOpenCodeParamsMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_OPENCODE_PARAMS,
      JSON.stringify(next),
    );
  } catch {
    // Best-effort persistence.
  }
}

export function loadThreadActivity(): ThreadActivityMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_THREAD_ACTIVITY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ThreadActivityMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveThreadActivity(activity: ThreadActivityMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_THREAD_ACTIVITY,
      JSON.stringify(activity),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

export function makeCustomNameKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadCustomNames(): CustomNamesMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CUSTOM_NAMES);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as CustomNamesMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveCustomName(workspaceId: string, threadId: string, name: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = loadCustomNames();
    const key = makeCustomNameKey(workspaceId, threadId);
    current[key] = name;
    window.localStorage.setItem(
      STORAGE_KEY_CUSTOM_NAMES,
      JSON.stringify(current),
    );
  } catch {
    // Best-effort persistence.
  }
}

export function makePinKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadPinnedThreads(): PinnedThreadsMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PINNED_THREADS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PinnedThreadsMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function savePinnedThreads(pinned: PinnedThreadsMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PINNED_THREADS,
      JSON.stringify(pinned),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

export function loadDetachedReviewLinks(): DetachedReviewLinksMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_DETACHED_REVIEW_LINKS);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as DetachedReviewLinksMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveDetachedReviewLinks(links: DetachedReviewLinksMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_DETACHED_REVIEW_LINKS,
      JSON.stringify(links),
    );
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}
