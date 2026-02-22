function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEffort(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "default" || normalized === "unknown") {
    return null;
  }
  return normalized;
}

function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function pickDeepString(
  value: unknown,
  keys: readonly string[],
  options?: {
    normalize?: (input: string | null) => string | null;
  },
): string | null {
  const normalize = options?.normalize;
  const allowed = new Set(keys);
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();
  let best: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      current.forEach((entry) => queue.push(entry));
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const [key, rawValue] of Object.entries(record)) {
      if (allowed.has(key)) {
        const direct = asString(rawValue);
        const normalized = normalize ? normalize(direct) : direct;
        if (normalized) {
          best = normalized;
        }
      }
      queue.push(rawValue);
    }
  }

  return best;
}

const MODEL_KEYS = [
  "modelId",
  "model_id",
  "model",
  "modelName",
  "model_name",
] as const;

const EFFORT_KEYS = [
  "effort",
  "reasoningEffort",
  "reasoning_effort",
  "modelReasoningEffort",
  "model_reasoning_effort",
] as const;

function extractFromRecord(record: Record<string, unknown>): {
  modelId: string | null;
  effort: string | null;
} {
  const payload = asRecord(record.payload);
  const containers = [
    payload,
    asRecord(payload?.info),
    asRecord(payload?.settings),
    asRecord(payload?.params),
    asRecord(payload?.context),
    asRecord(payload?.turnContext),
    asRecord(payload?.turn_context),
    asRecord(payload?.config),
    record,
    asRecord(record.info),
    asRecord(record.metadata),
    asRecord(record.context),
    asRecord(record.turnContext),
    asRecord(record.turn_context),
    asRecord(record.params),
    asRecord(record.settings),
    asRecord(record.config),
  ].filter((value): value is Record<string, unknown> => value !== null);

  let modelId: string | null = null;
  let effort: string | null = null;

  for (const container of containers) {
    if (!modelId) {
      modelId = pickString(container, MODEL_KEYS);
    }
    if (!effort) {
      effort = normalizeEffort(pickString(container, EFFORT_KEYS));
    }
    if (!modelId) {
      modelId = pickDeepString(container, MODEL_KEYS);
    }
    if (!effort) {
      effort = pickDeepString(container, EFFORT_KEYS, {
        normalize: normalizeEffort,
      });
    }
    if (modelId && effort) {
      break;
    }
  }

  return { modelId, effort };
}

function extractFromTurn(turn: Record<string, unknown>): {
  modelId: string | null;
  effort: string | null;
} {
  const turnLevel = extractFromRecord(turn);
  let modelId: string | null = turnLevel.modelId;
  let effort: string | null = turnLevel.effort;

  const items = Array.isArray(turn.items)
    ? (turn.items as unknown[])
    : [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = asRecord(items[index]);
    if (!item) {
      continue;
    }
    const extracted = extractFromRecord(item);
    if (extracted.modelId) {
      modelId = extracted.modelId;
    }
    if (extracted.effort) {
      effort = extracted.effort;
    }
    if (modelId && effort) {
      break;
    }
  }

  return { modelId, effort };
}

export function extractThreadCodexMetadata(thread: Record<string, unknown>): {
  modelId: string | null;
  effort: string | null;
} {
  let modelId: string | null = null;
  let effort: string | null = null;

  const turns = Array.isArray(thread.turns)
    ? (thread.turns as unknown[])
    : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = asRecord(turns[index]);
    if (!turn) {
      continue;
    }
    const extracted = extractFromTurn(turn);
    if (!modelId && extracted.modelId) {
      modelId = extracted.modelId;
    }
    if (!effort && extracted.effort) {
      effort = extracted.effort;
    }
    if (modelId && effort) {
      break;
    }
  }

  if (!modelId || !effort) {
    const threadLevel = extractFromRecord(thread);
    if (!modelId) {
      modelId = threadLevel.modelId;
    }
    if (!effort) {
      effort = threadLevel.effort;
    }
  }

  return { modelId, effort };
}
