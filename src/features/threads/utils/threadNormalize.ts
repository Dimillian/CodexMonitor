import type {
  CreditsSnapshot,
  RateLimitWindow,
  RateLimitSnapshot,
  ReviewTarget,
  ThreadTokenUsage,
  TurnPlan,
  TurnPlanStep,
  TurnPlanStepStatus,
} from "@/types";

export function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readOptionalNumber(
  candidate: unknown,
  fallback: number | null,
): number | null {
  const parsed = asFiniteNumber(candidate);
  return parsed !== null ? parsed : fallback;
}

function normalizeRateLimitWindow(
  source: Record<string, unknown>,
  previousWindow: RateLimitWindow | null,
): RateLimitWindow | null {
  const directUsed = asFiniteNumber(source.usedPercent ?? source.used_percent);
  const remaining = asFiniteNumber(
    source.remainingPercent ?? source.remaining_percent ?? source.remaining,
  );

  let usedPercent: number | null = null;
  if (directUsed !== null) {
    usedPercent = clampPercent(directUsed);
  } else if (remaining !== null) {
    usedPercent = clampPercent(100 - remaining);
  } else if (previousWindow) {
    usedPercent = previousWindow.usedPercent;
  }

  if (usedPercent === null) {
    return null;
  }

  return {
    usedPercent,
    windowDurationMins: readOptionalNumber(
      source.windowDurationMins ?? source.window_duration_mins,
      previousWindow?.windowDurationMins ?? null,
    ),
    resetsAt: readOptionalNumber(
      source.resetsAt ?? source.resets_at,
      previousWindow?.resetsAt ?? null,
    ),
  };
}

function normalizeCreditsSnapshot(
  source: Record<string, unknown>,
  previousCredits: CreditsSnapshot | null,
): CreditsSnapshot {
  const hasCreditsRaw = source.hasCredits ?? source.has_credits;
  const unlimitedRaw = source.unlimited;
  const balanceRaw = source.balance;

  return {
    hasCredits:
      typeof hasCreditsRaw === "boolean"
        ? hasCreditsRaw
        : previousCredits?.hasCredits ?? false,
    unlimited:
      typeof unlimitedRaw === "boolean"
        ? unlimitedRaw
        : previousCredits?.unlimited ?? false,
    balance:
      typeof balanceRaw === "string"
        ? balanceRaw
        : balanceRaw === null
          ? null
          : previousCredits?.balance ?? null,
  };
}

export function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

export function normalizeRootPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    return normalized.toLowerCase();
  }
  if (normalized.startsWith("//")) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function extractRpcErrorMessage(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (!record.error) {
    return null;
  }
  const errorValue = record.error;
  if (typeof errorValue === "string") {
    return errorValue;
  }
  if (typeof errorValue === "object" && errorValue) {
    const message = asString((errorValue as Record<string, unknown>).message);
    return message || "Request failed.";
  }
  return "Request failed.";
}

export function extractReviewThreadId(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : null;
  const threadId = asString(
    result?.reviewThreadId ??
      result?.review_thread_id ??
      record.reviewThreadId ??
      record.review_thread_id,
  );
  return threadId || null;
}

export function normalizeTokenUsage(
  raw: Record<string, unknown> | null | undefined,
): ThreadTokenUsage {
  const source = raw ?? {};
  const total = (source.total as Record<string, unknown>) ?? {};
  const last = (source.last as Record<string, unknown>) ?? {};
  return {
    total: {
      totalTokens: asNumber(total.totalTokens ?? total.total_tokens),
      inputTokens: asNumber(total.inputTokens ?? total.input_tokens),
      cachedInputTokens: asNumber(
        total.cachedInputTokens ?? total.cached_input_tokens,
      ),
      outputTokens: asNumber(total.outputTokens ?? total.output_tokens),
      reasoningOutputTokens: asNumber(
        total.reasoningOutputTokens ?? total.reasoning_output_tokens,
      ),
    },
    last: {
      totalTokens: asNumber(last.totalTokens ?? last.total_tokens),
      inputTokens: asNumber(last.inputTokens ?? last.input_tokens),
      cachedInputTokens: asNumber(last.cachedInputTokens ?? last.cached_input_tokens),
      outputTokens: asNumber(last.outputTokens ?? last.output_tokens),
      reasoningOutputTokens: asNumber(
        last.reasoningOutputTokens ?? last.reasoning_output_tokens,
      ),
    },
    modelContextWindow: (() => {
      const value = source.modelContextWindow ?? source.model_context_window;
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })(),
  };
}

