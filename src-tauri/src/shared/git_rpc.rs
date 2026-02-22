use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const METHOD_GET_GIT_STATUS: &str = "get_git_status";
pub(crate) const METHOD_INIT_GIT_REPO: &str = "init_git_repo";
pub(crate) const METHOD_CREATE_GITHUB_REPO: &str = "create_github_repo";
pub(crate) const METHOD_STAGE_GIT_FILE: &str = "stage_git_file";
pub(crate) const METHOD_STAGE_GIT_ALL: &str = "stage_git_all";
pub(crate) const METHOD_UNSTAGE_GIT_FILE: &str = "unstage_git_file";
pub(crate) const METHOD_REVERT_GIT_FILE: &str = "revert_git_file";
pub(crate) const METHOD_REVERT_GIT_ALL: &str = "revert_git_all";
pub(crate) const METHOD_COMMIT_GIT: &str = "commit_git";
pub(crate) const METHOD_PUSH_GIT: &str = "push_git";
pub(crate) const METHOD_PULL_GIT: &str = "pull_git";
pub(crate) const METHOD_FETCH_GIT: &str = "fetch_git";
pub(crate) const METHOD_SYNC_GIT: &str = "sync_git";
pub(crate) const METHOD_LIST_GIT_ROOTS: &str = "list_git_roots";
pub(crate) const METHOD_GET_GIT_DIFFS: &str = "get_git_diffs";
pub(crate) const METHOD_GET_GIT_LOG: &str = "get_git_log";
pub(crate) const METHOD_GET_GIT_COMMIT_DIFF: &str = "get_git_commit_diff";
pub(crate) const METHOD_GET_GIT_REMOTE: &str = "get_git_remote";
pub(crate) const METHOD_GET_GITHUB_ISSUES: &str = "get_github_issues";
pub(crate) const METHOD_GET_GITHUB_PULL_REQUESTS: &str = "get_github_pull_requests";
pub(crate) const METHOD_GET_GITHUB_PULL_REQUEST_DIFF: &str = "get_github_pull_request_diff";
pub(crate) const METHOD_GET_GITHUB_PULL_REQUEST_COMMENTS: &str = "get_github_pull_request_comments";
pub(crate) const METHOD_CHECKOUT_GITHUB_PULL_REQUEST: &str = "checkout_github_pull_request";
pub(crate) const METHOD_LIST_GIT_BRANCHES: &str = "list_git_branches";
pub(crate) const METHOD_CHECKOUT_GIT_BRANCH: &str = "checkout_git_branch";
pub(crate) const METHOD_CREATE_GIT_BRANCH: &str = "create_git_branch";
#[allow(dead_code)]
pub(crate) const METHOD_GENERATE_COMMIT_MESSAGE: &str = "generate_commit_message";

#[allow(dead_code)]
pub(crate) fn to_params<T: Serialize>(request: &T) -> Result<Value, String> {
    serde_json::to_value(request).map_err(|err| err.to_string())
}

#[allow(dead_code)]
pub(crate) fn from_params<T: DeserializeOwned>(params: &Value) -> Result<T, String> {
    serde_json::from_value(params.clone()).map_err(|err| err.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceIdRequest {
    pub(crate) workspace_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InitGitRepoRequest {
    pub(crate) workspace_id: String,
    pub(crate) branch: String,
    pub(crate) force: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InitGitRepoRequiredRequest {
    pub(crate) workspace_id: String,
    pub(crate) branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateGitHubRepoRequest {
    pub(crate) workspace_id: String,
    pub(crate) repo: String,
    pub(crate) visibility: String,
    pub(crate) branch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateGitHubRepoRequiredRequest {
    pub(crate) workspace_id: String,
    pub(crate) repo: String,
    pub(crate) visibility: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspacePathRequest {
    pub(crate) workspace_id: String,
    pub(crate) path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListGitRootsRequest {
    pub(crate) workspace_id: String,
    pub(crate) depth: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetGitLogRequest {
    pub(crate) workspace_id: String,
    pub(crate) limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceShaRequest {
    pub(crate) workspace_id: String,
    pub(crate) sha: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceMessageRequest {
    pub(crate) workspace_id: String,
    pub(crate) message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubPullRequestRequest {
    pub(crate) workspace_id: String,
    pub(crate) pr_number: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceNameRequest {
    pub(crate) workspace_id: String,
    pub(crate) name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerateCommitMessageRequest {
    pub(crate) workspace_id: String,
    pub(crate) commit_message_model_id: Option<String>,
}
