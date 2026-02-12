use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;
use crate::types::{WorkspaceEntry, WorkspaceInfo};

pub(crate) const WORKTREE_SETUP_MARKERS_DIR: &str = "worktree-setup";
pub(crate) const WORKTREE_SETUP_MARKER_EXT: &str = "ran";
pub(super) const AGENTS_MD_FILE_NAME: &str = "AGENTS.md";

pub(super) fn copy_agents_md_from_parent_to_worktree(
    parent_repo_root: &PathBuf,
    worktree_root: &PathBuf,
) -> Result<(), String> {
    let source_path = parent_repo_root.join(AGENTS_MD_FILE_NAME);
    if !source_path.is_file() {
        return Ok(());
    }

    let destination_path = worktree_root.join(AGENTS_MD_FILE_NAME);
    if destination_path.is_file() {
        return Ok(());
    }

    let temp_path = worktree_root.join(format!("{AGENTS_MD_FILE_NAME}.tmp"));

    std::fs::copy(&source_path, &temp_path).map_err(|err| {
        format!(
            "Failed to copy {} from {} to {}: {err}",
            AGENTS_MD_FILE_NAME,
            source_path.display(),
            temp_path.display()
        )
    })?;

    std::fs::rename(&temp_path, &destination_path).map_err(|err| {
        let _ = std::fs::remove_file(&temp_path);
        format!(
            "Failed to finalize {} copy to {}: {err}",
            AGENTS_MD_FILE_NAME,
            destination_path.display()
        )
    })?;

    Ok(())
}

pub(crate) fn normalize_setup_script(script: Option<String>) -> Option<String> {
    match script {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
        None => None,
    }
}

pub(crate) fn worktree_setup_marker_path(data_dir: &PathBuf, workspace_id: &str) -> PathBuf {
    data_dir
        .join(WORKTREE_SETUP_MARKERS_DIR)
        .join(format!("{workspace_id}.{WORKTREE_SETUP_MARKER_EXT}"))
}

pub(crate) fn is_workspace_path_dir_core(path: &str) -> bool {
    PathBuf::from(path).is_dir()
}

pub(crate) async fn list_workspaces_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
) -> Vec<WorkspaceInfo> {
    let workspaces = workspaces.lock().await;
    let sessions = sessions.lock().await;
    let mut result = Vec::new();
    for entry in workspaces.values() {
        result.push(WorkspaceInfo {
            id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            codex_bin: entry.codex_bin.clone(),
            connected: sessions.contains_key(&entry.id),
            kind: entry.kind.clone(),
            parent_id: entry.parent_id.clone(),
            worktree: entry.worktree.clone(),
            settings: entry.settings.clone(),
        });
    }
    sort_workspaces(&mut result);
    result
}

pub(super) async fn resolve_entry_and_parent(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    let parent_entry = entry
        .parent_id
        .as_ref()
        .and_then(|parent_id| workspaces.get(parent_id))
        .cloned();
    Ok((entry, parent_entry))
}

pub(super) async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(entry.path))
}

pub(super) fn sort_workspaces(workspaces: &mut [WorkspaceInfo]) {
    workspaces.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        if a_order != b_order {
            return a_order.cmp(&b_order);
        }
        a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id))
    });
}

#[cfg(test)]
mod tests {
    use super::{copy_agents_md_from_parent_to_worktree, AGENTS_MD_FILE_NAME};
    use uuid::Uuid;

    fn make_temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("codex-monitor-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[test]
    fn copies_agents_md_when_missing_in_worktree() {
        let parent = make_temp_dir();
        let worktree = make_temp_dir();
        let parent_agents = parent.join(AGENTS_MD_FILE_NAME);
        let worktree_agents = worktree.join(AGENTS_MD_FILE_NAME);

        std::fs::write(&parent_agents, "parent").expect("failed to write parent AGENTS.md");

        copy_agents_md_from_parent_to_worktree(&parent, &worktree).expect("copy should succeed");

        let copied = std::fs::read_to_string(&worktree_agents)
            .expect("worktree AGENTS.md should exist after copy");
        assert_eq!(copied, "parent");

        let _ = std::fs::remove_dir_all(parent);
        let _ = std::fs::remove_dir_all(worktree);
    }

    #[test]
    fn does_not_overwrite_existing_worktree_agents_md() {
        let parent = make_temp_dir();
        let worktree = make_temp_dir();
        let parent_agents = parent.join(AGENTS_MD_FILE_NAME);
        let worktree_agents = worktree.join(AGENTS_MD_FILE_NAME);

        std::fs::write(&parent_agents, "parent").expect("failed to write parent AGENTS.md");
        std::fs::write(&worktree_agents, "branch-specific")
            .expect("failed to write worktree AGENTS.md");

        copy_agents_md_from_parent_to_worktree(&parent, &worktree).expect("copy should succeed");

        let retained = std::fs::read_to_string(&worktree_agents)
            .expect("worktree AGENTS.md should still exist");
        assert_eq!(retained, "branch-specific");

        let _ = std::fs::remove_dir_all(parent);
        let _ = std::fs::remove_dir_all(worktree);
    }
}
