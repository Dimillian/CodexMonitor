use std::path::PathBuf;
use std::process::Stdio;

use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

#[cfg(target_os = "macos")]
use super::macos::get_open_app_icon_inner;
use super::agent_md::{read_agent_md_inner, write_agent_md_inner, AgentMdResponse};
use super::files::{list_workspace_files_inner, read_workspace_file_inner, WorkspaceFileResponse};
use super::git::{
    git_branch_exists, git_find_remote_for_branch, git_get_origin_url, git_remote_branch_exists,
    git_remote_exists, is_missing_worktree_error, run_git_command, run_git_command_bytes,
    run_git_diff, unique_branch_name,
};
use super::settings::{apply_workspace_settings_update, sort_workspaces};
use super::worktree::{
    build_clone_destination_path, null_device_path, sanitize_worktree_name, unique_worktree_path,
    unique_worktree_path_for_rename,
};

use crate::codex::spawn_workspace_session;
use crate::codex_args::resolve_workspace_codex_args;
use crate::codex_home::resolve_workspace_codex_home;
use crate::git_utils::resolve_git_root;
use crate::remote_backend;
use crate::state::AppState;
use crate::storage::write_workspaces;
use crate::types::{
    WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
    WorktreeSetupStatus,
};
use crate::utils::{git_env_path, resolve_git_binary};

const WORKTREE_SETUP_MARKERS_DIR: &str = "worktree-setup";
const WORKTREE_SETUP_MARKER_EXT: &str = "ran";

fn worktree_setup_marker_path(app: &AppHandle, workspace_id: &str) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;
    Ok(app_data_dir
        .join(WORKTREE_SETUP_MARKERS_DIR)
        .join(format!("{workspace_id}.{WORKTREE_SETUP_MARKER_EXT}")))
}

fn normalize_setup_script(script: Option<String>) -> Option<String> {
    match script {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
        None => None,
    }
}

#[tauri::command]
pub(crate) async fn read_agent_md(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AgentMdResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "read_agent_md",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?;
    let root = PathBuf::from(&entry.path);
    read_agent_md_inner(&root)
}

#[tauri::command]
pub(crate) async fn write_agent_md(
    workspace_id: String,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "write_agent_md",
            json!({ "workspaceId": workspace_id, "content": content }),
        )
        .await?;
        return Ok(());
    }

    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?;
    let root = PathBuf::from(&entry.path);
    write_agent_md_inner(&root, &content)
}

#[tauri::command]
pub(crate) async fn read_workspace_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceFileResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "read_workspace_file",
            json!({ "workspaceId": workspace_id, "path": path }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?;
    let root = PathBuf::from(&entry.path);
    read_workspace_file_inner(&root, &path)
}


#[tauri::command]
pub(crate) async fn list_workspaces(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<WorkspaceInfo>, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(&*state, app, "list_workspaces", json!({})).await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspaces = state.workspaces.lock().await;
    let sessions = state.sessions.lock().await;
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
    Ok(result)
}


#[tauri::command]
pub(crate) async fn is_workspace_path_dir(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<bool, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "is_workspace_path_dir",
            json!({ "path": path }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }
    Ok(PathBuf::from(&path).is_dir())
}


