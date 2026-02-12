import type {
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

export function normalizeRateLimits(raw: Record<string, unknown>): RateLimitSnapshot {
  const primary = (raw.primary as Record<string, unknown>) ?? null;
  const secondary = (raw.secondary as Record<string, unknown>) ?? null;
  const credits = (raw.credits as Record<string, unknown>) ?? null;
  return {
    primary: primary
      ? {
          usedPercent: asNumber(primary.usedPercent ?? primary.used_percent),
          windowDurationMins: (() => {
            const value = primary.windowDurationMins ?? primary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = primary.resetsAt ?? primary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    secondary: secondary
      ? {
          usedPercent: asNumber(secondary.usedPercent ?? secondary.used_percent),
          windowDurationMins: (() => {
            const value = secondary.windowDurationMins ?? secondary.window_duration_mins;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
          resetsAt: (() => {
            const value = secondary.resetsAt ?? secondary.resets_at;
            if (typeof value === "number") {
              return value;
            }
            if (typeof value === "string") {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })(),
        }
      : null,
    credits: credits
      ? {
          hasCredits: Boolean(credits.hasCredits ?? credits.has_credits),
          unlimited: Boolean(credits.unlimited),
          balance: typeof credits.balance === "string" ? credits.balance : null,
        }
      : null,
    planType:
      typeof raw.planType === "string"
        ? raw.planType
        : typeof raw.plan_type === "string"
          ? raw.plan_type
          : null,
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
