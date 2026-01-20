import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  CodexDoctorResult,
  DictationModelStatus,
  DictationSessionState,
  LocalUsageSnapshot,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../types";
import type {
  GitFileDiff,
  GitFileStatus,
  GitHubIssuesResponse,
  GitHubPullRequestComment,
  GitHubPullRequestDiff,
  GitHubPullRequestsResponse,
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

export async function addClone(
  sourceWorkspaceId: string,
  copiesFolder: string,
  copyName: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("add_clone", {
    sourceWorkspaceId,
    copiesFolder,
    copyName,
  });
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

export async function applyWorktreeChanges(workspaceId: string): Promise<void> {
  return invoke("apply_worktree_changes", { workspaceId });
}

export async function openWorkspaceIn(path: string, app: string): Promise<void> {
  return invoke("open_workspace_in", { path, app });
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
    collaborationMode?: Record<string, unknown> | null;
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
    collaborationMode: options?.collaborationMode ?? null,
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

export async function rememberApprovalRule(
  workspaceId: string,
  command: string[],
) {
  return invoke("remember_approval_rule", { workspaceId, command });
}

export async function getGitStatus(workspace_id: string): Promise<{
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}> {
  return invoke("get_git_status", { workspaceId: workspace_id });
}

export async function listGitRoots(
  workspace_id: string,
  depth: number,
): Promise<string[]> {
  return invoke("list_git_roots", { workspaceId: workspace_id, depth });
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

export async function stageGitFile(workspaceId: string, path: string) {
  return invoke("stage_git_file", { workspaceId, path });
}

export async function unstageGitFile(workspaceId: string, path: string) {
  return invoke("unstage_git_file", { workspaceId, path });
}

export async function revertGitFile(workspaceId: string, path: string) {
  return invoke("revert_git_file", { workspaceId, path });
}

export async function revertGitAll(workspaceId: string) {
  return invoke("revert_git_all", { workspaceId });
}

export async function getGitHubIssues(
  workspace_id: string,
): Promise<GitHubIssuesResponse> {
  return invoke("get_github_issues", { workspaceId: workspace_id });
}

export async function getGitHubPullRequests(
  workspace_id: string,
): Promise<GitHubPullRequestsResponse> {
  return invoke("get_github_pull_requests", { workspaceId: workspace_id });
}

export async function getGitHubPullRequestDiff(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestDiff[]> {
  return invoke("get_github_pull_request_diff", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function getGitHubPullRequestComments(
  workspace_id: string,
  prNumber: number,
): Promise<GitHubPullRequestComment[]> {
  return invoke("get_github_pull_request_comments", {
    workspaceId: workspace_id,
    prNumber,
  });
}

export async function localUsageSnapshot(
  days?: number,
): Promise<LocalUsageSnapshot> {
  return invoke("local_usage_snapshot", { days: days ?? 30 });
}

export async function getModelList(workspaceId: string) {
  return invoke<any>("model_list", { workspaceId });
}

export async function getCollaborationModes(workspaceId: string) {
  return invoke<any>("collaboration_mode_list", { workspaceId });
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

export async function getWorkspacePromptsDir(workspaceId: string) {
  return invoke<string>("prompts_workspace_dir", { workspaceId });
}

export async function getGlobalPromptsDir() {
  return invoke<string>("prompts_global_dir");
}

export async function createPrompt(
  workspaceId: string,
  data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return invoke<any>("prompts_create", {
    workspaceId,
    scope: data.scope,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function updatePrompt(
  workspaceId: string,
  data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  },
) {
  return invoke<any>("prompts_update", {
    workspaceId,
    path: data.path,
    name: data.name,
    description: data.description ?? null,
    argumentHint: data.argumentHint ?? null,
    content: data.content,
  });
}

export async function deletePrompt(workspaceId: string, path: string) {
  return invoke<any>("prompts_delete", { workspaceId, path });
}

export async function movePrompt(
  workspaceId: string,
  data: { path: string; scope: "workspace" | "global" },
) {
  return invoke<any>("prompts_move", {
    workspaceId,
    path: data.path,
    scope: data.scope,
  });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("update_app_settings", { settings });
}

export async function runCodexDoctor(
  codexBin: string | null,
): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin });
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

function withModelId(modelId?: string | null) {
  return modelId ? { modelId } : {};
}

export async function getDictationModelStatus(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return invoke<DictationModelStatus>(
    "dictation_model_status",
    withModelId(modelId),
  );
}

export async function downloadDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return invoke<DictationModelStatus>(
    "dictation_download_model",
    withModelId(modelId),
  );
}

export async function cancelDictationDownload(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return invoke<DictationModelStatus>(
    "dictation_cancel_download",
    withModelId(modelId),
  );
}

export async function removeDictationModel(
  modelId?: string | null,
): Promise<DictationModelStatus> {
  return invoke<DictationModelStatus>(
    "dictation_remove_model",
    withModelId(modelId),
  );
}

export async function startDictation(
  preferredLanguage: string | null,
): Promise<DictationSessionState> {
  return invoke("dictation_start", { preferredLanguage });
}

export async function stopDictation(): Promise<DictationSessionState> {
  return invoke("dictation_stop");
}

export async function cancelDictation(): Promise<DictationSessionState> {
  return invoke("dictation_cancel");
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
