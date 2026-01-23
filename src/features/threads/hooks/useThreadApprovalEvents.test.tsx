// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequest } from "../../../types";
import { respondToServerRequest } from "../../../services/tauri";
import {
  getApprovalCommandInfo,
  matchesCommandPrefix,
} from "../../../utils/approvalRules";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";

vi.mock("../../../services/tauri", () => ({
  respondToServerRequest: vi.fn(),
}));

vi.mock("../../../utils/approvalRules", () => ({
  getApprovalCommandInfo: vi.fn(),
  matchesCommandPrefix: vi.fn(),
}));

describe("useThreadApprovalEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-accepts allowlisted approvals", () => {
    const dispatch = vi.fn();
    const approvalAllowlistRef = {
      current: { "ws-1": [["git", "status"]] },
    };
    const approval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: 42,
      method: "approval/request",
      params: { argv: ["git", "status"] },
    };

    vi.mocked(getApprovalCommandInfo).mockReturnValue({
      tokens: ["git", "status"],
      preview: "git status",
    });
    vi.mocked(matchesCommandPrefix).mockReturnValue(true);

    const { result } = renderHook(() =>
      useThreadApprovalEvents({ dispatch, approvalAllowlistRef }),
    );

    act(() => {
      result.current(approval);
    });

    expect(respondToServerRequest).toHaveBeenCalledWith("ws-1", 42, "accept");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches approvals that do not match the allowlist", () => {
    const dispatch = vi.fn();
    const approvalAllowlistRef = {
      current: { "ws-1": [["git", "status"]] },
    };
    const approval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: 7,
      method: "approval/request",
      params: { argv: ["git", "pull"] },
    };

    vi.mocked(getApprovalCommandInfo).mockReturnValue({
      tokens: ["git", "pull"],
      preview: "git pull",
    });
    vi.mocked(matchesCommandPrefix).mockReturnValue(false);

    const { result } = renderHook(() =>
      useThreadApprovalEvents({ dispatch, approvalAllowlistRef }),
    );

    act(() => {
      result.current(approval);
    });

    expect(respondToServerRequest).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "addApproval", approval });
  });
});
