use tauri::State;

use crate::state::AppState;
use crate::types::{
    GitFileDiff, GitHubIssuesResponse, GitHubPullRequestDiff, GitHubPullRequestsResponse,
    GitHubPullRequestComment, GitLogResponse,
};

fn unsupported() -> String {
    "Git features are not supported on mobile builds.".to_string()
}

#[tauri::command]
pub(crate) async fn get_git_status(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_git_diffs(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<Vec<GitFileDiff>, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_git_log(
    _workspace_id: String,
    _limit: Option<usize>,
    _state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn list_git_roots(
    _workspace_id: String,
    _depth: Option<usize>,
    _state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn stage_git_file(
    _workspace_id: String,
    _path: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn unstage_git_file(
    _workspace_id: String,
    _path: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn revert_git_file(
    _workspace_id: String,
    _path: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn revert_git_all(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<GitHubIssuesResponse, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_github_pull_requests(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<GitHubPullRequestsResponse, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_diff(
    _workspace_id: String,
    _pr_number: u64,
    _state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_comments(
    _workspace_id: String,
    _pr_number: u64,
    _state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn checkout_git_branch(
    _workspace_id: String,
    _name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn create_git_branch(
    _workspace_id: String,
    _name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}
