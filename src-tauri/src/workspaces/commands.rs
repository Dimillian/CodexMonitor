use std::path::PathBuf;

use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, Manager, State};

use super::files::{list_workspace_files_inner, read_workspace_file_inner, WorkspaceFileResponse};
use super::git::{
    git_branch_exists, git_find_remote_for_branch, git_remote_branch_exists, git_remote_exists,
    is_missing_worktree_error, run_git_command_owned, unique_branch_name,
};
#[cfg(target_os = "macos")]
use super::macos::get_open_app_icon_inner;
use super::settings::apply_workspace_settings_update;
use super::worktree::{
    sanitize_worktree_name, unique_worktree_path, unique_worktree_path_for_rename,
};

use crate::backend::app_server::WorkspaceSession;
use crate::codex::spawn_workspace_session;
use crate::git_utils::resolve_git_root;
use crate::remote_backend;
use crate::shared::workspaces_core;
use crate::state::AppState;
use crate::types::{WorkspaceEntry, WorkspaceInfo, WorkspaceSettings, WorktreeSetupStatus};

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
        let response =
            remote_backend::call_remote(&*state, app, "list_workspaces", json!({})).await?;
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
    workspaces_core::add_clone_core(
        source_workspace_id,
        copy_name,
        copies_folder,
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
    workspaces_core::worktree_setup_mark_ran_core(&state.workspaces, &workspace_id, &data_dir).await
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
    workspaces_core::apply_worktree_changes_core(&state.workspaces, workspace_id).await
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
        remote_backend::call_remote(&*state, app, "connect_workspace", json!({ "id": id })).await?;
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
    workspaces_core::open_workspace_in_core(path, app, args, command).await
}

#[tauri::command]
pub(crate) async fn get_open_app_icon(app_name: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        return workspaces_core::get_open_app_icon_core(app_name, |name| {
            get_open_app_icon_inner(name)
        })
        .await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        workspaces_core::get_open_app_icon_core(app_name, |_name| None).await
    }
}
