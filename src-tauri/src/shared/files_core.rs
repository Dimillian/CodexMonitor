use std::collections::HashMap;
use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::home as codex_home;
use crate::files::io::TextFileResponse;
use crate::files::ops::{read_with_policy, write_with_policy};
use crate::files::policy::{policy_for, FileKind, FileScope};
use crate::types::WorkspaceEntry;

fn resolve_default_codex_home() -> Result<PathBuf, String> {
    codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

pub(crate) async fn resolve_root_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    workspace_id: Option<&str>,
) -> Result<PathBuf, String> {
    match scope {
        FileScope::Global => resolve_default_codex_home(),
        FileScope::Workspace => {
            let workspace_id = workspace_id.ok_or_else(|| "workspaceId is required".to_string())?;
            resolve_workspace_root(workspaces, workspace_id).await
        }
    }
}

pub(crate) async fn file_read_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
) -> Result<TextFileResponse, String> {
    let policy = policy_for(scope, kind)?;
    let root = resolve_root_core(workspaces, scope, workspace_id.as_deref()).await?;
    read_with_policy(&root, policy)
}

pub(crate) async fn file_write_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
) -> Result<(), String> {
    let policy = policy_for(scope, kind)?;
    let root = resolve_root_core(workspaces, scope, workspace_id.as_deref()).await?;
    write_with_policy(&root, policy, &content)
}
