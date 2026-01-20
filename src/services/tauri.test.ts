import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  addWorkspace,
  getGitHubIssues,
  getGitLog,
  getGitStatus,
  respondToServerRequest,
  sendUserMessage,
  startReview,
} from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("tauri invoke wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses codex_bin for addWorkspace", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ id: "ws-1" });

    await addWorkspace("/tmp/project", null);

    expect(invokeMock).toHaveBeenCalledWith("add_workspace", {
      path: "/tmp/project",
      codex_bin: null,
    });
  });

  it("maps workspace_id to workspaceId for git status", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({
      branchName: "main",
      files: [],
      stagedFiles: [],
      unstagedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
    });

    await getGitStatus("ws-1");

    expect(invokeMock).toHaveBeenCalledWith("get_git_status", {
      workspaceId: "ws-1",
    });
  });

  it("maps workspace_id to workspaceId for GitHub issues", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({ total: 0, issues: [] });

    await getGitHubIssues("ws-2");

    expect(invokeMock).toHaveBeenCalledWith("get_github_issues", {
      workspaceId: "ws-2",
    });
  });

  it("applies default limit for git log", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({
      total: 0,
      entries: [],
      ahead: 0,
      behind: 0,
      aheadEntries: [],
      behindEntries: [],
      upstream: null,
    });

    await getGitLog("ws-3");

    expect(invokeMock).toHaveBeenCalledWith("get_git_log", {
      workspaceId: "ws-3",
      limit: 40,
    });
  });

  it("fills sendUserMessage defaults in payload", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await sendUserMessage("ws-4", "thread-1", "hello", {
      accessMode: "full-access",
      images: ["image.png"],
    });

    expect(invokeMock).toHaveBeenCalledWith("send_user_message", {
      workspaceId: "ws-4",
      threadId: "thread-1",
      text: "hello",
      model: null,
      effort: null,
      accessMode: "full-access",
      images: ["image.png"],
      collaborationMode: null,
    });
  });

  it("omits delivery when starting reviews without override", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await startReview("ws-5", "thread-2", { type: "uncommittedChanges" });

    expect(invokeMock).toHaveBeenCalledWith("start_review", {
      workspaceId: "ws-5",
      threadId: "thread-2",
      target: { type: "uncommittedChanges" },
    });
  });

  it("nests decisions for server request responses", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({});

    await respondToServerRequest("ws-6", 101, "accept");

    expect(invokeMock).toHaveBeenCalledWith("respond_to_server_request", {
      workspaceId: "ws-6",
      requestId: 101,
      result: { decision: "accept" },
    });
  });
});