#[tauri::command]
pub(crate) async fn add_workspace(
    path: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let path = remote_backend::normalize_path_for_remote(path);
        let codex_bin = codex_bin.map(remote_backend::normalize_path_for_remote);
        let response = remote_backend::call_remote(
            &*state,
            app,
            "add_workspace",
            json!({ "path": path, "codex_bin": codex_bin }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    if !PathBuf::from(&path).is_dir() {
        return Err("Workspace path must be a folder.".to_string());
    }

    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Workspace")
        .to_string();
    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: path.clone(),
        codex_bin,
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings::default(),
    };

    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session =
        spawn_workspace_session(entry.clone(), default_bin, codex_args, app, codex_home).await?;

    if let Err(error) = {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)
    } {
        {
            let mut workspaces = state.workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
        return Err(error);
    }

    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}


#[tauri::command]
pub(crate) async fn add_clone(
    source_workspace_id: String,
    copy_name: String,
    copies_folder: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    let copy_name = copy_name.trim().to_string();
    if copy_name.is_empty() {
        return Err("Copy name is required.".to_string());
    }

    let copies_folder = copies_folder.trim().to_string();
    if copies_folder.is_empty() {
        return Err("Copies folder is required.".to_string());
    }
    let copies_folder_path = PathBuf::from(&copies_folder);
    std::fs::create_dir_all(&copies_folder_path)
        .map_err(|e| format!("Failed to create copies folder: {e}"))?;
    if !copies_folder_path.is_dir() {
        return Err("Copies folder must be a directory.".to_string());
    }

    let (source_entry, inherited_group_id) = {
        let workspaces = state.workspaces.lock().await;
        let source_entry = workspaces
            .get(&source_workspace_id)
            .cloned()
            .ok_or("source workspace not found")?;
        let inherited_group_id = if source_entry.kind.is_worktree() {
            source_entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .and_then(|parent| parent.settings.group_id.clone())
        } else {
            source_entry.settings.group_id.clone()
        };
        (source_entry, inherited_group_id)
    };

    let destination_path = build_clone_destination_path(&copies_folder_path, &copy_name);
    let destination_path_string = destination_path.to_string_lossy().to_string();

    if let Err(error) = run_git_command(
        &copies_folder_path,
        &["clone", &source_entry.path, &destination_path_string],
    )
    .await
    {
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    if let Some(origin_url) = git_get_origin_url(&PathBuf::from(&source_entry.path)).await {
        let _ = run_git_command(
            &destination_path,
            &["remote", "set-url", "origin", &origin_url],
        )
        .await;
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: copy_name.clone(),
        path: destination_path_string,
        codex_bin: source_entry.codex_bin.clone(),
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings {
            group_id: inherited_group_id,
            ..WorkspaceSettings::default()
        },
    };

    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = match spawn_workspace_session(
        entry.clone(),
        default_bin,
        codex_args,
        app,
        codex_home,
    )
    .await
    {
        Ok(session) => session,
        Err(error) => {
            let _ = tokio::fs::remove_dir_all(&destination_path).await;
            return Err(error);
        }
    };

    if let Err(error) = {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)
    } {
        {
            let mut workspaces = state.workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}


#[tauri::command]
pub(crate) async fn add_worktree(
    parent_id: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "add_worktree",
            json!({ "parentId": parent_id, "branch": branch }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let branch = branch.trim();
    if branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }

    let parent_entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&parent_id)
            .cloned()
            .ok_or("parent workspace not found")?
    };

    if parent_entry.kind.is_worktree() {
        return Err("Cannot create a worktree from another worktree.".to_string());
    }

    let worktree_root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join("worktrees")
        .join(&parent_entry.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

    let safe_name = sanitize_worktree_name(branch);
    let worktree_path = unique_worktree_path(&worktree_root, &safe_name);
    let worktree_path_string = worktree_path.to_string_lossy().to_string();

    let branch_exists = git_branch_exists(&PathBuf::from(&parent_entry.path), branch).await?;
    if branch_exists {
        run_git_command(
            &PathBuf::from(&parent_entry.path),
            &["worktree", "add", &worktree_path_string, branch],
        )
        .await?;
    } else {
        run_git_command(
            &PathBuf::from(&parent_entry.path),
            &["worktree", "add", "-b", branch, &worktree_path_string],
        )
        .await?;
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: branch.to_string(),
        path: worktree_path_string,
        codex_bin: parent_entry.codex_bin.clone(),
        kind: WorkspaceKind::Worktree,
        parent_id: Some(parent_entry.id.clone()),
        worktree: Some(WorktreeInfo {
            branch: branch.to_string(),
        }),
        settings: WorkspaceSettings {
            worktree_setup_script: normalize_setup_script(
                parent_entry.settings.worktree_setup_script.clone(),
            ),
            ..WorkspaceSettings::default()
        },
    };

    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, Some(&parent_entry), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, Some(&parent_entry));
    let session =
        spawn_workspace_session(entry.clone(), default_bin, codex_args, app, codex_home).await?;
    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }
    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn worktree_setup_status(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorktreeSetupStatus, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "worktree_setup_status",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };

    let script = normalize_setup_script(entry.settings.worktree_setup_script.clone());
    let marker_exists = if entry.kind.is_worktree() {
        worktree_setup_marker_path(&app, &entry.id)
            .map(|path| path.exists())
            .unwrap_or(false)
    } else {
        false
    };
    let should_run = entry.kind.is_worktree() && script.is_some() && !marker_exists;

    Ok(WorktreeSetupStatus { should_run, script })
}

