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

export type ResumedTurnState = {
  activeTurnId: string | null;
  activeTurnStartedAtMs: number | null;
  confidentNoActiveTurn: boolean;
};

function normalizeTurnStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function normalizeTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 10_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
      return parsedNumber < 10_000_000_000
        ? Math.trunc(parsedNumber * 1000)
        : Math.trunc(parsedNumber);
    }
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }
  return null;
}

function turnStartedAtMs(turn: Record<string, unknown>): number | null {
  return (
    normalizeTimestampMs(
      turn.startedAt ??
        turn.started_at ??
        turn.startTime ??
        turn.start_time ??
        turn.createdAt ??
        turn.created_at,
    ) ?? null
  );
}

type TurnStatusKind = "active" | "terminal" | "unknown";

function classifyTurnStatus(status: string): TurnStatusKind {
  if (!status) {
    return "unknown";
  }
  if (
    status === "inprogress" ||
    status === "running" ||
    status === "processing" ||
    status === "pending" ||
    status === "started" ||
    status === "queued" ||
    status === "waiting" ||
    status === "blocked" ||
    status === "needsinput" ||
    status === "requiresaction" ||
    status === "awaitinginput" ||
    status === "waitingforinput"
  ) {
    return "active";
  }
  if (
    status === "completed" ||
    status === "done" ||
    status === "failed" ||
    status === "error" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "aborted" ||
    status === "stopped" ||
    status === "interrupted"
  ) {
    return "terminal";
  }
  return "unknown";
}

function getExplicitActiveTurnState(
  thread: Record<string, unknown>,
): {
  explicit: boolean;
  activeTurnId: string | null;
  activeTurnStartedAtMs: number | null;
} {
  const hasExplicitTurnId =
    "activeTurnId" in thread || "active_turn_id" in thread;
  const activeTurnId = asString(thread.activeTurnId ?? thread.active_turn_id).trim();
  if (hasExplicitTurnId) {
    return {
      explicit: true,
      activeTurnId: activeTurnId || null,
      activeTurnStartedAtMs: null,
    };
  }

  const activeTurnRaw =
    thread.activeTurn ??
    thread.active_turn ??
    thread.currentTurn ??
    thread.current_turn;
  const hasExplicitTurnObject =
    "activeTurn" in thread ||
    "active_turn" in thread ||
    "currentTurn" in thread ||
    "current_turn" in thread;
  const activeTurn = asRecord(activeTurnRaw);
  if (!hasExplicitTurnObject) {
    return {
      explicit: false,
      activeTurnId: null,
      activeTurnStartedAtMs: null,
    };
  }
  const objectTurnId = asString(
    activeTurn?.id ?? activeTurn?.turnId ?? activeTurn?.turn_id,
  ).trim();
  return {
    explicit: true,
    activeTurnId: objectTurnId || null,
    activeTurnStartedAtMs: activeTurn ? turnStartedAtMs(activeTurn) : null,
  };
}

export function getResumedTurnState(
  thread: Record<string, unknown>,
): ResumedTurnState {
  const explicitState = getExplicitActiveTurnState(thread);
  if (explicitState.explicit) {
    return {
      activeTurnId: explicitState.activeTurnId,
      activeTurnStartedAtMs: explicitState.activeTurnStartedAtMs,
      confidentNoActiveTurn: !explicitState.activeTurnId,
    };
  }

  const turns = Array.isArray(thread.turns)
    ? (thread.turns as Array<Record<string, unknown>>)
    : [];
  let sawTerminalStatus = false;
  let sawUnknownStatus = false;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || typeof turn !== "object") {
      sawUnknownStatus = true;
      continue;
    }
    const status = classifyTurnStatus(
      normalizeTurnStatus(
        turn.status ?? turn.turnStatus ?? turn.turn_status,
      ),
    );
    if (status === "active") {
      const turnId = asString(turn.id ?? turn.turnId ?? turn.turn_id).trim();
      if (turnId) {
        return {
          activeTurnId: turnId,
          activeTurnStartedAtMs: turnStartedAtMs(turn),
          confidentNoActiveTurn: false,
        };
      }
      sawUnknownStatus = true;
      continue;
    }
    if (status === "terminal") {
      sawTerminalStatus = true;
      continue;
    }
    sawUnknownStatus = true;
  }
  return {
    activeTurnId: null,
    activeTurnStartedAtMs: null,
    confidentNoActiveTurn: sawTerminalStatus && !sawUnknownStatus,
  };
}

export function getResumedActiveTurnId(thread: Record<string, unknown>): string | null {
  return getResumedTurnState(thread).activeTurnId;
}
