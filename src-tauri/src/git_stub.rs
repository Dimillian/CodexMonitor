use tauri::State;

use crate::state::AppState;
use crate::types::{GitFileDiff, GitHubIssuesResponse, GitLogResponse};

const GIT_IOS_UNAVAILABLE: &str = "Git features are not supported on iOS.";

#[tauri::command]
pub(crate) async fn get_git_status(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn get_git_diffs(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<Vec<GitFileDiff>, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn get_git_log(
    _workspace_id: String,
    _limit: Option<usize>,
    _state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<GitHubIssuesResponse, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    _workspace_id: String,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn checkout_git_branch(
    _workspace_id: String,
    _name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}

#[tauri::command]
pub(crate) async fn create_git_branch(
    _workspace_id: String,
    _name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(GIT_IOS_UNAVAILABLE.to_string())
}