#[tauri::command]
pub(crate) async fn worktree_setup_mark_ran(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "worktree_setup_mark_ran",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return Ok(());
    }

    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };
    if !entry.kind.is_worktree() {
        return Err("Not a worktree workspace.".to_string());
    }
    let marker_path = worktree_setup_marker_path(&app, &entry.id)?;
    if let Some(parent) = marker_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to prepare worktree marker directory: {err}"))?;
    }
    let ran_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    std::fs::write(&marker_path, format!("ran_at={ran_at}\n"))
        .map_err(|err| format!("Failed to write worktree setup marker: {err}"))?;
    Ok(())
}


#[tauri::command]
pub(crate) async fn remove_workspace(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(&*state, app, "remove_workspace", json!({ "id": id })).await?;
        return Ok(());
    }

    let (entry, child_worktrees) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or("workspace not found")?;
        if entry.kind.is_worktree() {
            return Err("Use remove_worktree for worktree agents.".to_string());
        }
        let children = workspaces
            .values()
            .filter(|workspace| workspace.parent_id.as_deref() == Some(&id))
            .cloned()
            .collect::<Vec<_>>();
        (entry, children)
    };

    let parent_path = PathBuf::from(&entry.path);
    for child in &child_worktrees {
        if let Some(session) = state.sessions.lock().await.remove(&child.id) {
            let mut child_process = session.child.lock().await;
            let _ = child_process.kill().await;
        }
        let child_path = PathBuf::from(&child.path);
        if child_path.exists() {
            if let Err(error) = run_git_command(
                &parent_path,
                &["worktree", "remove", "--force", &child.path],
            )
            .await
            {
                if is_missing_worktree_error(&error) {
                    if child_path.exists() {
                        std::fs::remove_dir_all(&child_path).map_err(|err| {
                            format!("Failed to remove worktree folder: {err}")
                        })?;
                    }
                } else {
                    return Err(error);
                }
            }
        }
    }
    let _ = run_git_command(&parent_path, &["worktree", "prune", "--expire", "now"]).await;

    if let Some(session) = state.sessions.lock().await.remove(&id) {
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
    }

    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.remove(&id);
        for child in child_worktrees {
            workspaces.remove(&child.id);
        }
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }

    Ok(())
}


#[tauri::command]
pub(crate) async fn remove_worktree(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(&*state, app, "remove_worktree", json!({ "id": id })).await?;
        return Ok(());
    }

    let (entry, parent) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or("workspace not found")?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or("worktree parent not found")?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or("worktree parent not found")?;
        (entry, parent)
    };

    if let Some(session) = state.sessions.lock().await.remove(&entry.id) {
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
    }

    let parent_path = PathBuf::from(&parent.path);
    let entry_path = PathBuf::from(&entry.path);
    if entry_path.exists() {
        if let Err(error) = run_git_command(
            &parent_path,
            &["worktree", "remove", "--force", &entry.path],
        )
        .await
        {
            if is_missing_worktree_error(&error) {
                if entry_path.exists() {
                    std::fs::remove_dir_all(&entry_path).map_err(|err| {
                        format!("Failed to remove worktree folder: {err}")
                    })?;
                }
            } else {
                return Err(error);
            }
        }
    }
    let _ = run_git_command(&parent_path, &["worktree", "prune", "--expire", "now"]).await;

    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.remove(&entry.id);
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }

    Ok(())
}


