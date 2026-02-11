use std::collections::HashMap;
use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::git_utils::resolve_git_root;
use crate::types::WorkspaceEntry;

pub(super) async fn workspace_entry_for_id(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<WorkspaceEntry, String> {
    let workspaces = workspaces.lock().await;
    workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())
}

pub(super) async fn resolve_repo_root_for_workspace(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<PathBuf, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    resolve_git_root(&entry)
}
