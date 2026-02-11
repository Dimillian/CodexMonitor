use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::git_ui_core;
use crate::state::AppState;
use crate::types::{
    GitCommitDiff, GitFileDiff, GitHubIssuesResponse, GitHubPullRequestComment,
    GitHubPullRequestDiff, GitHubPullRequestsResponse, GitLogResponse,
};

async fn call_remote_if_enabled(
    state: &AppState,
    app: &AppHandle,
    method: &str,
    params: Value,
) -> Result<Option<Value>, String> {
    if !remote_backend::is_remote_mode(state).await {
        return Ok(None);
    }

    remote_backend::call_remote(state, app.clone(), method, params)
        .await
        .map(Some)
}

async fn call_remote_typed_if_enabled<T: DeserializeOwned>(
    state: &AppState,
    app: &AppHandle,
    method: &str,
    params: Value,
) -> Result<Option<T>, String> {
    let Some(response) = call_remote_if_enabled(state, app, method, params).await? else {
        return Ok(None);
    };

    serde_json::from_value(response)
        .map(Some)
        .map_err(|err| err.to_string())
}

macro_rules! try_remote_value {
    ($state:expr, $app:expr, $method:expr, $params:expr) => {
        if let Some(response) = call_remote_if_enabled(&$state, &$app, $method, $params).await? {
            return Ok(response);
        }
    };
}

macro_rules! try_remote_typed {
    ($state:expr, $app:expr, $method:expr, $params:expr, $ty:ty) => {
        if let Some(response) =
            call_remote_typed_if_enabled::<$ty>(&$state, &$app, $method, $params).await?
        {
            return Ok(response);
        }
    };
}

macro_rules! try_remote_unit {
    ($state:expr, $app:expr, $method:expr, $params:expr) => {
        if call_remote_if_enabled(&$state, &$app, $method, $params)
            .await?
            .is_some()
        {
            return Ok(());
        }
    };
}

#[tauri::command]
pub(crate) async fn get_git_status(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    try_remote_value!(
        state,
        app,
        "get_git_status",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::get_git_status_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn stage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "stage_git_file",
        json!({ "workspaceId": &workspace_id, "path": &path })
    );
    git_ui_core::stage_git_file_core(&state.workspaces, workspace_id, path).await
}

#[tauri::command]
pub(crate) async fn stage_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "stage_git_all",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::stage_git_all_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn unstage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "unstage_git_file",
        json!({ "workspaceId": &workspace_id, "path": &path })
    );
    git_ui_core::unstage_git_file_core(&state.workspaces, workspace_id, path).await
}

#[tauri::command]
pub(crate) async fn revert_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "revert_git_file",
        json!({ "workspaceId": &workspace_id, "path": &path })
    );
    git_ui_core::revert_git_file_core(&state.workspaces, workspace_id, path).await
}

#[tauri::command]
pub(crate) async fn revert_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "revert_git_all",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::revert_git_all_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn commit_git(
    workspace_id: String,
    message: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "commit_git",
        json!({ "workspaceId": &workspace_id, "message": &message })
    );
    git_ui_core::commit_git_core(&state.workspaces, workspace_id, message).await
}

