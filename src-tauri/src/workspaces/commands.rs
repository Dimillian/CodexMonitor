use std::path::PathBuf;

#[cfg(target_os = "windows")]
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

#[cfg(target_os = "macos")]
use super::macos::get_open_app_icon_inner;
use super::files::{list_workspace_files_inner, read_workspace_file_inner, WorkspaceFileResponse};
use super::git::{
    git_branch_exists, git_find_remote_for_branch, git_get_origin_url, git_remote_branch_exists,
    git_remote_exists, is_missing_worktree_error, run_git_command, run_git_command_bytes,
    run_git_command_owned, run_git_diff, unique_branch_name,
};
use super::settings::apply_workspace_settings_update;
use super::worktree::{
    build_clone_destination_path, null_device_path, sanitize_worktree_name, unique_worktree_path,
    unique_worktree_path_for_rename,
};

use crate::backend::app_server::WorkspaceSession;
use crate::codex::spawn_workspace_session;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_workspace_codex_home;
use crate::git_utils::resolve_git_root;
use crate::remote_backend;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
use crate::shared::workspaces_core;
use crate::state::AppState;
use crate::storage::write_workspaces;
use crate::types::{
    WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeSetupStatus,
};
use crate::utils::{git_env_path, resolve_git_binary};

fn spawn_with_app(
    app: &AppHandle,
    entry: WorkspaceEntry,
    default_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
) -> impl std::future::Future<Output = Result<Arc<WorkspaceSession>, String>> {
    spawn_workspace_session(entry, default_bin, codex_args, app.clone(), codex_home)
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

    workspaces_core::read_workspace_file_core(
        &state.workspaces,
        &workspace_id,
        &path,
        |root, rel_path| read_workspace_file_inner(root, rel_path),
    )
    .await
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

    Ok(workspaces_core::list_workspaces_core(&state.workspaces, &state.sessions).await)
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
    Ok(workspaces_core::is_workspace_path_dir_core(&path))
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

    workspaces_core::add_workspace_core(
        path,
        codex_bin,
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        &state.storage_path,
        |entry, default_bin, codex_args, codex_home| {
            spawn_with_app(&app, entry, default_bin, codex_args, codex_home)
        },
    )
    .await
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
        kill_child_process_tree(&mut child).await;
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
    name: Option<String>,
    copy_agents_md: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    let copy_agents_md = copy_agents_md.unwrap_or(true);
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "add_worktree",
            json!({
                "parentId": parent_id,
                "branch": branch,
                "name": name,
                "copyAgentsMd": copy_agents_md
            }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;

    workspaces_core::add_worktree_core(
        parent_id,
        branch,
        name,
        copy_agents_md,
        &data_dir,
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        &state.storage_path,
        |value| sanitize_worktree_name(value),
        |root, name| Ok(unique_worktree_path(root, name)),
        |root, branch| {
            let root = root.clone();
            let branch = branch.to_string();
            async move { git_branch_exists(&root, &branch).await }
        },
        None::<fn(&PathBuf, &str) -> std::future::Ready<Result<Option<String>, String>>>,
        |root, args| {
            workspaces_core::run_git_command_unit(root, args, |repo, args_owned| {
                run_git_command_owned(repo, args_owned)
            })
        },
        |entry, default_bin, codex_args, codex_home| {
            spawn_with_app(&app, entry, default_bin, codex_args, codex_home)
        },
    )
    .await
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

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;
    workspaces_core::worktree_setup_status_core(&state.workspaces, &workspace_id, &data_dir).await
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

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;
    workspaces_core::worktree_setup_mark_ran_core(&state.workspaces, &workspace_id, &data_dir)
        .await
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

    workspaces_core::remove_workspace_core(
        id,
        &state.workspaces,
        &state.sessions,
        &state.storage_path,
        |root, args| {
            workspaces_core::run_git_command_unit(root, args, |repo, args_owned| {
                run_git_command_owned(repo, args_owned)
            })
        },
        |error| is_missing_worktree_error(error),
        |path| {
            std::fs::remove_dir_all(path)
                .map_err(|err| format!("Failed to remove worktree folder: {err}"))
        },
        true,
        true,
    )
    .await
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

    workspaces_core::remove_worktree_core(
        id,
        &state.workspaces,
        &state.sessions,
        &state.storage_path,
        |root, args| {
            workspaces_core::run_git_command_unit(root, args, |repo, args_owned| {
                run_git_command_owned(repo, args_owned)
            })
        },
        |error| is_missing_worktree_error(error),
        |path| {
            std::fs::remove_dir_all(path)
                .map_err(|err| format!("Failed to remove worktree folder: {err}"))
        },
    )
    .await
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

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;

    workspaces_core::rename_worktree_core(
        id,
        branch,
        &data_dir,
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        &state.storage_path,
        |entry| resolve_git_root(entry),
        |root, name| {
            let root = root.clone();
            let name = name.to_string();
            async move {
                unique_branch_name(&root, &name, None)
                    .await
                    .map(|(branch, _was_suffixed)| branch)
            }
        },
        |value| sanitize_worktree_name(value),
        |root, name, current| unique_worktree_path_for_rename(root, name, current),
        |root, args| {
            workspaces_core::run_git_command_unit(root, args, |repo, args_owned| {
                run_git_command_owned(repo, args_owned)
            })
        },
        |entry, default_bin, codex_args, codex_home| {
            spawn_with_app(&app, entry, default_bin, codex_args, codex_home)
        },
    )
    .await
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

    workspaces_core::rename_worktree_upstream_core(
        id,
        old_branch,
        new_branch,
        &state.workspaces,
        |entry| resolve_git_root(entry),
        |root, branch| {
            let root = root.clone();
            let branch = branch.to_string();
            async move { git_branch_exists(&root, &branch).await }
        },
        |root, branch| {
            let root = root.clone();
            let branch = branch.to_string();
            async move { git_find_remote_for_branch(&root, &branch).await }
        },
        |root, remote| {
            let root = root.clone();
            let remote = remote.to_string();
            async move { git_remote_exists(&root, &remote).await }
        },
        |root, remote, branch| {
            let root = root.clone();
            let remote = remote.to_string();
            let branch = branch.to_string();
            async move { git_remote_branch_exists(&root, &remote, &branch).await }
        },
        |root, args| {
            workspaces_core::run_git_command_unit(root, args, |repo, args_owned| {
                run_git_command_owned(repo, args_owned)
            })
        },
    )
    .await
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
    let mut child = tokio_command(git_bin)
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

    workspaces_core::update_workspace_settings_core(
        id,
        settings,
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        &state.storage_path,
        |workspaces, workspace_id, next_settings| {
            apply_workspace_settings_update(workspaces, workspace_id, next_settings)
        },
        |entry, default_bin, codex_args, codex_home| {
            spawn_with_app(&app, entry, default_bin, codex_args, codex_home)
        },
    )
    .await
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

    workspaces_core::update_workspace_codex_bin_core(
        id,
        codex_bin,
        &state.workspaces,
        &state.sessions,
        &state.storage_path,
    )
    .await
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

    workspaces_core::connect_workspace_core(
        id,
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        |entry, default_bin, codex_args, codex_home| {
            spawn_with_app(&app, entry, default_bin, codex_args, codex_home)
        },
    )
    .await
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

    workspaces_core::list_workspace_files_core(&state.workspaces, &workspace_id, |root| {
        list_workspace_files_inner(root, usize::MAX)
    })
    .await
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
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "windows")]
        let mut cmd = {
            let resolved = resolve_windows_executable(trimmed, None);
            let resolved_path = resolved
                .as_deref()
                .unwrap_or_else(|| Path::new(trimmed));
            let ext = resolved_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase());

            if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
                let mut cmd = tokio_command("cmd");
                let mut command_args = args.clone();
                command_args.push(path.clone());
                let command_line = build_cmd_c_command(resolved_path, &command_args)?;
                cmd.arg("/D");
                cmd.arg("/S");
                cmd.arg("/C");
                cmd.arg(command_line);
                cmd
            } else {
                let mut cmd = tokio_command(resolved_path);
                cmd.args(&args).arg(&path);
                cmd
            }
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.status()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else if let Some(app) = app {
        let trimmed = app.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "macos")]
        let mut cmd = {
            let mut cmd = tokio_command("open");
            cmd.arg("-a").arg(trimmed).arg(&path);
            if !args.is_empty() {
                cmd.arg("--args").args(&args);
            }
            cmd
        };

        #[cfg(not(target_os = "macos"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.status()
            .await
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
