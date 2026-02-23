use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::WorkspaceSettings;

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
pub(crate) struct ReadWorkspaceFileRequest {
    pub(crate) workspace_id: String,
    pub(crate) path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetWorkspaceRuntimeCodexArgsRequest {
    pub(crate) workspace_id: String,
    pub(crate) codex_args: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IsWorkspacePathDirRequest {
    pub(crate) path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListRemoteDirectoriesRequest {
    pub(crate) path: Option<String>,
    pub(crate) include_hidden: Option<bool>,
    pub(crate) limit: Option<u32>,
    pub(crate) offset: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteDirectoryEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) is_symlink: bool,
    pub(crate) is_readable: bool,
    pub(crate) symlink_target: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListRemoteDirectoriesResponse {
    pub(crate) current_path: String,
    pub(crate) parent_path: Option<String>,
    pub(crate) entries: Vec<RemoteDirectoryEntry>,
    pub(crate) truncated: bool,
    pub(crate) entry_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct AddWorkspaceRequest {
    pub(crate) path: String,
    pub(crate) codex_bin: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct AddWorkspaceFromGitUrlRequest {
    pub(crate) url: String,
    pub(crate) destination_path: String,
    pub(crate) target_folder_name: Option<String>,
    pub(crate) codex_bin: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddWorktreeRequest {
    pub(crate) parent_id: String,
    pub(crate) branch: String,
    pub(crate) name: Option<String>,
    pub(crate) copy_agents_md: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceIdRequest {
    pub(crate) workspace_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IdRequest {
    pub(crate) id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RenameWorktreeRequest {
    pub(crate) id: String,
    pub(crate) branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenameWorktreeUpstreamRequest {
    pub(crate) id: String,
    pub(crate) old_branch: String,
    pub(crate) new_branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UpdateWorkspaceSettingsRequest {
    pub(crate) id: String,
    pub(crate) settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UpdateWorkspaceCodexBinRequest {
    pub(crate) id: String,
    pub(crate) codex_bin: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddCloneRequest {
    pub(crate) source_workspace_id: String,
    pub(crate) copy_name: String,
    pub(crate) copies_folder: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct OpenWorkspaceInRequest {
    pub(crate) path: String,
    pub(crate) app: Option<String>,
    pub(crate) args: Vec<String>,
    pub(crate) command: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetOpenAppIconRequest {
    pub(crate) app_name: String,
}
