use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::{git_rpc, git_ui_core};
use crate::state::AppState;
use crate::types::{
    GitCommitDiff, GitFileDiff, GitHubIssuesResponse, GitHubPullRequestComment,
    GitHubPullRequestDiff, GitHubPullRequestsResponse, GitLogResponse,
};

fn git_remote_params<T: Serialize>(request: &T) -> Result<Value, String> {
    git_rpc::to_params(request)
}

fn optional_usize_to_u32(value: Option<usize>) -> Option<u32> {
    value.and_then(|raw| u32::try_from(raw).ok())
}

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
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_value!(
        state,
        app,
        git_rpc::METHOD_GET_GIT_STATUS,
        git_remote_params(&request)?
    );
    git_ui_core::get_git_status_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn init_git_repo(
    workspace_id: String,
    branch: String,
    force: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let request = git_rpc::InitGitRepoRequest {
        workspace_id: workspace_id.clone(),
        branch: branch.clone(),
        force,
    };
    try_remote_value!(
        state,
        app,
        git_rpc::METHOD_INIT_GIT_REPO,
        git_remote_params(&request)?
    );
    git_ui_core::init_git_repo_core(
        &state.workspaces,
        workspace_id,
        branch,
        force.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub(crate) async fn create_github_repo(
    workspace_id: String,
    repo: String,
    visibility: String,
    branch: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let request = git_rpc::CreateGitHubRepoRequest {
        workspace_id: workspace_id.clone(),
        repo: repo.clone(),
        visibility: visibility.clone(),
        branch: branch.clone(),
    };
    try_remote_value!(
        state,
        app,
        git_rpc::METHOD_CREATE_GITHUB_REPO,
        git_remote_params(&request)?
    );
    git_ui_core::create_github_repo_core(&state.workspaces, workspace_id, repo, visibility, branch)
        .await
}

#[tauri::command]
pub(crate) async fn stage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspacePathRequest {
        workspace_id: workspace_id.clone(),
        path: path.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_STAGE_GIT_FILE,
        git_remote_params(&request)?
    );
    git_ui_core::stage_git_file_core(&state.workspaces, workspace_id, path).await
}

#[tauri::command]
pub(crate) async fn stage_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_STAGE_GIT_ALL,
        git_remote_params(&request)?
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
    let request = git_rpc::WorkspacePathRequest {
        workspace_id: workspace_id.clone(),
        path: path.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_UNSTAGE_GIT_FILE,
        git_remote_params(&request)?
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
    let request = git_rpc::WorkspacePathRequest {
        workspace_id: workspace_id.clone(),
        path: path.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_REVERT_GIT_FILE,
        git_remote_params(&request)?
    );
    git_ui_core::revert_git_file_core(&state.workspaces, workspace_id, path).await
}

#[tauri::command]
pub(crate) async fn revert_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_REVERT_GIT_ALL,
        git_remote_params(&request)?
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
    let request = git_rpc::WorkspaceMessageRequest {
        workspace_id: workspace_id.clone(),
        message: message.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_COMMIT_GIT,
        git_remote_params(&request)?
    );
    git_ui_core::commit_git_core(&state.workspaces, workspace_id, message).await
}

#[tauri::command]
pub(crate) async fn push_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_PUSH_GIT,
        git_remote_params(&request)?
    );
    git_ui_core::push_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn pull_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_PULL_GIT,
        git_remote_params(&request)?
    );
    git_ui_core::pull_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn fetch_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_FETCH_GIT,
        git_remote_params(&request)?
    );
    git_ui_core::fetch_git_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn sync_git(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_SYNC_GIT,
        git_remote_params(&request)?
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
    let request = git_rpc::ListGitRootsRequest {
        workspace_id: workspace_id.clone(),
        depth: optional_usize_to_u32(depth),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_LIST_GIT_ROOTS,
        git_remote_params(&request)?,
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
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GIT_DIFFS,
        git_remote_params(&request)?,
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
    let request = git_rpc::GetGitLogRequest {
        workspace_id: workspace_id.clone(),
        limit: optional_usize_to_u32(limit),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GIT_LOG,
        git_remote_params(&request)?,
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
    let request = git_rpc::WorkspaceShaRequest {
        workspace_id: workspace_id.clone(),
        sha: sha.clone(),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GIT_COMMIT_DIFF,
        git_remote_params(&request)?,
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
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GIT_REMOTE,
        git_remote_params(&request)?,
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
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GITHUB_ISSUES,
        git_remote_params(&request)?,
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
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GITHUB_PULL_REQUESTS,
        git_remote_params(&request)?,
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
    let request = git_rpc::GitHubPullRequestRequest {
        workspace_id: workspace_id.clone(),
        pr_number,
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GITHUB_PULL_REQUEST_DIFF,
        git_remote_params(&request)?,
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
    let request = git_rpc::GitHubPullRequestRequest {
        workspace_id: workspace_id.clone(),
        pr_number,
    };
    try_remote_typed!(
        state,
        app,
        git_rpc::METHOD_GET_GITHUB_PULL_REQUEST_COMMENTS,
        git_remote_params(&request)?,
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
    let request = git_rpc::GitHubPullRequestRequest {
        workspace_id: workspace_id.clone(),
        pr_number,
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_CHECKOUT_GITHUB_PULL_REQUEST,
        git_remote_params(&request)?
    );
    git_ui_core::checkout_github_pull_request_core(&state.workspaces, workspace_id, pr_number).await
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let request = git_rpc::WorkspaceIdRequest {
        workspace_id: workspace_id.clone(),
    };
    try_remote_value!(
        state,
        app,
        git_rpc::METHOD_LIST_GIT_BRANCHES,
        git_remote_params(&request)?
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
    let request = git_rpc::WorkspaceNameRequest {
        workspace_id: workspace_id.clone(),
        name: name.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_CHECKOUT_GIT_BRANCH,
        git_remote_params(&request)?
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
    let request = git_rpc::WorkspaceNameRequest {
        workspace_id: workspace_id.clone(),
        name: name.clone(),
    };
    try_remote_unit!(
        state,
        app,
        git_rpc::METHOD_CREATE_GIT_BRANCH,
        git_remote_params(&request)?
    );
    git_ui_core::create_git_branch_core(&state.workspaces, workspace_id, name).await
}
