import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  CloudKitCommandAck,
  CloudKitCommandResult,
  CloudKitRunnerInfo,
  CloudKitSnapshot,
  CloudKitStatus,
  CloudKitTestResult,
  CodexDoctorResult,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../types";
import type {
  GitFileDiff,
  GitFileStatus,
  GitHubIssuesResponse,
  GitLogResponse,
  ReviewTarget,
} from "../types";

export async function pickWorkspacePath(): Promise<string | null> {
  const selection = await open({ directory: true, multiple: false });
  if (!selection || Array.isArray(selection)) {
    return null;
  }
  return selection;
}

export async function pickImageFiles(): Promise<string[]> {
  const selection = await open({
    multiple: true,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif"],
      },
    ],
  });
  if (!selection) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke<WorkspaceInfo[]>("list_workspaces");
}

export async function addWorkspace(
  path: string,
  codex_bin: string | null,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("add_workspace", { path, codex_bin });
}

export async function addWorktree(
  parentId: string,
  branch: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("add_worktree", { parentId, branch });
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("update_workspace_settings", { id, settings });
}

export async function updateWorkspaceCodexBin(
  id: string,
  codex_bin: string | null,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("update_workspace_codex_bin", { id, codex_bin });
}

export async function removeWorkspace(id: string): Promise<void> {
  return invoke("remove_workspace", { id });
}

export async function removeWorktree(id: string): Promise<void> {
  return invoke("remove_worktree", { id });
}

export async function connectWorkspace(id: string): Promise<void> {
  return invoke("connect_workspace", { id });
}

export async function startThread(workspaceId: string) {
  return invoke<any>("start_thread", { workspaceId });
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: {
    model?: string | null;
    effort?: string | null;
    accessMode?: "read-only" | "current" | "full-access";
    images?: string[];
  },
) {
  return invoke("send_user_message", {
    workspaceId,
    threadId,
    text,
    model: options?.model ?? null,
    effort: options?.effort ?? null,
    accessMode: options?.accessMode ?? null,
    images: options?.images ?? null,
  });
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  return invoke("turn_interrupt", { workspaceId, threadId, turnId });
}

export async function startReview(
  workspaceId: string,
  threadId: string,
  target: ReviewTarget,
  delivery?: "inline" | "detached",
) {
  const payload: Record<string, unknown> = { workspaceId, threadId, target };
  if (delivery) {
    payload.delivery = delivery;
  }
  return invoke("start_review", payload);
}

export async function respondToServerRequest(
  workspaceId: string,
  requestId: number,
  decision: "accept" | "decline",
) {
  return invoke("respond_to_server_request", {
    workspaceId,
    requestId,
    result: { decision },
  });
}

export async function getGitStatus(workspace_id: string): Promise<{
  branchName: string;
  files: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}> {
  return invoke("get_git_status", { workspaceId: workspace_id });
}

export async function getGitDiffs(
  workspace_id: string,
): Promise<GitFileDiff[]> {
  return invoke("get_git_diffs", { workspaceId: workspace_id });
}

export async function getGitLog(
  workspace_id: string,
  limit = 40,
): Promise<GitLogResponse> {
  return invoke("get_git_log", { workspaceId: workspace_id, limit });
}

export async function getGitRemote(workspace_id: string): Promise<string | null> {
  return invoke("get_git_remote", { workspaceId: workspace_id });
}

export async function getGitHubIssues(
  workspace_id: string,
): Promise<GitHubIssuesResponse> {
  return invoke("get_github_issues", { workspaceId: workspace_id });
}

export async function getModelList(workspaceId: string) {
  return invoke<any>("model_list", { workspaceId });
}

export async function getAccountRateLimits(workspaceId: string) {
  return invoke<any>("account_rate_limits", { workspaceId });
}

export async function getSkillsList(workspaceId: string) {
  return invoke<any>("skills_list", { workspaceId });
}

export async function getPromptsList(workspaceId: string) {
  return invoke<any>("prompts_list", { workspaceId });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("update_app_settings", { settings });
}

export async function e2eMark(marker: string): Promise<void> {
  return invoke<void>("e2e_mark", { marker });
}

export async function e2eQuit(): Promise<void> {
  return invoke<void>("e2e_quit");
}

export async function runCodexDoctor(
  codexBin: string | null,
): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin });
}

export async function cloudkitStatus(): Promise<CloudKitStatus> {
  return invoke<CloudKitStatus>("cloudkit_status");
}

export async function cloudkitTest(): Promise<CloudKitTestResult> {
  return invoke<CloudKitTestResult>("cloudkit_test");
}

export async function cloudkitLocalRunnerId(): Promise<string> {
  return invoke<string>("cloudkit_local_runner_id");
}

export async function cloudkitPublishPresence(
  name: string,
  platform: string,
): Promise<CloudKitRunnerInfo> {
  return invoke<CloudKitRunnerInfo>("cloudkit_publish_presence", { name, platform });
}

export async function cloudkitFetchLatestRunner(): Promise<CloudKitRunnerInfo | null> {
  return invoke<CloudKitRunnerInfo | null>("cloudkit_fetch_latest_runner");
}

export async function cloudkitPutSnapshot(scopeKey: string, payloadJson: string): Promise<void> {
  return invoke("cloudkit_put_snapshot", { scopeKey, payloadJson });
}

export async function cloudkitGetSnapshot(
  runnerId: string,
  scopeKey: string,
): Promise<CloudKitSnapshot | null> {
  return invoke<CloudKitSnapshot | null>("cloudkit_get_snapshot", { runnerId, scopeKey });
}

export async function cloudkitSubmitCommand(
  runnerId: string,
  payloadJson: string,
): Promise<CloudKitCommandAck> {
  return invoke<CloudKitCommandAck>("cloudkit_submit_command", { runnerId, payloadJson });
}

export async function cloudkitGetCommandResult(
  runnerId: string,
  commandId: string,
): Promise<CloudKitCommandResult | null> {
  return invoke<CloudKitCommandResult | null>("cloudkit_get_command_result", { runnerId, commandId });
}

export async function getWorkspaceFiles(workspaceId: string) {
  return invoke<string[]>("list_workspace_files", { workspaceId });
}

export async function listGitBranches(workspaceId: string) {
  return invoke<any>("list_git_branches", { workspaceId });
}

export async function checkoutGitBranch(workspaceId: string, name: string) {
  return invoke("checkout_git_branch", { workspaceId, name });
}

export async function createGitBranch(workspaceId: string, name: string) {
  return invoke("create_git_branch", { workspaceId, name });
}

export async function openTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<{ id: string }> {
  return invoke("terminal_open", { workspaceId, terminalId, cols, rows });
}

export async function writeTerminalSession(
  workspaceId: string,
  terminalId: string,
  data: string,
): Promise<void> {
  return invoke("terminal_write", { workspaceId, terminalId, data });
}

export async function resizeTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { workspaceId, terminalId, cols, rows });
}

export async function closeTerminalSession(
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  return invoke("terminal_close", { workspaceId, terminalId });
}

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  return invoke<any>("list_threads", { workspaceId, cursor, limit });
}

export async function resumeThread(workspaceId: string, threadId: string) {
  return invoke<any>("resume_thread", { workspaceId, threadId });
}

export async function archiveThread(workspaceId: string, threadId: string) {
  return invoke<any>("archive_thread", { workspaceId, threadId });
}