#[tauri::command]
pub(crate) async fn rename_worktree(
    id: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "rename_worktree",
            json!({ "id": id, "branch": branch }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required.".to_string());
    }

    let (entry, parent) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or("workspace not found")?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or("worktree parent not found")?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or("worktree parent not found")?;
        (entry, parent)
    };

    let old_branch = entry
        .worktree
        .as_ref()
        .map(|worktree| worktree.branch.clone())
        .ok_or("worktree metadata missing")?;
    if old_branch == trimmed {
        return Err("Branch name is unchanged.".to_string());
    }

    let parent_root = resolve_git_root(&parent)?;
    let (final_branch, _was_suffixed) =
        unique_branch_name(&parent_root, trimmed, None).await?;
    if final_branch == old_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    run_git_command(
        &parent_root,
        &["branch", "-m", &old_branch, &final_branch],
    )
    .await?;

    let worktree_root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join("worktrees")
        .join(&parent.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

    let safe_name = sanitize_worktree_name(&final_branch);
    let current_path = PathBuf::from(&entry.path);
    let next_path =
        unique_worktree_path_for_rename(&worktree_root, &safe_name, &current_path)?;
    let next_path_string = next_path.to_string_lossy().to_string();
    if next_path_string != entry.path {
        if let Err(error) = run_git_command(
            &parent_root,
            &["worktree", "move", &entry.path, &next_path_string],
        )
        .await
        {
            let _ = run_git_command(
                &parent_root,
                &["branch", "-m", &final_branch, &old_branch],
            )
            .await;
            return Err(error);
        }
    }

    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry = match workspaces.get_mut(&id) {
            Some(entry) => entry,
            None => return Err("workspace not found".to_string()),
        };
        entry.name = final_branch.clone();
        entry.path = next_path_string.clone();
        match entry.worktree.as_mut() {
            Some(worktree) => {
                worktree.branch = final_branch.clone();
            }
            None => {
                entry.worktree = Some(WorktreeInfo {
                    branch: final_branch.clone(),
                });
            }
        }
        let snapshot = entry.clone();
        let list: Vec<_> = workspaces.values().cloned().collect();
        (snapshot, list)
    };
    write_workspaces(&state.storage_path, &list)?;

    let was_connected = state.sessions.lock().await.contains_key(&entry_snapshot.id);
    if was_connected {
        if let Some(session) = state.sessions.lock().await.remove(&entry_snapshot.id) {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
        }
        let (default_bin, codex_args) = {
            let settings = state.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(&entry_snapshot, Some(&parent), Some(&settings)),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, Some(&parent));
        match spawn_workspace_session(
            entry_snapshot.clone(),
            default_bin,
            codex_args,
            app,
            codex_home,
        )
        .await
        {
            Ok(session) => {
                state
                    .sessions
                    .lock()
                    .await
                    .insert(entry_snapshot.id.clone(), session);
            }
            Err(error) => {
                eprintln!(
                    "rename_worktree: respawn failed for {} after rename: {error}",
                    entry_snapshot.id
                );
            }
        }
    }

    let connected = state.sessions.lock().await.contains_key(&entry_snapshot.id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}


