import { describe, expect, it } from "vitest";
import { METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS } from "../features/app/hooks/useAppServerEvents";
import type { AppServerEvent } from "../types";
import {
  METHODS_HANDLED_OUTSIDE_USE_APP_SERVER_EVENTS,
  SUPPORTED_APP_SERVER_METHODS,
  getAppServerParams,
  getAppServerRawMethod,
  getAppServerRequestId,
  isApprovalRequestMethod,
  isSkillsUpdateAvailableEvent,
  isSupportedAppServerMethod,
} from "./appServerEvents";

function makeEvent(message: Record<string, unknown>): AppServerEvent {
  return {
    workspace_id: "ws-1",
    message,
  };
}

describe("appServerEvents", () => {
  it("extracts method and params safely", () => {
    const event = makeEvent({
      method: " turn/started ",
      params: { threadId: "thread-1" },
      id: 7,
    });

    expect(getAppServerRawMethod(event)).toBe("turn/started");
    expect(getAppServerParams(event)).toEqual({ threadId: "thread-1" });
    expect(getAppServerRequestId(event)).toBe(7);
  });

  it("checks supported method and approval requests", () => {
    expect(isSupportedAppServerMethod("turn/started")).toBe(true);
    expect(isSupportedAppServerMethod("unknown/method")).toBe(false);
    expect(isApprovalRequestMethod("workspace/requestApproval")).toBe(true);
    expect(isApprovalRequestMethod("workspace/request")).toBe(false);
  });

  it("matches canonical skills update event method only", () => {
    const canonicalEvent = makeEvent({
      method: "codex/event/skills_update_available",
      params: {},
    });
    const nonCanonicalMethod = makeEvent({
      method: "skills/updateAvailable",
      params: {},
    });

    expect(isSkillsUpdateAvailableEvent(canonicalEvent)).toBe(true);
    expect(isSkillsUpdateAvailableEvent(nonCanonicalMethod)).toBe(false);
  });

  it("gracefully handles malformed event payloads", () => {
    const missingMessage = { workspace_id: "ws-1" } as unknown as AppServerEvent;
    const nonObjectMessage = {
      workspace_id: "ws-1",
      message: "oops",
    } as unknown as AppServerEvent;
    const arrayMessage = { workspace_id: "ws-1", message: [] } as unknown as AppServerEvent;

    expect(getAppServerRawMethod(missingMessage)).toBeNull();
    expect(getAppServerRawMethod(nonObjectMessage)).toBeNull();
    expect(getAppServerRawMethod(arrayMessage)).toBeNull();

    expect(getAppServerParams(missingMessage)).toEqual({});
    expect(getAppServerParams(nonObjectMessage)).toEqual({});
    expect(getAppServerParams(arrayMessage)).toEqual({});

    expect(getAppServerRequestId(missingMessage)).toBeNull();
    expect(getAppServerRequestId(nonObjectMessage)).toBeNull();
    expect(getAppServerRequestId(arrayMessage)).toBeNull();
  });

  it("keeps supported methods aligned with useAppServerEvents routing", () => {
    const methodsHandledOutsideHook = new Set<string>(
      METHODS_HANDLED_OUTSIDE_USE_APP_SERVER_EVENTS,
    );
    const supportedHandledInHook = new Set(
      SUPPORTED_APP_SERVER_METHODS.filter((method) => !methodsHandledOutsideHook.has(method)),
    );

    expect([...METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS].sort()).toEqual(
      [...supportedHandledInHook].sort(),
    );
  });
});