export function normalizeRateLimits(
  raw: Record<string, unknown>,
  previous: RateLimitSnapshot | null = null,
): RateLimitSnapshot {
  const previousPrimary = previous?.primary ?? null;
  const previousSecondary = previous?.secondary ?? null;
  const previousCredits = previous?.credits ?? null;

  const primary =
    hasOwn(raw, "primary")
      ? raw.primary === null
        ? null
        : raw.primary &&
            typeof raw.primary === "object" &&
            !Array.isArray(raw.primary)
          ? normalizeRateLimitWindow(
              raw.primary as Record<string, unknown>,
              previousPrimary,
            )
          : previousPrimary
      : previousPrimary;

  const secondary =
    hasOwn(raw, "secondary")
      ? raw.secondary === null
        ? null
        : raw.secondary &&
            typeof raw.secondary === "object" &&
            !Array.isArray(raw.secondary)
          ? normalizeRateLimitWindow(
              raw.secondary as Record<string, unknown>,
              previousSecondary,
            )
          : previousSecondary
      : previousSecondary;

  const credits =
    hasOwn(raw, "credits")
      ? raw.credits === null
        ? null
        : raw.credits &&
            typeof raw.credits === "object" &&
            !Array.isArray(raw.credits)
          ? normalizeCreditsSnapshot(
              raw.credits as Record<string, unknown>,
              previousCredits,
            )
          : previousCredits
      : previousCredits;

  const hasPlanTypeKey = hasOwn(raw, "planType") || hasOwn(raw, "plan_type");
  const planTypeValue =
    typeof raw.planType === "string"
      ? raw.planType
      : typeof raw.plan_type === "string"
        ? raw.plan_type
        : null;

  return {
    primary,
    secondary,
    credits,
    planType: planTypeValue ?? (hasPlanTypeKey ? null : previous?.planType ?? null),
  };
}

function normalizePlanStepStatus(value: unknown): TurnPlanStepStatus {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw.replace(/[_\s-]/g, "").toLowerCase();
  if (normalized === "inprogress") {
    return "inProgress";
  }
  if (normalized === "completed") {
    return "completed";
  }
  return "pending";
}

export function normalizePlanUpdate(
  turnId: string,
  explanation: unknown,
  plan: unknown,
): TurnPlan | null {
  const planRecord =
    plan && typeof plan === "object" && !Array.isArray(plan)
      ? (plan as Record<string, unknown>)
      : null;
  const rawSteps = (() => {
    if (Array.isArray(plan)) {
      return plan;
    }
    if (planRecord) {
      const candidate =
        planRecord.steps ??
        planRecord.plan ??
        planRecord.items ??
        planRecord.entries ??
        null;
      return Array.isArray(candidate) ? candidate : [];
    }
    return [];
  })();
  const steps = rawSteps
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const step = asString(record.step ?? record.text ?? record.title ?? "");
      if (!step) {
        return null;
      }
      return {
        step,
        status: normalizePlanStepStatus(record.status),
      } satisfies TurnPlanStep;
    })
    .filter((entry): entry is TurnPlanStep => Boolean(entry));
  const note = asString(explanation ?? planRecord?.explanation ?? planRecord?.note).trim();
  if (!steps.length && !note) {
    return null;
  }
  return {
    turnId,
    explanation: note ? note : null,
    steps,
  };
}

export function parseReviewTarget(input: string): ReviewTarget {
  const trimmed = input.trim();
  const rest = trimmed.replace(/^\/review\b/i, "").trim();
  if (!rest) {
    return { type: "uncommittedChanges" };
  }
  const lower = rest.toLowerCase();
  if (lower.startsWith("base ")) {
    const branch = rest.slice(5).trim();
    return { type: "baseBranch", branch };
  }
  if (lower.startsWith("commit ")) {
    const payload = rest.slice(7).trim();
    const [sha, ...titleParts] = payload.split(/\s+/);
    const title = titleParts.join(" ").trim();
    return {
      type: "commit",
      sha,
      ...(title ? { title } : {}),
    };
  }
  if (lower.startsWith("custom ")) {
    const instructions = rest.slice(7).trim();
    return { type: "custom", instructions };
  }
  return { type: "custom", instructions: rest };
}