#[tauri::command]
pub(crate) async fn rename_worktree_upstream(
    id: String,
    old_branch: String,
    new_branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "rename_worktree_upstream",
            json!({ "id": id, "oldBranch": old_branch, "newBranch": new_branch }),
        )
        .await?;
        return Ok(());
    }

    let old_branch = old_branch.trim();
    let new_branch = new_branch.trim();
    if old_branch.is_empty() || new_branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    if old_branch == new_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    let (_entry, parent) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or("workspace not found")?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or("worktree parent not found")?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or("worktree parent not found")?;
        (entry, parent)
    };

    let parent_root = resolve_git_root(&parent)?;
    if !git_branch_exists(&parent_root, new_branch).await? {
        return Err("Local branch not found.".to_string());
    }

    let remote_for_old = git_find_remote_for_branch(&parent_root, old_branch).await?;
    let remote_name = match remote_for_old.as_ref() {
        Some(remote) => remote.clone(),
        None => {
            if git_remote_exists(&parent_root, "origin").await? {
                "origin".to_string()
            } else {
                return Err("No git remote configured for this worktree.".to_string());
            }
        }
    };

    if git_remote_branch_exists(&parent_root, &remote_name, new_branch).await? {
        return Err("Remote branch already exists.".to_string());
    }

    if remote_for_old.is_some() {
        run_git_command(
            &parent_root,
            &[
                "push",
                &remote_name,
                &format!("{new_branch}:{new_branch}"),
            ],
        )
        .await?;
        run_git_command(
            &parent_root,
            &["push", &remote_name, &format!(":{old_branch}")],
        )
        .await?;
    } else {
        run_git_command(&parent_root, &["push", &remote_name, new_branch]).await?;
    }

    run_git_command(
        &parent_root,
        &[
            "branch",
            "--set-upstream-to",
            &format!("{remote_name}/{new_branch}"),
            new_branch,
        ],
    )
    .await?;

    Ok(())
}


#[tauri::command]
pub(crate) async fn apply_worktree_changes(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (entry, parent) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or("worktree parent not found")?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or("worktree parent not found")?;
        (entry, parent)
    };

    let worktree_root = resolve_git_root(&entry)?;
    let parent_root = resolve_git_root(&parent)?;

    let parent_status =
        run_git_command_bytes(&parent_root, &["status", "--porcelain"]).await?;
    if !String::from_utf8_lossy(&parent_status).trim().is_empty() {
        return Err(
            "Your current branch has uncommitted changes. Please commit, stash, or discard them before applying worktree changes."
                .to_string(),
        );
    }

    let mut patch: Vec<u8> = Vec::new();
    let staged_patch =
        run_git_diff(&worktree_root, &["diff", "--binary", "--no-color", "--cached"]).await?;
    patch.extend_from_slice(&staged_patch);
    let unstaged_patch =
        run_git_diff(&worktree_root, &["diff", "--binary", "--no-color"]).await?;
    patch.extend_from_slice(&unstaged_patch);

    let untracked_output = run_git_command_bytes(
        &worktree_root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )
    .await?;
    for raw_path in untracked_output.split(|byte| *byte == 0) {
        if raw_path.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw_path).to_string();
        let diff = run_git_diff(
            &worktree_root,
            &[
                "diff",
                "--binary",
                "--no-color",
                "--no-index",
                "--",
                null_device_path(),
                &path,
            ],
        )
        .await?;
        patch.extend_from_slice(&diff);
    }

    if String::from_utf8_lossy(&patch).trim().is_empty() {
        return Err("No changes to apply.".to_string());
    }

    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut child = Command::new(git_bin)
        .args(["apply", "--3way", "--whitespace=nowarn", "-"])
        .current_dir(&parent_root)
        .env("PATH", git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&patch)
            .await
            .map_err(|e| format!("Failed to write git apply input: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        return Err("Git apply failed.".to_string());
    }

    if detail.contains("Applied patch to") {
        if detail.contains("with conflicts") {
            return Err(
                "Applied with conflicts. Resolve conflicts in the parent repo before retrying."
                    .to_string(),
            );
        }
        return Err(
            "Patch applied partially. Resolve changes in the parent repo before retrying."
                .to_string(),
        );
    }

    Err(detail.to_string())
}


