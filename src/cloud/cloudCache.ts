import type { CloudKitRunnerInfo } from "../types";
import type {
  CloudGlobalSnapshot,
  CloudThreadSnapshot,
  CloudWorkspaceSnapshot,
} from "./cloudTypes";

const STORAGE_KEY = "codexmonitor.cloud.cache.v1";
const MAX_THREAD_ENTRIES = 8;
const MAX_THREAD_ITEMS = 80;
const MAX_TEXT_CHARS = 2000;
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type CloudCacheV1 = {
  v: 1;
  updatedAtMs: number;
  runner: CloudKitRunnerInfo | null;
  global: CloudGlobalSnapshot | null;
  workspaces: Record<string, CloudWorkspaceSnapshot>;
  threads: Record<string, CloudThreadSnapshot>;
  threadOrder: string[];
};

function nowMs() {
  return Date.now();
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function truncate(value: string, maxChars: number) {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + "…";
}

function threadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}::${threadId}`;
}

function compactThreadSnapshot(snapshot: CloudThreadSnapshot): CloudThreadSnapshot {
  const payload = snapshot.payload ?? ({} as CloudThreadSnapshot["payload"]);
  const items = Array.isArray(payload.items) ? payload.items : null;
  if (!items || items.length === 0) {
    return snapshot;
  }
  const trimmedItems = items
    .slice(-MAX_THREAD_ITEMS)
    .map((item) => {
      if (item.kind !== "message") {
        return item;
      }
      return {
        ...item,
        text: truncate(item.text, MAX_TEXT_CHARS),
      };
    });
  return {
    ...snapshot,
    payload: {
      ...payload,
      items: trimmedItems,
      thread: null,
    },
  };
}

function coerceCache(value: unknown): CloudCacheV1 | null {
  if (!isObject(value)) return null;
  if ((value as any).v !== 1) return null;

  const updatedAtMs = typeof value.updatedAtMs === "number" ? value.updatedAtMs : 0;
  if (updatedAtMs && nowMs() - updatedAtMs > MAX_CACHE_AGE_MS) {
    return null;
  }

  return {
    v: 1,
    updatedAtMs: updatedAtMs || nowMs(),
    runner: (value.runner as CloudKitRunnerInfo | null) ?? null,
    global: (value.global as CloudGlobalSnapshot | null) ?? null,
    workspaces: isObject(value.workspaces) ? (value.workspaces as any) : {},
    threads: isObject(value.threads) ? (value.threads as any) : {},
    threadOrder: Array.isArray(value.threadOrder)
      ? (value.threadOrder as string[]).filter((key) => typeof key === "string")
      : [],
  };
}

export function loadCloudCache(): CloudCacheV1 | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return coerceCache(safeParse(raw));
  } catch {
    return null;
  }
}

function saveCloudCache(cache: CloudCacheV1) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore (quota, private mode, etc.)
  }
}

export function writeCloudCacheRunner(next: CloudKitRunnerInfo | null) {
  const cache = loadCloudCache() ?? {
    v: 1,
    updatedAtMs: nowMs(),
    runner: null,
    global: null,
    workspaces: {},
    threads: {},
    threadOrder: [],
  };
  cache.runner = next;
  cache.updatedAtMs = nowMs();
  saveCloudCache(cache);
}

export function writeCloudCacheGlobal(next: CloudGlobalSnapshot | null) {
  const cache = loadCloudCache() ?? {
    v: 1,
    updatedAtMs: nowMs(),
    runner: null,
    global: null,
    workspaces: {},
    threads: {},
    threadOrder: [],
  };
  cache.global = next;
  cache.updatedAtMs = nowMs();
  saveCloudCache(cache);
}

export function writeCloudCacheWorkspace(next: CloudWorkspaceSnapshot) {
  const cache = loadCloudCache() ?? {
    v: 1,
    updatedAtMs: nowMs(),
    runner: null,
    global: null,
    workspaces: {},
    threads: {},
    threadOrder: [],
  };
  cache.workspaces[next.payload.workspaceId] = next;
  cache.updatedAtMs = nowMs();
  saveCloudCache(cache);
}

export function writeCloudCacheThread(next: CloudThreadSnapshot) {
  const cache = loadCloudCache() ?? {
    v: 1,
    updatedAtMs: nowMs(),
    runner: null,
    global: null,
    workspaces: {},
    threads: {},
    threadOrder: [],
  };
  const key = threadKey(next.payload.workspaceId, next.payload.threadId);
  cache.threads[key] = compactThreadSnapshot(next);
  cache.threadOrder = [key, ...cache.threadOrder.filter((entry) => entry !== key)];
  if (cache.threadOrder.length > MAX_THREAD_ENTRIES) {
    const removed = cache.threadOrder.slice(MAX_THREAD_ENTRIES);
    removed.forEach((entry) => {
      delete cache.threads[entry];
    });
    cache.threadOrder = cache.threadOrder.slice(0, MAX_THREAD_ENTRIES);
  }
  cache.updatedAtMs = nowMs();
  saveCloudCache(cache);
}

export function getCachedThreadSnapshot(
  cache: CloudCacheV1 | null,
  workspaceId: string,
  threadId: string,
) {
  if (!cache) return null;
  return cache.threads[threadKey(workspaceId, threadId)] ?? null;
}

