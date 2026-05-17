// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalRequest, WorkspaceInfo } from "../../../types";
import { ApprovalToasts } from "./ApprovalToasts";

const workspaces: WorkspaceInfo[] = [
  {
    id: "workspace-1",
    name: "Workspace One",
    path: "/tmp/workspace-1",
    connected: true,
    settings: { sidebarCollapsed: false },
  },
];

const approvals: ApprovalRequest[] = [
  {
    workspace_id: "workspace-1",
    request_id: 1,
    method: "opencode/requestApproval/shell",
    params: { command: "echo one" },
  },
  {
    workspace_id: "workspace-1",
    request_id: 2,
    method: "opencode/requestApproval/shell",
    params: { command: "echo two" },
  },
];

describe("ApprovalToasts", () => {
  it("renders live-region semantics and handles Enter on primary request", () => {
    const onDecision = vi.fn();
    render(
      <ApprovalToasts approvals={approvals} workspaces={workspaces} onDecision={onDecision} />,
    );

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-live")).toBe("assertive");
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onDecision).toHaveBeenCalledWith(approvals[1], "accept");
  });

  it("does not submit when an input is focused", () => {
    const onDecision = vi.fn();
    render(
      <ApprovalToasts approvals={approvals} workspaces={workspaces} onDecision={onDecision} />,
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onDecision).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