#[tauri::command]
pub(crate) async fn update_workspace_settings(
    id: String,
    settings: WorkspaceSettings,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "update_workspace_settings",
            json!({ "id": id, "settings": settings }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let mut settings = settings;
    settings.worktree_setup_script = normalize_setup_script(settings.worktree_setup_script);

    let (
        previous_entry,
        entry_snapshot,
        parent_entry,
        previous_codex_home,
        previous_codex_args,
        previous_worktree_setup_script,
        child_entries,
    ) = {
        let mut workspaces = state.workspaces.lock().await;
        let previous_entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        let previous_codex_home = previous_entry.settings.codex_home.clone();
        let previous_codex_args = previous_entry.settings.codex_args.clone();
        let previous_worktree_setup_script = previous_entry.settings.worktree_setup_script.clone();
        let entry_snapshot = apply_workspace_settings_update(&mut workspaces, &id, settings)?;
        let parent_entry = entry_snapshot
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id))
            .cloned();
        let child_entries = workspaces
            .values()
            .filter(|entry| entry.parent_id.as_deref() == Some(&id))
            .cloned()
            .collect::<Vec<_>>();
        (
            previous_entry,
            entry_snapshot,
            parent_entry,
            previous_codex_home,
            previous_codex_args,
            previous_worktree_setup_script,
            child_entries,
        )
    };

    let codex_home_changed = previous_codex_home != entry_snapshot.settings.codex_home;
    let codex_args_changed = previous_codex_args != entry_snapshot.settings.codex_args;
    let worktree_setup_script_changed =
        previous_worktree_setup_script != entry_snapshot.settings.worktree_setup_script;
    let connected = state.sessions.lock().await.contains_key(&id);
    if connected && (codex_home_changed || codex_args_changed) {
        let rollback_entry = previous_entry.clone();
        let (default_bin, codex_args) = {
            let settings = state.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(&entry_snapshot, parent_entry.as_ref(), Some(&settings)),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, parent_entry.as_ref());
        let new_session = match spawn_workspace_session(
            entry_snapshot.clone(),
            default_bin,
            codex_args,
            app.clone(),
            codex_home,
        )
        .await
        {
            Ok(session) => session,
            Err(error) => {
                let mut workspaces = state.workspaces.lock().await;
                workspaces.insert(rollback_entry.id.clone(), rollback_entry);
                return Err(error);
            }
        };
        if let Some(old_session) = state
            .sessions
            .lock()
            .await
            .insert(entry_snapshot.id.clone(), new_session)
        {
            let mut child = old_session.child.lock().await;
            let _ = child.kill().await;
        }
    }
    if codex_home_changed || codex_args_changed {
        let app_settings = state.app_settings.lock().await.clone();
        let default_bin = app_settings.codex_bin.clone();
        for child in &child_entries {
            let connected = state.sessions.lock().await.contains_key(&child.id);
            if !connected {
                continue;
            }
            let previous_child_home = resolve_workspace_codex_home(&child, Some(&previous_entry));
            let next_child_home = resolve_workspace_codex_home(&child, Some(&entry_snapshot));
            let previous_child_args =
                resolve_workspace_codex_args(&child, Some(&previous_entry), Some(&app_settings));
            let next_child_args =
                resolve_workspace_codex_args(&child, Some(&entry_snapshot), Some(&app_settings));
            if previous_child_home == next_child_home && previous_child_args == next_child_args {
                continue;
            }
            let new_session = match spawn_workspace_session(
                child.clone(),
                default_bin.clone(),
                next_child_args,
                app.clone(),
                next_child_home,
            )
            .await
            {
                Ok(session) => session,
                Err(error) => {
                    eprintln!(
                        "update_workspace_settings: respawn failed for worktree {} after parent override change: {error}",
                        child.id
                    );
                    continue;
                }
            };
            if let Some(old_session) = state
                .sessions
                .lock()
                .await
                .insert(child.id.clone(), new_session)
            {
                let mut child = old_session.child.lock().await;
                let _ = child.kill().await;
            }
        }
    }
    if worktree_setup_script_changed && !entry_snapshot.kind.is_worktree() {
        let child_ids = child_entries
            .iter()
            .map(|child| child.id.clone())
            .collect::<Vec<_>>();
        if !child_ids.is_empty() {
            let mut workspaces = state.workspaces.lock().await;
            for child_id in child_ids {
                if let Some(child) = workspaces.get_mut(&child_id) {
                    child.settings.worktree_setup_script =
                        entry_snapshot.settings.worktree_setup_script.clone();
                }
            }
        }
    }
    let list: Vec<_> = {
        let workspaces = state.workspaces.lock().await;
        workspaces.values().cloned().collect()
    };
    write_workspaces(&state.storage_path, &list)?;
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}