#[tauri::command]
pub(crate) async fn push_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "push_git",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::push_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn pull_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "pull_git",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::pull_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn fetch_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "fetch_git",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::fetch_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn sync_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "sync_git",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::sync_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn list_git_roots(
    workspace_id: String,
    depth: Option<usize>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<String>, String> {
    try_remote_typed!(
        state,
        app,
        "list_git_roots",
        json!({ "workspaceId": &workspace_id, "depth": depth }),
        Vec<String>
    );
    git_ui_core::list_git_roots_core(&state.workspaces, workspace_id, depth).await
}

/// Helper function to get the combined diff for a workspace (used by commit message generation)
pub(crate) async fn get_workspace_diff(
    workspace_id: &str,
    state: &State<'_, AppState>,
) -> Result<String, String> {
    let repo_root = git_ui_core::resolve_repo_root_for_workspace_core(
        &state.workspaces,
        workspace_id.to_string(),
    )
    .await?;
    git_ui_core::collect_workspace_diff_core(&repo_root)
}

#[tauri::command]
pub(crate) async fn get_git_diffs(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<GitFileDiff>, String> {
    try_remote_typed!(
        state,
        app,
        "get_git_diffs",
        json!({ "workspaceId": &workspace_id }),
        Vec<GitFileDiff>
    );
    git_ui_core::get_git_diffs_core(&state.workspaces, &state.app_settings, workspace_id).await
}

#[tauri::command]
pub(crate) async fn get_git_log(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<GitLogResponse, String> {
    try_remote_typed!(
        state,
        app,
        "get_git_log",
        json!({ "workspaceId": &workspace_id, "limit": limit }),
        GitLogResponse
    );
    git_ui_core::get_git_log_core(&state.workspaces, workspace_id, limit).await
}

#[tauri::command]
pub(crate) async fn get_git_commit_diff(
    workspace_id: String,
    sha: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<GitCommitDiff>, String> {
    try_remote_typed!(
        state,
        app,
        "get_git_commit_diff",
        json!({ "workspaceId": &workspace_id, "sha": &sha }),
        Vec<GitCommitDiff>
    );
    git_ui_core::get_git_commit_diff_core(&state.workspaces, &state.app_settings, workspace_id, sha)
        .await
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Option<String>, String> {
    try_remote_typed!(
        state,
        app,
        "get_git_remote",
        json!({ "workspaceId": &workspace_id }),
        Option<String>
    );
    git_ui_core::get_git_remote_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<GitHubIssuesResponse, String> {
    try_remote_typed!(
        state,
        app,
        "get_github_issues",
        json!({ "workspaceId": &workspace_id }),
        GitHubIssuesResponse
    );
    git_ui_core::get_github_issues_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn get_github_pull_requests(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<GitHubPullRequestsResponse, String> {
    try_remote_typed!(
        state,
        app,
        "get_github_pull_requests",
        json!({ "workspaceId": &workspace_id }),
        GitHubPullRequestsResponse
    );
    git_ui_core::get_github_pull_requests_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_diff(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    try_remote_typed!(
        state,
        app,
        "get_github_pull_request_diff",
        json!({ "workspaceId": &workspace_id, "prNumber": pr_number }),
        Vec<GitHubPullRequestDiff>
    );
    git_ui_core::get_github_pull_request_diff_core(&state.workspaces, workspace_id, pr_number).await
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_comments(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    try_remote_typed!(
        state,
        app,
        "get_github_pull_request_comments",
        json!({ "workspaceId": &workspace_id, "prNumber": pr_number }),
        Vec<GitHubPullRequestComment>
    );
    git_ui_core::get_github_pull_request_comments_core(&state.workspaces, workspace_id, pr_number)
        .await
}

#[tauri::command]
pub(crate) async fn checkout_github_pull_request(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "checkout_github_pull_request",
        json!({ "workspaceId": &workspace_id, "prNumber": pr_number })
    );
    git_ui_core::checkout_github_pull_request_core(&state.workspaces, workspace_id, pr_number).await
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    try_remote_value!(
        state,
        app,
        "list_git_branches",
        json!({ "workspaceId": &workspace_id })
    );
    git_ui_core::list_git_branches_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn checkout_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "checkout_git_branch",
        json!({ "workspaceId": &workspace_id, "name": &name })
    );
    git_ui_core::checkout_git_branch_core(&state.workspaces, workspace_id, name).await
}

#[tauri::command]
pub(crate) async fn create_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    try_remote_unit!(
        state,
        app,
        "create_git_branch",
        json!({ "workspaceId": &workspace_id, "name": &name })
    );
    git_ui_core::create_git_branch_core(&state.workspaces, workspace_id, name).await
}
