// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

afterEach(() => {
  cleanup();
});

const baseProps = {
  onOpenSettings: vi.fn(),
  onAddWorkspace: vi.fn(),
  onAddWorkspaceFromUrl: vi.fn(),
  latestAgentRuns: [],
  isLoadingLatestAgents: false,
  localUsageSnapshot: null,
  isLoadingLocalUsage: false,
  localUsageError: null,
  onRefreshLocalUsage: vi.fn(),
  usageMetric: "tokens" as const,
  onUsageMetricChange: vi.fn(),
  usageWorkspaceId: null,
  usageWorkspaceOptions: [],
  onUsageWorkspaceChange: vi.fn(),
  accountRateLimits: null,
  usageShowRemaining: false,
  accountInfo: null,
  onSelectThread: vi.fn(),
};

describe("Home", () => {
  it("renders latest agent runs and lets you open a thread", () => {
    const onSelectThread = vi.fn();
    render(
      <Home
        {...baseProps}
        latestAgentRuns={[
          {
            message: "Ship the dashboard refresh",
            timestamp: Date.now(),
            projectName: "CodexMonitor",
            groupName: "Frontend",
            workspaceId: "workspace-1",
            threadId: "thread-1",
            isProcessing: true,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    expect(screen.getByText("Latest agents")).toBeTruthy();
    expect(screen.getByText("CodexMonitor")).toBeTruthy();
    expect(screen.getByText("Frontend")).toBeTruthy();
    const message = screen.getByText("Ship the dashboard refresh");
    const card = message.closest("button");
    expect(card).toBeTruthy();
    if (!card) {
      throw new Error("Expected latest agent card button");
    }
    fireEvent.click(card);
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "thread-1");
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("shows the empty state when there are no latest runs", () => {
    render(<Home {...baseProps} />);

    expect(screen.getByText("No agent activity yet")).toBeTruthy();
    expect(
      screen.getByText("Start a thread to see the latest responses here."),
    ).toBeTruthy();
  });

  it("renders usage cards in time mode", () => {
    render(
      <Home
        {...baseProps}
        usageMetric="time"
        localUsageSnapshot={{
          updatedAt: Date.now(),
          days: [
            {
              day: "2026-01-20",
              inputTokens: 10,
              cachedInputTokens: 0,
              outputTokens: 5,
              totalTokens: 15,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
          ],
          totals: {
            last7DaysTokens: 15,
            last30DaysTokens: 15,
            averageDailyTokens: 15,
            cacheHitRatePercent: 0,
            peakDay: "2026-01-20",
            peakDayTokens: 15,
          },
          topModels: [],
        }}
      />,
    );

    expect(screen.getAllByText("agent time").length).toBeGreaterThan(0);
    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Peak day")).toBeTruthy();
    expect(screen.getByText("Avg / run")).toBeTruthy();
    expect(screen.getByText("Avg / active day")).toBeTruthy();
    expect(screen.getByText("Longest streak")).toBeTruthy();
    expect(screen.getByText("Active days")).toBeTruthy();
  });

  it("renders expanded token stats and account limits", () => {
    render(
      <Home
        {...baseProps}
        localUsageSnapshot={{
          updatedAt: Date.now(),
          days: [
            {
              day: "2026-01-07",
              inputTokens: 20,
              cachedInputTokens: 5,
              outputTokens: 10,
              totalTokens: 30,
              agentTimeMs: 60000,
              agentRuns: 1,
            },
            {
              day: "2026-01-08",
              inputTokens: 10,
              cachedInputTokens: 0,
              outputTokens: 5,
              totalTokens: 15,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-09",
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-10",
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-11",
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-12",
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-13",
              inputTokens: 30,
              cachedInputTokens: 10,
              outputTokens: 20,
              totalTokens: 50,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
            {
              day: "2026-01-14",
              inputTokens: 35,
              cachedInputTokens: 10,
              outputTokens: 15,
              totalTokens: 50,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
            {
              day: "2026-01-15",
              inputTokens: 25,
              cachedInputTokens: 5,
              outputTokens: 15,
              totalTokens: 40,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
            {
              day: "2026-01-16",
              inputTokens: 15,
              cachedInputTokens: 5,
              outputTokens: 10,
              totalTokens: 25,
              agentTimeMs: 60000,
              agentRuns: 1,
            },
            {
              day: "2026-01-17",
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              agentTimeMs: 0,
              agentRuns: 0,
            },
            {
              day: "2026-01-18",
              inputTokens: 20,
              cachedInputTokens: 8,
              outputTokens: 12,
              totalTokens: 32,
              agentTimeMs: 90000,
              agentRuns: 1,
            },
            {
              day: "2026-01-19",
              inputTokens: 40,
              cachedInputTokens: 10,
              outputTokens: 25,
              totalTokens: 65,
              agentTimeMs: 180000,
              agentRuns: 3,
            },
            {
              day: "2026-01-20",
              inputTokens: 20,
              cachedInputTokens: 4,
              outputTokens: 16,
              totalTokens: 36,
              agentTimeMs: 120000,
              agentRuns: 2,
            },
          ],
          totals: {
            last7DaysTokens: 248,
            last30DaysTokens: 343,
            averageDailyTokens: 35,
            cacheHitRatePercent: 25,
            peakDay: "2026-01-19",
            peakDayTokens: 65,
          },
          topModels: [{ model: "gpt-5", tokens: 300, sharePercent: 87.5 }],
        }}
        accountRateLimits={{
          primary: {
            usedPercent: 62,
            windowDurationMins: 300,
            resetsAt: Math.round(Date.now() / 1000) + 3600,
          },
          secondary: {
            usedPercent: 34,
            windowDurationMins: 10080,
            resetsAt: Math.round(Date.now() / 1000) + 86400,
          },
          credits: {
            hasCredits: true,
            unlimited: true,
            balance: null,
          },
          planType: "pro",
        }}
        accountInfo={{
          type: "chatgpt",
          email: "user@example.com",
          planType: "pro",
          requiresOpenaiAuth: false,
        }}
      />,
    );

    expect(screen.getByText("Cached tokens")).toBeTruthy();
    expect(screen.getByText("Avg / run")).toBeTruthy();
    expect(screen.getByText("Longest streak")).toBeTruthy();
    expect(screen.getByText("4 days")).toBeTruthy();
    expect(screen.getByText("Account limits")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText(/user@example\.com/)).toBeTruthy();
    expect(screen.queryByText("Workspace CodexMonitor")).toBeNull();

    const todayCard = screen.getByText("Today").closest(".home-usage-card");
    expect(todayCard).toBeTruthy();
    if (!(todayCard instanceof HTMLElement)) {
      throw new Error("Expected today usage card");
    }
    expect(within(todayCard).getByText("36")).toBeTruthy();

    expect(
      screen.getByLabelText("Usage week 2026-01-14 to 2026-01-20"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Show next week" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText("Jan 20").closest(".home-usage-bar")?.getAttribute("data-value"),
    ).toBe("Jan 20 · 36 tokens");

    fireEvent.click(screen.getByRole("button", { name: "Show previous week" }));

    expect(
      screen.getByLabelText("Usage week 2026-01-07 to 2026-01-13"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Show next week" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Show next week" }));

    expect(
      screen.getByLabelText("Usage week 2026-01-14 to 2026-01-20"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Show next week" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("renders account limits even when no local usage snapshot exists", () => {
    render(
      <Home
        {...baseProps}
        accountRateLimits={{
          primary: {
            usedPercent: 62,
            windowDurationMins: 300,
            resetsAt: Math.round(Date.now() / 1000) + 3600,
          },
          secondary: null,
          credits: {
            hasCredits: true,
            unlimited: false,
            balance: "120",
          },
          planType: "pro",
        }}
        accountInfo={{
          type: "chatgpt",
          email: "user@example.com",
          planType: "pro",
          requiresOpenaiAuth: false,
        }}
      />,
    );

    expect(screen.getByText("Account limits")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText(/user@example\.com/)).toBeTruthy();
    expect(screen.getByText("No usage data yet")).toBeTruthy();
  });
});
