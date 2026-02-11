import { asString } from "./threadNormalize";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getParentThreadIdFromSource(source: unknown): string | null {
  const sourceRecord = asRecord(source);
  if (!sourceRecord) {
    return null;
  }
  const subAgent = asRecord(sourceRecord.subAgent ?? sourceRecord.sub_agent);
  if (!subAgent) {
    return null;
  }
  const threadSpawn = asRecord(subAgent.thread_spawn ?? subAgent.threadSpawn);
  if (!threadSpawn) {
    return null;
  }
  const parentId = asString(
    threadSpawn.parent_thread_id ?? threadSpawn.parentThreadId,
  );
  return parentId || null;
}

function normalizeTurnStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

export function getResumedActiveTurnId(thread: Record<string, unknown>): string | null {
  const turns = Array.isArray(thread.turns)
    ? (thread.turns as Array<Record<string, unknown>>)
    : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || typeof turn !== "object") {
      continue;
    }
    const status = normalizeTurnStatus(
      turn.status ?? turn.turnStatus ?? turn.turn_status,
    );
    const isInProgress =
      status === "inprogress" ||
      status === "running" ||
      status === "processing" ||
      status === "pending" ||
      status === "started";
    if (!isInProgress) {
      continue;
    }
    const turnId = asString(turn.id ?? turn.turnId ?? turn.turn_id);
    if (turnId) {
      return turnId;
    }
  }
  return null;
}

export function isUnsupportedTurnSteerError(message: string): boolean {
  const normalized = message.toLowerCase();
  const mentionsSteerMethod =
    normalized.includes("turn/steer") || normalized.includes("turn_steer");
  return normalized.includes("unknown variant `turn/steer`")
    || normalized.includes("unknown variant \"turn/steer\"")
    || (normalized.includes("unknown request") && mentionsSteerMethod)
    || (normalized.includes("unknown method") && mentionsSteerMethod);
}