#[tauri::command]
pub(crate) async fn update_workspace_codex_bin(
    id: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let codex_bin = codex_bin.map(remote_backend::normalize_path_for_remote);
        let response = remote_backend::call_remote(
            &*state,
            app,
            "update_workspace_codex_bin",
            json!({ "id": id, "codex_bin": codex_bin }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry_snapshot = match workspaces.get_mut(&id) {
            Some(entry) => {
                entry.codex_bin = codex_bin.clone();
                entry.clone()
            }
            None => return Err("workspace not found".to_string()),
        };
        let list: Vec<_> = workspaces.values().cloned().collect();
        (entry_snapshot, list)
    };
    write_workspaces(&state.storage_path, &list)?;

    let connected = state.sessions.lock().await.contains_key(&id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}


#[tauri::command]
pub(crate) async fn connect_workspace(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(&*state, app, "connect_workspace", json!({ "id": id }))
            .await?;
        return Ok(());
    }

    let (entry, parent_entry) = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&id)
            .cloned()
            .map(|entry| {
                let parent_entry = entry
                    .parent_id
                    .as_ref()
                    .and_then(|parent_id| workspaces.get(parent_id))
                    .cloned();
                (entry, parent_entry)
            })
            .ok_or("workspace not found")?
    };

    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    let session =
        spawn_workspace_session(entry.clone(), default_bin, codex_args, app, codex_home).await?;
    state.sessions.lock().await.insert(entry.id, session);
    Ok(())
}


#[tauri::command]
pub(crate) async fn list_workspace_files(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<String>, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "list_workspace_files",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?;
    let root = PathBuf::from(&entry.path);
    Ok(list_workspace_files_inner(&root, usize::MAX))
}


#[tauri::command]
pub(crate) async fn open_workspace_in(
    path: String,
    app: Option<String>,
    args: Vec<String>,
    command: Option<String>,
) -> Result<(), String> {
    let target_label = command
        .as_ref()
        .map(|value| format!("command `{value}`"))
        .or_else(|| app.as_ref().map(|value| format!("app `{value}`")))
        .unwrap_or_else(|| "target".to_string());

    let status = if let Some(command) = command {
        let mut cmd = std::process::Command::new(command);
        cmd.args(args).arg(path);
        cmd.status()
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else if let Some(app) = app {
        let mut cmd = std::process::Command::new("open");
        cmd.arg("-a").arg(app).arg(path);
        if !args.is_empty() {
            cmd.arg("--args").args(args);
        }
        cmd.status()
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else {
        return Err("Missing app or command".to_string());
    };

    if status.success() {
        return Ok(());
    }

    let exit_detail = status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated by signal".to_string());
    Err(format!(
        "Failed to open app ({target_label} returned {exit_detail})."
    ))
}


#[tauri::command]
pub(crate) async fn get_open_app_icon(app_name: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let trimmed = app_name.trim().to_string();
        if trimmed.is_empty() {
            return Ok(None);
        }
        let result = tokio::task::spawn_blocking(move || get_open_app_icon_inner(&trimmed))
            .await
            .map_err(|err| err.to_string())?;
        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_name;
        Ok(None)
    }
}
