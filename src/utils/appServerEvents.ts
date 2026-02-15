import type { AppServerEvent } from "../types";

export const SUPPORTED_APP_SERVER_METHODS = [
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "codex/backgroundThread",
  "codex/connected",
  "codex/disconnected",
  "codex/event/skills_update_available",
  "error",
  "item/agentMessage/delta",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/completed",
  "item/fileChange/outputDelta",
  "item/plan/delta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/started",
  "item/tool/requestUserInput",
  "thread/name/updated",
  "thread/started",
  "thread/tokenUsage/updated",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
] as const;

export type SupportedAppServerMethod = (typeof SUPPORTED_APP_SERVER_METHODS)[number];

export const METHODS_HANDLED_OUTSIDE_USE_APP_SERVER_EVENTS = [
  "codex/event/skills_update_available",
] as const satisfies readonly SupportedAppServerMethod[];

const SUPPORTED_METHOD_SET = new Set<string>(SUPPORTED_APP_SERVER_METHODS);
const SUPPORTED_METHOD_NORMALIZED_MAP = new Map<string, SupportedAppServerMethod>(
  SUPPORTED_APP_SERVER_METHODS.map((method) => [normalizeMethodForMatch(method), method]),
);

function normalizeMethodForMatch(method: string) {
  return method
    .trim()
    .split("/")
    .map((segment) => segment.toLowerCase().replace(/[_-]/g, ""))
    .join("/");
}

function toCanonicalSupportedMethod(method: string): SupportedAppServerMethod | null {
  if (SUPPORTED_METHOD_SET.has(method)) {
    return method as SupportedAppServerMethod;
  }
  const normalized = normalizeMethodForMatch(method);
  return SUPPORTED_METHOD_NORMALIZED_MAP.get(normalized) ?? null;
}

function getAppServerMessageObject(
  event: AppServerEvent,
): Record<string, unknown> | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const message = (event as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message as Record<string, unknown>;
}

export function getAppServerRawMethod(event: AppServerEvent): string | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const method = message.method;
  if (typeof method !== "string") {
    return null;
  }
  const trimmed = method.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const canonical = toCanonicalSupportedMethod(trimmed);
  return canonical ?? trimmed;
}

export function isSupportedAppServerMethod(
  method: string,
): method is SupportedAppServerMethod {
  return SUPPORTED_METHOD_SET.has(method);
}

export function getAppServerParams(event: AppServerEvent): Record<string, unknown> {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return {};
  }
  const params = message.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }
  return params as Record<string, unknown>;
}

export function getAppServerRequestId(event: AppServerEvent): string | number | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const requestId = message.id;
  if (typeof requestId === "number" || typeof requestId === "string") {
    return requestId;
  }
  return null;
}

export function isApprovalRequestMethod(method: string): boolean {
  return method.endsWith("requestApproval");
}

export function isSkillsUpdateAvailableEvent(event: AppServerEvent): boolean {
  return getAppServerRawMethod(event) === "codex/event/skills_update_available";
}
