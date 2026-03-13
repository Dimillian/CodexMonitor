// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountSnapshot,
  RateLimitSnapshot,
  WorkspaceInfo,
} from "@/types";
import {
  resolveHomeAccountWorkspaceId,
  useHomeAccount,
} from "./useHomeAccount";

function makeWorkspace(
  id: string,
  overrides: Partial<WorkspaceInfo> = {},
): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    connected: true,
    settings: {
      sidebarCollapsed: false,
    },
    ...overrides,
  };
}

function makeAccount(
  overrides: Partial<AccountSnapshot> = {},
): AccountSnapshot {
  return {
    type: "chatgpt",
    email: "user@example.com",
    planType: "pro",
    requiresOpenaiAuth: false,
    ...overrides,
  };
}

function makeRateLimits(
  overrides: Partial<RateLimitSnapshot> = {},
): RateLimitSnapshot {
  return {
    primary: {
      usedPercent: 42,
      windowDurationMins: 300,
      resetsAt: 1_700_000_000,
    },
    secondary: null,
    credits: null,
    planType: "pro",
    ...overrides,
  };
}

describe("resolveHomeAccountWorkspaceId", () => {
  it("prefers the workspace selected from Home usage controls", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "ws-2",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
      }),
    ).toBe("ws-2");
  });

  it("keeps Home unset for the All workspaces usage filter", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: null,
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        rateLimitsByWorkspace: { "ws-2": makeRateLimits() },
        accountByWorkspace: {},
      }),
    ).toBeNull();
  });

  it("ignores empty cached rate-limit snapshots when falling back from a stale selection", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        rateLimitsByWorkspace: {
          "ws-1": makeRateLimits({
            primary: null,
            secondary: null,
            credits: null,
            planType: null,
          }),
          "ws-2": makeRateLimits(),
        },
        accountByWorkspace: {},
      }),
    ).toBe("ws-2");
  });

  it("prefers connected workspaces over disconnected cached data", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [
          makeWorkspace("ws-1", { connected: false }),
          makeWorkspace("ws-2"),
        ],
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: {},
      }),
    ).toBe("ws-2");
  });

  it("prefers connected workspaces with current data over disconnected cached data", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [
          makeWorkspace("ws-1", { connected: false }),
          makeWorkspace("ws-2"),
        ],
        rateLimitsByWorkspace: {
          "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
          "ws-2": makeRateLimits({ primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
        },
        accountByWorkspace: {
          "ws-1": makeAccount({ email: "stale@example.com" }),
          "ws-2": makeAccount({ email: "current@example.com" }),
        },
      }),
    ).toBe("ws-2");
  });

  it("skips placeholder unknown account snapshots when later workspaces have real data", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        rateLimitsByWorkspace: {},
        accountByWorkspace: {
          "ws-1": makeAccount({
            type: "unknown",
            email: null,
            planType: null,
          }),
          "ws-2": makeAccount(),
        },
      }),
    ).toBe("ws-2");
  });
});

describe("useHomeAccount", () => {
  it("returns null Home account props for the All workspaces usage filter", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2", { connected: false }),
    ];

    const { result } = renderHook(() =>
      useHomeAccount({
        showHome: true,
        usageWorkspaceId: null,
        workspaces,
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    expect(result.current.homeAccountWorkspaceId).toBeNull();
    expect(result.current.homeAccountWorkspace).toBeNull();
    expect(result.current.homeAccount).toBeNull();
    expect(result.current.homeRateLimits).toBeNull();

    await waitFor(() => {
      expect(refreshAccountInfo).not.toHaveBeenCalled();
      expect(refreshAccountRateLimits).not.toHaveBeenCalled();
    });
  });

  it("returns Home account props from the selected workspace and refreshes them on Home", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2", { connected: false }),
    ];

    const { result } = renderHook(() =>
      useHomeAccount({
        showHome: true,
        usageWorkspaceId: "ws-1",
        workspaces,
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(result.current.homeAccountWorkspace?.name).toBe("ws-1");
    expect(result.current.homeAccount?.email).toBe("user@example.com");
    expect(result.current.homeRateLimits?.primary?.usedPercent).toBe(42);

    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenCalledWith("ws-1");
      expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-1");
    });
  });

  it("refreshes the first connected workspace when a stale selection points elsewhere", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();

    const { result } = renderHook(() =>
      useHomeAccount({
        showHome: true,
        usageWorkspaceId: "missing",
        workspaces: [
          makeWorkspace("ws-1", { connected: false }),
          makeWorkspace("ws-2"),
        ],
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    expect(result.current.homeAccountWorkspace?.name).toBe("ws-2");
    expect(result.current.homeAccount).toBeNull();
    expect(result.current.homeRateLimits).toBeNull();

    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-2");
    });
  });

  it("does not refresh account state when Home is hidden", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();

    renderHook(() =>
      useHomeAccount({
        showHome: false,
        usageWorkspaceId: "ws-1",
        workspaces: [makeWorkspace("ws-1")],
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    await waitFor(() => {
      expect(refreshAccountInfo).not.toHaveBeenCalled();
      expect(refreshAccountRateLimits).not.toHaveBeenCalled();
    });
  });
});
