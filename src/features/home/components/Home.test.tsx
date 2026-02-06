// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./Home";

const baseProps = {
  onOpenProject: vi.fn(),
  onAddWorkspace: vi.fn(),
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
  });
});
