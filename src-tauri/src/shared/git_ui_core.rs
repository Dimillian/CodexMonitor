use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::Value;
use tokio::sync::Mutex;

use crate::types::{
    AppSettings, GitCommitDiff, GitFileDiff, GitHubIssuesResponse, GitHubPullRequestComment,
    GitHubPullRequestDiff, GitHubPullRequestsResponse, GitLogResponse, WorkspaceEntry,
};

#[path = "git_ui_core/commands.rs"]
mod commands;
#[path = "git_ui_core/context.rs"]
mod context;
#[path = "git_ui_core/diff.rs"]
mod diff;
#[path = "git_ui_core/github.rs"]
mod github;
#[path = "git_ui_core/log.rs"]
mod log;

#[cfg(test)]
#[path = "git_ui_core/tests.rs"]
mod tests;

pub(crate) async fn resolve_repo_root_for_workspace_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<PathBuf, String> {
    context::resolve_repo_root_for_workspace(workspaces, workspace_id).await
}

pub(crate) fn collect_workspace_diff_core(repo_root: &Path) -> Result<String, String> {
    diff::collect_workspace_diff(repo_root)
}

pub(crate) async fn get_git_status_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    diff::get_git_status_inner(workspaces, workspace_id).await
}

pub(crate) async fn list_git_roots_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    depth: Option<usize>,
) -> Result<Vec<String>, String> {
    commands::list_git_roots_inner(workspaces, workspace_id, depth).await
}

pub(crate) async fn get_git_diffs_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
) -> Result<Vec<GitFileDiff>, String> {
    diff::get_git_diffs_inner(workspaces, app_settings, workspace_id).await
}

pub(crate) async fn get_git_log_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    limit: Option<usize>,
) -> Result<GitLogResponse, String> {
    log::get_git_log_inner(workspaces, workspace_id, limit).await
}

pub(crate) async fn get_git_commit_diff_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
    sha: String,
) -> Result<Vec<GitCommitDiff>, String> {
    diff::get_git_commit_diff_inner(workspaces, app_settings, workspace_id, sha).await
}

pub(crate) async fn get_git_remote_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Option<String>, String> {
    log::get_git_remote_inner(workspaces, workspace_id).await
}

pub(crate) async fn stage_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    commands::stage_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn stage_git_all_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::stage_git_all_inner(workspaces, workspace_id).await
}

pub(crate) async fn unstage_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    commands::unstage_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn revert_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    commands::revert_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn revert_git_all_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::revert_git_all_inner(workspaces, workspace_id).await
}

pub(crate) async fn commit_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    message: String,
) -> Result<(), String> {
    commands::commit_git_inner(workspaces, workspace_id, message).await
}

pub(crate) async fn push_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::push_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn pull_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::pull_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn fetch_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::fetch_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn sync_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    commands::sync_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_issues_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubIssuesResponse, String> {
    github::get_github_issues_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_pull_requests_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubPullRequestsResponse, String> {
    github::get_github_pull_requests_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_pull_request_diff_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    github::get_github_pull_request_diff_inner(workspaces, workspace_id, pr_number).await
}

pub(crate) async fn get_github_pull_request_comments_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    github::get_github_pull_request_comments_inner(workspaces, workspace_id, pr_number).await
}

pub(crate) async fn checkout_github_pull_request_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<(), String> {
    github::checkout_github_pull_request_inner(workspaces, workspace_id, pr_number).await
}

pub(crate) async fn list_git_branches_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    commands::list_git_branches_inner(workspaces, workspace_id).await
}

pub(crate) async fn checkout_git_branch_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    commands::checkout_git_branch_inner(workspaces, workspace_id, name).await
}

pub(crate) async fn create_git_branch_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    commands::create_git_branch_inner(workspaces, workspace_id, name).await
}
