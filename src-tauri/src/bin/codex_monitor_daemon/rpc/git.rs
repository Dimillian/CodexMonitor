use super::*;
use crate::shared::git_rpc;
use crate::types::GitSelectionLine;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::future::Future;

fn parse_git_request<T: DeserializeOwned>(params: &Value) -> Result<T, String> {
    git_rpc::from_params(params)
}

fn serialize_value<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| err.to_string())
}

async fn serialize_result<T, Fut>(future: Fut) -> Result<Value, String>
where
    T: Serialize,
    Fut: Future<Output = Result<T, String>>,
{
    future.await.and_then(serialize_value)
}

async fn serialize_ok<Fut>(future: Fut) -> Result<Value, String>
where
    Fut: Future<Output = Result<(), String>>,
{
    future.await.map(|_| json!({ "ok": true }))
}

macro_rules! parse_request_or_err {
    ($params:expr, $ty:ty) => {
        match parse_git_request::<$ty>($params) {
            Ok(value) => value,
            Err(err) => return Some(Err(err)),
        }
    };
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        git_rpc::METHOD_GET_GIT_STATUS => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(state.get_git_status(request.workspace_id).await)
        }
        git_rpc::METHOD_INIT_GIT_REPO => {
            let request = parse_request_or_err!(params, git_rpc::InitGitRepoRequiredRequest);
            let force = parse_optional_bool(params, "force").unwrap_or(false);
            Some(
                state
                    .init_git_repo(request.workspace_id, request.branch, force)
                    .await,
            )
        }
        git_rpc::METHOD_CREATE_GITHUB_REPO => {
            let request = parse_request_or_err!(params, git_rpc::CreateGitHubRepoRequiredRequest);
            let branch = parse_optional_string(params, "branch");
            Some(
                state
                    .create_github_repo(
                        request.workspace_id,
                        request.repo,
                        request.visibility,
                        branch,
                    )
                    .await,
            )
        }
        git_rpc::METHOD_LIST_GIT_ROOTS => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            let depth = parse_optional_u32(params, "depth").map(|value| value as usize);
            Some(serialize_result(state.list_git_roots(request.workspace_id, depth)).await)
        }
        git_rpc::METHOD_GET_GIT_DIFFS => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.get_git_diffs(request.workspace_id)).await)
        }
        git_rpc::METHOD_GET_GIT_LOG => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            let limit = parse_optional_u32(params, "limit").map(|value| value as usize);
            Some(serialize_result(state.get_git_log(request.workspace_id, limit)).await)
        }
        git_rpc::METHOD_GET_GIT_COMMIT_DIFF => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceShaRequest);
            Some(
                serialize_result(state.get_git_commit_diff(request.workspace_id, request.sha))
                    .await,
            )
        }
        git_rpc::METHOD_GET_GIT_REMOTE => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.get_git_remote(request.workspace_id)).await)
        }
        git_rpc::METHOD_STAGE_GIT_FILE => {
            let request = parse_request_or_err!(params, git_rpc::WorkspacePathRequest);
            Some(serialize_ok(state.stage_git_file(request.workspace_id, request.path)).await)
        }
        git_rpc::METHOD_STAGE_GIT_ALL => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.stage_git_all(request.workspace_id)).await)
        }
        "stage_git_selection" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let op = match parse_string(params, "op") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let source = match parse_string(params, "source") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let lines = match parse_optional_value(params, "lines")
                .map(serde_json::from_value::<Vec<GitSelectionLine>>)
                .transpose()
            {
                Ok(value) => value.unwrap_or_default(),
                Err(err) => return Some(Err(format!("invalid `lines`: {err}"))),
            };
            Some(
                state
                    .stage_git_selection(workspace_id, path, op, source, lines)
                    .await
                    .and_then(|result| serde_json::to_value(result).map_err(|err| err.to_string())),
            )
        }
        git_rpc::METHOD_UNSTAGE_GIT_FILE => {
            let request = parse_request_or_err!(params, git_rpc::WorkspacePathRequest);
            Some(serialize_ok(state.unstage_git_file(request.workspace_id, request.path)).await)
        }
        git_rpc::METHOD_REVERT_GIT_FILE => {
            let request = parse_request_or_err!(params, git_rpc::WorkspacePathRequest);
            Some(serialize_ok(state.revert_git_file(request.workspace_id, request.path)).await)
        }
        git_rpc::METHOD_REVERT_GIT_ALL => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.revert_git_all(request.workspace_id)).await)
        }
        git_rpc::METHOD_COMMIT_GIT => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceMessageRequest);
            Some(serialize_ok(state.commit_git(request.workspace_id, request.message)).await)
        }
        git_rpc::METHOD_PUSH_GIT => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.push_git(request.workspace_id)).await)
        }
        git_rpc::METHOD_PULL_GIT => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.pull_git(request.workspace_id)).await)
        }
        git_rpc::METHOD_FETCH_GIT => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.fetch_git(request.workspace_id)).await)
        }
        git_rpc::METHOD_SYNC_GIT => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.sync_git(request.workspace_id)).await)
        }
        git_rpc::METHOD_GET_GITHUB_ISSUES => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.get_github_issues(request.workspace_id)).await)
        }
        git_rpc::METHOD_GET_GITHUB_PULL_REQUESTS => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.get_github_pull_requests(request.workspace_id)).await)
        }
        git_rpc::METHOD_GET_GITHUB_PULL_REQUEST_DIFF => {
            let request = parse_request_or_err!(params, git_rpc::GitHubPullRequestRequest);
            Some(
                serialize_result(
                    state.get_github_pull_request_diff(request.workspace_id, request.pr_number),
                )
                .await,
            )
        }
        git_rpc::METHOD_GET_GITHUB_PULL_REQUEST_COMMENTS => {
            let request = parse_request_or_err!(params, git_rpc::GitHubPullRequestRequest);
            Some(
                serialize_result(
                    state.get_github_pull_request_comments(request.workspace_id, request.pr_number),
                )
                .await,
            )
        }
        git_rpc::METHOD_CHECKOUT_GITHUB_PULL_REQUEST => {
            let request = parse_request_or_err!(params, git_rpc::GitHubPullRequestRequest);
            Some(
                serialize_ok(
                    state.checkout_github_pull_request(request.workspace_id, request.pr_number),
                )
                .await,
            )
        }
        git_rpc::METHOD_LIST_GIT_BRANCHES => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            Some(state.list_git_branches(request.workspace_id).await)
        }
        git_rpc::METHOD_CHECKOUT_GIT_BRANCH => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceNameRequest);
            Some(serialize_ok(state.checkout_git_branch(request.workspace_id, request.name)).await)
        }
        git_rpc::METHOD_CREATE_GIT_BRANCH => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceNameRequest);
            Some(serialize_ok(state.create_git_branch(request.workspace_id, request.name)).await)
        }
        git_rpc::METHOD_GENERATE_COMMIT_MESSAGE => {
            let request = parse_request_or_err!(params, git_rpc::WorkspaceIdRequest);
            let commit_message_model_id = parse_optional_string(params, "commitMessageModelId");
            Some(
                state
                    .generate_commit_message(request.workspace_id, commit_message_model_id)
                    .await
                    .map(Value::String),
            )
        }
        _ => None,
    }
}
