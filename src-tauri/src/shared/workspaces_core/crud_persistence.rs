use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_workspace_codex_home;
use crate::shared::process_core::kill_child_process_tree;
use crate::shared::{git_core, worktree_core};
use crate::storage::write_workspaces;
use crate::types::{AppSettings, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings};

use super::connect::kill_session_by_id;
use super::helpers::normalize_setup_script;

pub(crate) async fn add_workspace_core<F, Fut>(
    path: String,
    codex_bin: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    spawn_session: F,
) -> Result<WorkspaceInfo, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
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
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = spawn_session(entry.clone(), default_bin, codex_args, codex_home).await?;

    if let Err(error) = {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)
    } {
        {
            let mut workspaces = workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        kill_child_process_tree(&mut child).await;
        return Err(error);
    }

    sessions.lock().await.insert(entry.id.clone(), session);

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

pub(crate) async fn add_clone_core<F, Fut>(
    source_workspace_id: String,
    copy_name: String,
    copies_folder: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    spawn_session: F,
) -> Result<WorkspaceInfo, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
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
        let workspaces = workspaces.lock().await;
        let source_entry = workspaces
            .get(&source_workspace_id)
            .cloned()
            .ok_or_else(|| "source workspace not found".to_string())?;
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

    let destination_path =
        worktree_core::build_clone_destination_path(&copies_folder_path, &copy_name);
    let destination_path_string = destination_path.to_string_lossy().to_string();

    if let Err(error) = git_core::run_git_command(
        &copies_folder_path,
        &["clone", &source_entry.path, &destination_path_string],
    )
    .await
    {
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    if let Some(origin_url) = git_core::git_get_origin_url(&PathBuf::from(&source_entry.path)).await
    {
        let _ = git_core::run_git_command(
            &destination_path,
            &["remote", "set-url", "origin", &origin_url],
        )
        .await;
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: copy_name,
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
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = match spawn_session(entry.clone(), default_bin, codex_args, codex_home).await {
        Ok(session) => session,
        Err(error) => {
            let _ = tokio::fs::remove_dir_all(&destination_path).await;
            return Err(error);
        }
    };

    if let Err(error) = {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)
    } {
        {
            let mut workspaces = workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        kill_child_process_tree(&mut child).await;
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    sessions.lock().await.insert(entry.id.clone(), session);

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

pub(crate) async fn remove_workspace_core<FRunGit, FutRunGit, FIsMissing, FRemoveDirAll>(
    id: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
    run_git_command: FRunGit,
    is_missing_worktree_error: FIsMissing,
    remove_dir_all: FRemoveDirAll,
    require_all_children_removed_to_remove_parent: bool,
    continue_on_child_error: bool,
) -> Result<(), String>
where
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
    FIsMissing: Fn(&str) -> bool,
    FRemoveDirAll: Fn(&PathBuf) -> Result<(), String>,
{
    let (entry, child_worktrees) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
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

    let repo_path = PathBuf::from(&entry.path);
    let mut removed_child_ids = Vec::new();
    let mut failures: Vec<(String, String)> = Vec::new();

    for child in &child_worktrees {
        kill_session_by_id(sessions, &child.id).await;

        let child_path = PathBuf::from(&child.path);
        if child_path.exists() {
            if let Err(error) =
                run_git_command(&repo_path, &["worktree", "remove", "--force", &child.path]).await
            {
                if is_missing_worktree_error(&error) {
                    if child_path.exists() {
                        if let Err(fs_error) = remove_dir_all(&child_path) {
                            if continue_on_child_error {
                                failures.push((child.id.clone(), fs_error));
                                continue;
                            }
                            return Err(fs_error);
                        }
                    }
                } else {
                    if continue_on_child_error {
                        failures.push((child.id.clone(), error));
                        continue;
                    }
                    return Err(error);
                }
            }
        }
        removed_child_ids.push(child.id.clone());
    }

    let _ = run_git_command(&repo_path, &["worktree", "prune", "--expire", "now"]).await;

    let mut ids_to_remove = removed_child_ids;
    if failures.is_empty() || !require_all_children_removed_to_remove_parent {
        kill_session_by_id(sessions, &id).await;
        ids_to_remove.push(id.clone());
    }

    {
        let mut workspaces = workspaces.lock().await;
        for workspace_id in ids_to_remove {
            workspaces.remove(&workspace_id);
        }
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
    }

    if failures.is_empty() {
        return Ok(());
    }

    if require_all_children_removed_to_remove_parent {
        let mut message =
            "Failed to remove one or more worktrees; parent workspace was not removed.".to_string();
        for (child_id, error) in failures {
            message.push_str(&format!("\n- {child_id}: {error}"));
        }
        return Err(message);
    }

    Ok(())
}

pub(crate) async fn update_workspace_settings_core<FApplySettings, FSpawn, FutSpawn>(
    id: String,
    mut settings: WorkspaceSettings,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    apply_settings_update: FApplySettings,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FApplySettings: Fn(
        &mut HashMap<String, WorkspaceEntry>,
        &str,
        WorkspaceSettings,
    ) -> Result<WorkspaceEntry, String>,
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
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
        let mut workspaces = workspaces.lock().await;
        let previous_entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        let previous_codex_home = previous_entry.settings.codex_home.clone();
        let previous_codex_args = previous_entry.settings.codex_args.clone();
        let previous_worktree_setup_script = previous_entry.settings.worktree_setup_script.clone();
        let entry_snapshot = apply_settings_update(&mut workspaces, &id, settings)?;
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
    let connected = sessions.lock().await.contains_key(&id);
    if connected && (codex_home_changed || codex_args_changed) {
        let rollback_entry = previous_entry.clone();
        let (default_bin, codex_args) = {
            let settings = app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(
                    &entry_snapshot,
                    parent_entry.as_ref(),
                    Some(&settings),
                ),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, parent_entry.as_ref());
        let new_session = match spawn_session(
            entry_snapshot.clone(),
            default_bin,
            codex_args,
            codex_home,
        )
        .await
        {
            Ok(session) => session,
            Err(error) => {
                let mut workspaces = workspaces.lock().await;
                workspaces.insert(rollback_entry.id.clone(), rollback_entry);
                return Err(error);
            }
        };
        if let Some(old_session) = sessions
            .lock()
            .await
            .insert(entry_snapshot.id.clone(), new_session)
        {
            let mut child = old_session.child.lock().await;
            kill_child_process_tree(&mut child).await;
        }
    }
    if codex_home_changed || codex_args_changed {
        let app_settings_snapshot = app_settings.lock().await.clone();
        let default_bin = app_settings_snapshot.codex_bin.clone();
        for child in &child_entries {
            let connected = sessions.lock().await.contains_key(&child.id);
            if !connected {
                continue;
            }
            let previous_child_home = resolve_workspace_codex_home(child, Some(&previous_entry));
            let next_child_home = resolve_workspace_codex_home(child, Some(&entry_snapshot));
            let previous_child_args = resolve_workspace_codex_args(
                child,
                Some(&previous_entry),
                Some(&app_settings_snapshot),
            );
            let next_child_args = resolve_workspace_codex_args(
                child,
                Some(&entry_snapshot),
                Some(&app_settings_snapshot),
            );
            if previous_child_home == next_child_home && previous_child_args == next_child_args {
                continue;
            }
            let new_session = match spawn_session(
                child.clone(),
                default_bin.clone(),
                next_child_args,
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
            if let Some(old_session) = sessions.lock().await.insert(child.id.clone(), new_session) {
                let mut child = old_session.child.lock().await;
                kill_child_process_tree(&mut child).await;
            }
        }
    }
    if worktree_setup_script_changed && !entry_snapshot.kind.is_worktree() {
        let child_ids = child_entries
            .iter()
            .map(|child| child.id.clone())
            .collect::<Vec<_>>();
        if !child_ids.is_empty() {
            let mut workspaces = workspaces.lock().await;
            for child_id in child_ids {
                if let Some(child) = workspaces.get_mut(&child_id) {
                    child.settings.worktree_setup_script =
                        entry_snapshot.settings.worktree_setup_script.clone();
                }
            }
        }
    }
    let list: Vec<_> = {
        let workspaces = workspaces.lock().await;
        workspaces.values().cloned().collect()
    };
    write_workspaces(storage_path, &list)?;
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

pub(crate) async fn update_workspace_codex_bin_core(
    id: String,
    codex_bin: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
) -> Result<WorkspaceInfo, String> {
    let (entry_snapshot, list) = {
        let mut workspaces = workspaces.lock().await;
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
    write_workspaces(storage_path, &list)?;

    let connected = sessions.lock().await.contains_key(&id);
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
