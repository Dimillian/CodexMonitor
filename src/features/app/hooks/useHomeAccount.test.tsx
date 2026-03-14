// @vitest-environment jsdom
import { useState } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountSnapshot,
  RateLimitSnapshot,
  ThreadSummary,
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

function makeThread(
  id: string,
  updatedAt: number,
  overrides: Partial<ThreadSummary> = {},
): ThreadSummary {
  return {
    id,
    name: id,
    updatedAt,
    ...overrides,
  };
}

function makeThreadListLoadingState(
  workspaces: WorkspaceInfo[],
  isLoading = false,
): Record<string, boolean> {
  return Object.fromEntries(
    workspaces.map((workspace) => [workspace.id, isLoading]),
  );
}

describe("resolveHomeAccountWorkspaceId", () => {
  it("prefers the workspace selected from Home usage controls", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "ws-2",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        threadsByWorkspace: {},
        rateLimitsByWorkspace: { "ws-1": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount() },
      }),
    ).toBe("ws-2");
  });

  it("prefers the most recently active connected workspace with account data for the All workspaces usage filter", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: null,
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 10)],
          "ws-2": [makeThread("thread-2", 20)],
        },
        rateLimitsByWorkspace: {
          "ws-1": makeRateLimits({ primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
          "ws-2": makeRateLimits({ primary: { usedPercent: 60, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
        },
        accountByWorkspace: {
          "ws-1": makeAccount({ email: "older@example.com" }),
          "ws-2": makeAccount({ email: "newer@example.com" }),
        },
      }),
    ).toBe("ws-2");
  });

  it("uses workspace order as a deterministic tiebreaker when activity timestamps match", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 20)],
          "ws-2": [makeThread("thread-2", 20)],
        },
        rateLimitsByWorkspace: {
          "ws-1": makeRateLimits(),
          "ws-2": makeRateLimits(),
        },
        accountByWorkspace: {
          "ws-1": makeAccount({ email: "first@example.com" }),
          "ws-2": makeAccount({ email: "second@example.com" }),
        },
      }),
    ).toBe("ws-1");
  });

  it("ignores empty cached rate-limit snapshots when falling back from a stale selection", () => {
    expect(
      resolveHomeAccountWorkspaceId({
        usageWorkspaceId: "missing",
        workspaces: [makeWorkspace("ws-1"), makeWorkspace("ws-2")],
        threadsByWorkspace: {},
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
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 20)],
          "ws-2": [makeThread("thread-2", 10)],
        },
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
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 20)],
          "ws-2": [makeThread("thread-2", 10)],
        },
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
        threadsByWorkspace: {},
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
  it("returns Home account props for the All workspaces usage filter", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2"),
    ];

    const { result } = renderHook(() =>
      useHomeAccount({
        showHome: true,
        usageWorkspaceId: null,
        workspaces,
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 10)],
          "ws-2": [makeThread("thread-2", 20)],
        },
        threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
        rateLimitsByWorkspace: { "ws-1": makeRateLimits(), "ws-2": makeRateLimits() },
        accountByWorkspace: { "ws-1": makeAccount(), "ws-2": makeAccount({ email: "recent@example.com" }) },
        refreshAccountInfo,
        refreshAccountRateLimits,
      }),
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    expect(result.current.homeAccountWorkspace?.name).toBe("ws-2");
    expect(result.current.homeAccount?.email).toBe("recent@example.com");
    expect(result.current.homeRateLimits?.primary?.usedPercent).toBe(42);

    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-2");
    });
  });

  it("keeps the aggregate Home account workspace stable across thread activity updates", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2"),
    ];

    const { result, rerender } = renderHook(
      ({
        threadsByWorkspace,
      }: {
        threadsByWorkspace: Record<string, ThreadSummary[]>;
      }) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace,
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
          rateLimitsByWorkspace: { "ws-1": makeRateLimits(), "ws-2": makeRateLimits() },
          accountByWorkspace: {
            "ws-1": makeAccount({ email: "older@example.com" }),
            "ws-2": makeAccount({ email: "recent@example.com" }),
          },
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps: {
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 10)],
            "ws-2": [makeThread("thread-2", 20)],
          },
        },
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");

    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenCalledTimes(1);
      expect(refreshAccountRateLimits).toHaveBeenCalledTimes(1);
    });

    refreshAccountInfo.mockClear();
    refreshAccountRateLimits.mockClear();

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread("thread-1", 30)],
        "ws-2": [makeThread("thread-2", 20)],
      },
    });

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    expect(result.current.homeAccountWorkspace?.name).toBe("ws-2");
    expect(result.current.homeAccount?.email).toBe("recent@example.com");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
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
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 10)],
          "ws-2": [makeThread("thread-2", 20)],
        },
        threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
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
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 20)],
          "ws-2": [makeThread("thread-2", 10)],
        },
        threadListLoadingByWorkspace: {
          "ws-1": false,
          "ws-2": false,
        },
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
        threadsByWorkspace: { "ws-1": [makeThread("thread-1", 10)] },
        threadListLoadingByWorkspace: { "ws-1": false },
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

  it("does not refresh twice when same-tick refresh callbacks trigger a rerender", async () => {
    const infoCalls: Array<{ workspaceId: string; tick: number }> = [];
    const rateCalls: Array<{ workspaceId: string; tick: number }> = [];
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2"),
    ];

    const { result } = renderHook(() => {
      const [tick, setTick] = useState(0);

      useHomeAccount({
        showHome: true,
        usageWorkspaceId: null,
        workspaces,
        threadsByWorkspace: {
          "ws-1": [makeThread("thread-1", 10)],
          "ws-2": [makeThread("thread-2", 20)],
        },
        threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
        rateLimitsByWorkspace: { "ws-1": makeRateLimits(), "ws-2": makeRateLimits() },
        accountByWorkspace: {
          "ws-1": makeAccount({ email: "older@example.com" }),
          "ws-2": makeAccount({ email: "recent@example.com" }),
        },
        refreshAccountInfo: (workspaceId: string) => {
          infoCalls.push({ workspaceId, tick });
          if (tick === 0) {
            setTick(1);
          }
        },
        refreshAccountRateLimits: (workspaceId: string) => {
          rateCalls.push({ workspaceId, tick });
          if (tick === 0) {
            setTick((current) => (current === 0 ? 1 : current));
          }
        },
      });

      return { tick };
    });

    await waitFor(() => {
      expect(result.current.tick).toBe(1);
    });

    expect(infoCalls).toEqual([{ workspaceId: "ws-2", tick: 0 }]);
    expect(rateCalls).toEqual([{ workspaceId: "ws-2", tick: 0 }]);
  });

  it("recomputes the aggregate workspace after thread lists finish hydrating", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2"),
    ];

    const { result, rerender } = renderHook(
      ({
        threadsByWorkspace,
        threadListLoadingByWorkspace,
      }: {
        threadsByWorkspace: Record<string, ThreadSummary[]>;
        threadListLoadingByWorkspace: Record<string, boolean>;
      }) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace,
          threadListLoadingByWorkspace,
          rateLimitsByWorkspace: { "ws-1": makeRateLimits(), "ws-2": makeRateLimits() },
          accountByWorkspace: {
            "ws-1": makeAccount({ email: "older@example.com" }),
            "ws-2": makeAccount({ email: "recent@example.com" }),
          },
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps: {
          threadsByWorkspace: {},
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces, true),
        },
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread("thread-1", 10)],
        "ws-2": [makeThread("thread-2", 20)],
      },
      threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
    });

    await waitFor(() => {
      expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    });

    expect(result.current.homeAccount?.email).toBe("recent@example.com");
    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenLastCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenLastCalledWith("ws-2");
    });
  });

  it("falls back when the retained aggregate workspace loses usable account data", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const workspaces = [
      makeWorkspace("ws-1"),
      makeWorkspace("ws-2"),
    ];

    const { result, rerender } = renderHook(
      ({
        rateLimitsByWorkspace,
        accountByWorkspace,
      }: {
        rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
        accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
      }) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 10)],
            "ws-2": [makeThread("thread-2", 20)],
          },
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
          rateLimitsByWorkspace,
          accountByWorkspace,
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps: {
          rateLimitsByWorkspace: {
            "ws-1": makeRateLimits(),
            "ws-2": makeRateLimits(),
          },
          accountByWorkspace: {
            "ws-1": makeAccount({ email: "older@example.com" }),
            "ws-2": makeAccount({ email: "recent@example.com" }),
          },
        },
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");

    rerender({
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits(),
        "ws-2": makeRateLimits({
          primary: null,
          secondary: null,
          credits: null,
          planType: null,
        }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "older@example.com" }),
        "ws-2": makeAccount({
          type: "unknown",
          email: null,
          planType: null,
        }),
      },
    });

    await waitFor(() => {
      expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    });

    expect(result.current.homeAccount?.email).toBe("older@example.com");
    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenLastCalledWith("ws-1");
      expect(refreshAccountRateLimits).toHaveBeenLastCalledWith("ws-1");
    });
  });

  it("falls back when the retained aggregate workspace disconnects", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();

    const { result, rerender } = renderHook(
      ({
        workspaces,
      }: {
        workspaces: WorkspaceInfo[];
      }) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 10)],
            "ws-2": [makeThread("thread-2", 20)],
          },
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
          rateLimitsByWorkspace: {
            "ws-1": makeRateLimits({ primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
            "ws-2": makeRateLimits({ primary: { usedPercent: 60, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
          },
          accountByWorkspace: {
            "ws-1": makeAccount({ email: "older@example.com" }),
            "ws-2": makeAccount({ email: "recent@example.com" }),
          },
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps: {
          workspaces: [
            makeWorkspace("ws-1"),
            makeWorkspace("ws-2"),
          ],
        },
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-2");

    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-2");
    });

    refreshAccountInfo.mockClear();
    refreshAccountRateLimits.mockClear();

    rerender({
      workspaces: [
        makeWorkspace("ws-1"),
        makeWorkspace("ws-2", { connected: false }),
      ],
    });

    await waitFor(() => {
      expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    });

    expect(result.current.homeAccount?.email).toBe("older@example.com");
    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenLastCalledWith("ws-1");
      expect(refreshAccountRateLimits).toHaveBeenLastCalledWith("ws-1");
    });
  });

  it("keeps a committed disconnected aggregate workspace stable while all workspaces stay offline", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    type HookProps = {
      threadsByWorkspace: Record<string, ThreadSummary[]>;
      rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
      accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
    };
    const workspaces = [
      makeWorkspace("ws-1", { connected: false }),
      makeWorkspace("ws-2", { connected: false }),
    ];

    const { result, rerender } = renderHook(
      ({
        threadsByWorkspace,
        rateLimitsByWorkspace,
        accountByWorkspace,
      }: HookProps) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace,
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
          rateLimitsByWorkspace,
          accountByWorkspace,
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps: {
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 20)],
            "ws-2": [makeThread("thread-2", 10)],
          },
          rateLimitsByWorkspace: {
            "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
            "ws-2": makeRateLimits({ primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
          },
          accountByWorkspace: {
            "ws-1": makeAccount({ email: "stale@example.com" }),
            "ws-2": makeAccount({ email: "current@example.com" }),
          },
        },
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();

    rerender({
      threadsByWorkspace: {
        "ws-1": [makeThread("thread-1", 20)],
        "ws-2": [makeThread("thread-2", 30)],
      },
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
        "ws-2": makeRateLimits({ primary: { usedPercent: 15, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
        "ws-2": makeAccount({ email: "newer@example.com" }),
      },
    });

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(result.current.homeAccount?.email).toBe("stale@example.com");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
  });

  it("retains a committed disconnected aggregate workspace until a reconnected workspace finishes hydrating", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    type HookProps = {
      workspaces: WorkspaceInfo[];
      threadListLoadingByWorkspace: Record<string, boolean>;
      rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
      accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
    };
    const initialProps: HookProps = {
      workspaces: [
        makeWorkspace("ws-1", { connected: false }),
        makeWorkspace("ws-2", { connected: false }),
      ],
      threadListLoadingByWorkspace: {
        "ws-1": false,
        "ws-2": false,
      },
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
      },
    };

    const { result, rerender } = renderHook(
      ({
        workspaces,
        threadListLoadingByWorkspace,
        rateLimitsByWorkspace,
        accountByWorkspace,
      }: HookProps) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 20)],
            "ws-2": [makeThread("thread-2", 10)],
          },
          threadListLoadingByWorkspace,
          rateLimitsByWorkspace,
          accountByWorkspace,
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps,
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(result.current.homeAccount?.email).toBe("stale@example.com");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();

    rerender({
      workspaces: [
        makeWorkspace("ws-1", { connected: false }),
        makeWorkspace("ws-2"),
      ],
      threadListLoadingByWorkspace: {
        "ws-1": false,
        "ws-2": true,
      },
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
      },
    });

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(result.current.homeAccount?.email).toBe("stale@example.com");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();

    rerender({
      workspaces: [
        makeWorkspace("ws-1", { connected: false }),
        makeWorkspace("ws-2"),
      ],
      threadListLoadingByWorkspace: {
        "ws-1": false,
        "ws-2": false,
      },
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
      },
    });

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(result.current.homeAccount?.email).toBe("stale@example.com");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();

    rerender({
      workspaces: [
        makeWorkspace("ws-1", { connected: false }),
        makeWorkspace("ws-2"),
      ],
      threadListLoadingByWorkspace: {
        "ws-1": false,
        "ws-2": false,
      },
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
        "ws-2": makeRateLimits({ primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
        "ws-2": makeAccount({ email: "current@example.com" }),
      },
    });

    await waitFor(() => {
      expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    });

    expect(result.current.homeAccount?.email).toBe("current@example.com");
    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenLastCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenLastCalledWith("ws-2");
    });
  });

  it("drops a committed disconnected aggregate workspace after another workspace reconnects", async () => {
    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    type HookProps = {
      workspaces: WorkspaceInfo[];
      rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null | undefined>;
      accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
    };
    const initialProps: HookProps = {
      workspaces: [
        makeWorkspace("ws-1", { connected: false }),
        makeWorkspace("ws-2", { connected: false }),
      ],
      rateLimitsByWorkspace: {
        "ws-1": makeRateLimits({ primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: 1_700_000_000 } }),
      },
      accountByWorkspace: {
        "ws-1": makeAccount({ email: "stale@example.com" }),
      },
    };

    const { result, rerender } = renderHook(
      ({
        workspaces,
        rateLimitsByWorkspace,
        accountByWorkspace,
      }: HookProps) =>
        useHomeAccount({
          showHome: true,
          usageWorkspaceId: null,
          workspaces,
          threadsByWorkspace: {
            "ws-1": [makeThread("thread-1", 20)],
            "ws-2": [makeThread("thread-2", 10)],
          },
          threadListLoadingByWorkspace: makeThreadListLoadingState(workspaces),
          rateLimitsByWorkspace,
          accountByWorkspace,
          refreshAccountInfo,
          refreshAccountRateLimits,
        }),
      {
        initialProps,
      },
    );

    expect(result.current.homeAccountWorkspaceId).toBe("ws-1");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();

    rerender({
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
    });

    await waitFor(() => {
      expect(result.current.homeAccountWorkspaceId).toBe("ws-2");
    });

    expect(result.current.homeAccount?.email).toBe("current@example.com");
    await waitFor(() => {
      expect(refreshAccountInfo).toHaveBeenLastCalledWith("ws-2");
      expect(refreshAccountRateLimits).toHaveBeenLastCalledWith("ws-2");
    });
  });
});
