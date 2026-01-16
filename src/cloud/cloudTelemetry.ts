export type CloudTelemetryEntry = {
  ts: number;
  event: string;
  workspaceId?: string;
  threadId?: string;
  scopeKey?: string;
  commandId?: string;
  fromCache?: boolean;
  durationMs?: number;
  note?: string;
};

const STORAGE_KEY = "codexmonitor.cloud.telemetry.v1";
const MAX_ENTRIES = 250;

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readCloudTelemetry(): CloudTelemetryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeParse<unknown>(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as CloudTelemetryEntry[]).filter(
      (entry) => entry && typeof entry.ts === "number" && typeof entry.event === "string",
    );
  } catch {
    return [];
  }
}

export function clearCloudTelemetry() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function pushCloudTelemetry(entry: Omit<CloudTelemetryEntry, "ts"> & { ts?: number }) {
  const next: CloudTelemetryEntry = {
    ...entry,
    ts: entry.ts ?? Date.now(),
  };
  try {
    const prev = readCloudTelemetry();
    const merged = [...prev, next].slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore (quota, private mode, etc.)
  }
}

