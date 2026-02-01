// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageDetailsModal } from "./UsageDetailsModal";

const baseProps = {
  isOpen: true,
  days: [],
  usageMetric: "tokens" as const,
  onClose: vi.fn(),
};

afterEach(() => {
  cleanup();
});

describe("UsageDetailsModal", () => {
  it("renders empty state when no data is available", () => {
    render(<UsageDetailsModal {...baseProps} />);

    expect(screen.getByText("Usage details")).toBeTruthy();
    expect(screen.getByText("Select a range")).toBeTruthy();
    expect(screen.getByText("No usage data for this range.")).toBeTruthy();
  });

  it("calls onClose when clicking the close button", () => {
    const onClose = vi.fn();
    render(<UsageDetailsModal {...baseProps} onClose={onClose} />);

    const [closeButton] = screen.getAllByRole("button", {
      name: "Close usage details",
    });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<UsageDetailsModal {...baseProps} onClose={onClose} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders usage bars for the active range", async () => {
    render(
      <UsageDetailsModal
        {...baseProps}
        days={[
          {
            day: "2026-01-20",
            totalTokens: 1200,
            agentTimeMs: 90000,
            agentRuns: 2,
          },
        ]}
      />,
    );

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(1);
  });
});
