use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_workspace_codex_home;
use crate::storage::write_workspaces;
use crate::types::{
    AppSettings, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
    WorktreeSetupStatus,
};

use super::connect::kill_session_by_id;
use super::helpers::{
    copy_agents_md_from_parent_to_worktree, normalize_setup_script, worktree_setup_marker_path,
    AGENTS_MD_FILE_NAME,
};

pub(crate) async fn worktree_setup_status_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    data_dir: &PathBuf,
) -> Result<WorktreeSetupStatus, String> {
    let entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };

    let script = normalize_setup_script(entry.settings.worktree_setup_script.clone());
    let marker_exists = if entry.kind.is_worktree() {
        worktree_setup_marker_path(data_dir, &entry.id).exists()
    } else {
        false
    };
    let should_run = entry.kind.is_worktree() && script.is_some() && !marker_exists;

    Ok(WorktreeSetupStatus { should_run, script })
}

pub(crate) async fn worktree_setup_mark_ran_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    data_dir: &PathBuf,
) -> Result<(), String> {
    let entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };
    if !entry.kind.is_worktree() {
        return Err("Not a worktree workspace.".to_string());
    }
    let marker_path = worktree_setup_marker_path(data_dir, &entry.id);
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

pub(crate) async fn add_worktree_core<
    FSpawn,
    FutSpawn,
    FSanitize,
    FUniquePath,
    FBranchExists,
    FutBranchExists,
    FFindRemoteTracking,
    FutFindRemoteTracking,
    FRunGit,
    FutRunGit,
>(
    parent_id: String,
    branch: String,
    name: Option<String>,
    copy_agents_md: bool,
    data_dir: &PathBuf,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    sanitize_worktree_name: FSanitize,
    unique_worktree_path: FUniquePath,
    git_branch_exists: FBranchExists,
    git_find_remote_tracking_branch: Option<FFindRemoteTracking>,
    run_git_command: FRunGit,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
    FSanitize: Fn(&str) -> String,
    FUniquePath: Fn(&PathBuf, &str) -> Result<PathBuf, String>,
    FBranchExists: Fn(&PathBuf, &str) -> FutBranchExists,
    FutBranchExists: Future<Output = Result<bool, String>>,
    FFindRemoteTracking: Fn(&PathBuf, &str) -> FutFindRemoteTracking,
    FutFindRemoteTracking: Future<Output = Result<Option<String>, String>>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let branch = branch.trim().to_string();
    if branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let parent_entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "parent workspace not found".to_string())?
    };

    if parent_entry.kind.is_worktree() {
        return Err("Cannot create a worktree from another worktree.".to_string());
    }

    let worktree_root = data_dir.join("worktrees").join(&parent_entry.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|err| format!("Failed to create worktree directory: {err}"))?;

    let safe_name = sanitize_worktree_name(&branch);
    let worktree_path = unique_worktree_path(&worktree_root, &safe_name)?;
    let worktree_path_string = worktree_path.to_string_lossy().to_string();

    let repo_path = PathBuf::from(&parent_entry.path);
    let branch_exists = git_branch_exists(&repo_path, &branch).await?;
    if branch_exists {
        run_git_command(
            &repo_path,
            &["worktree", "add", &worktree_path_string, &branch],
        )
        .await?;
    } else if let Some(find_remote_tracking) = git_find_remote_tracking_branch {
        if let Some(remote_ref) = find_remote_tracking(&repo_path, &branch).await? {
            run_git_command(
                &repo_path,
                &[
                    "worktree",
                    "add",
                    "-b",
                    &branch,
                    &worktree_path_string,
                    &remote_ref,
                ],
            )
            .await?;
        } else {
            run_git_command(
                &repo_path,
                &["worktree", "add", "-b", &branch, &worktree_path_string],
            )
            .await?;
        }
    } else {
        run_git_command(
            &repo_path,
            &["worktree", "add", "-b", &branch, &worktree_path_string],
        )
        .await?;
    }

    if copy_agents_md {
        if let Err(error) = copy_agents_md_from_parent_to_worktree(&repo_path, &worktree_path) {
            eprintln!(
                "add_worktree: optional {} copy failed for {}: {}",
                AGENTS_MD_FILE_NAME,
                worktree_path.display(),
                error
            );
        }
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone().unwrap_or_else(|| branch.clone()),
        path: worktree_path_string,
        codex_bin: parent_entry.codex_bin.clone(),
        kind: WorkspaceKind::Worktree,
        parent_id: Some(parent_entry.id.clone()),
        worktree: Some(WorktreeInfo { branch }),
        settings: WorkspaceSettings {
            worktree_setup_script: normalize_setup_script(
                parent_entry.settings.worktree_setup_script.clone(),
            ),
            ..WorkspaceSettings::default()
        },
    };

    let (default_bin, codex_args) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, Some(&parent_entry), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, Some(&parent_entry));
    let session = spawn_session(entry.clone(), default_bin, codex_args, codex_home).await?;

    {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
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

pub(crate) async fn remove_worktree_core<FRunGit, FutRunGit, FIsMissing, FRemoveDirAll>(
    id: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
    run_git_command: FRunGit,
    is_missing_worktree_error: FIsMissing,
    remove_dir_all: FRemoveDirAll,
) -> Result<(), String>
where
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
    FIsMissing: Fn(&str) -> bool,
    FRemoveDirAll: Fn(&PathBuf) -> Result<(), String>,
{
    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let parent_path = PathBuf::from(&parent.path);
    let entry_path = PathBuf::from(&entry.path);
    kill_session_by_id(sessions, &entry.id).await;

    if entry_path.exists() {
        if let Err(error) = run_git_command(
            &parent_path,
            &["worktree", "remove", "--force", &entry.path],
        )
        .await
        {
            if is_missing_worktree_error(&error) {
                if entry_path.exists() {
                    remove_dir_all(&entry_path)?;
                }
            } else {
                return Err(error);
            }
        }
    }
    let _ = run_git_command(&parent_path, &["worktree", "prune", "--expire", "now"]).await;

    {
        let mut workspaces = workspaces.lock().await;
        workspaces.remove(&entry.id);
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
    }

    Ok(())
}

pub(crate) async fn rename_worktree_core<
    FSpawn,
    FutSpawn,
    FResolveGitRoot,
    FUniqueBranch,
    FutUniqueBranch,
    FSanitize,
    FUniqueRenamePath,
    FRunGit,
    FutRunGit,
>(
    id: String,
    branch: String,
    data_dir: &PathBuf,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    resolve_git_root: FResolveGitRoot,
    unique_branch_name: FUniqueBranch,
    sanitize_worktree_name: FSanitize,
    unique_worktree_path_for_rename: FUniqueRenamePath,
    run_git_command: FRunGit,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
    FResolveGitRoot: Fn(&WorkspaceEntry) -> Result<PathBuf, String>,
    FUniqueBranch: Fn(&PathBuf, &str) -> FutUniqueBranch,
    FutUniqueBranch: Future<Output = Result<String, String>>,
    FSanitize: Fn(&str) -> String,
    FUniqueRenamePath: Fn(&PathBuf, &str, &PathBuf) -> Result<PathBuf, String>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required.".to_string());
    }

    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let old_branch = entry
        .worktree
        .as_ref()
        .map(|worktree| worktree.branch.clone())
        .ok_or_else(|| "worktree metadata missing".to_string())?;
    if old_branch == trimmed {
        return Err("Branch name is unchanged.".to_string());
    }

    let parent_root = resolve_git_root(&parent)?;
    let final_branch = unique_branch_name(&parent_root, trimmed).await?;
    if final_branch == old_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    run_git_command(&parent_root, &["branch", "-m", &old_branch, &final_branch]).await?;

    let worktree_root = data_dir.join("worktrees").join(&parent.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|err| format!("Failed to create worktree directory: {err}"))?;

    let safe_name = sanitize_worktree_name(&final_branch);
    let current_path = PathBuf::from(&entry.path);
    let next_path = unique_worktree_path_for_rename(&worktree_root, &safe_name, &current_path)?;
    let next_path_string = next_path.to_string_lossy().to_string();
    if next_path_string != entry.path {
        if let Err(error) = run_git_command(
            &parent_root,
            &["worktree", "move", &entry.path, &next_path_string],
        )
        .await
        {
            let _ =
                run_git_command(&parent_root, &["branch", "-m", &final_branch, &old_branch]).await;
            return Err(error);
        }
    }

    let (entry_snapshot, list) = {
        let mut workspaces = workspaces.lock().await;
        let entry = match workspaces.get_mut(&id) {
            Some(entry) => entry,
            None => return Err("workspace not found".to_string()),
        };
        if entry.name.trim() == old_branch {
            entry.name = final_branch.clone();
        }
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
    write_workspaces(storage_path, &list)?;

    let was_connected = sessions.lock().await.contains_key(&entry_snapshot.id);
    if was_connected {
        kill_session_by_id(sessions, &entry_snapshot.id).await;
        let (default_bin, codex_args) = {
            let settings = app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(&entry_snapshot, Some(&parent), Some(&settings)),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, Some(&parent));
        match spawn_session(entry_snapshot.clone(), default_bin, codex_args, codex_home).await {
            Ok(session) => {
                sessions
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

    let connected = sessions.lock().await.contains_key(&entry_snapshot.id);
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

pub(crate) async fn rename_worktree_upstream_core<
    FResolveGitRoot,
    FBranchExists,
    FutBranchExists,
    FFindRemote,
    FutFindRemote,
    FRemoteExists,
    FutRemoteExists,
    FRemoteBranchExists,
    FutRemoteBranchExists,
    FRunGit,
    FutRunGit,
>(
    id: String,
    old_branch: String,
    new_branch: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    resolve_git_root: FResolveGitRoot,
    git_branch_exists: FBranchExists,
    git_find_remote_for_branch: FFindRemote,
    git_remote_exists: FRemoteExists,
    git_remote_branch_exists: FRemoteBranchExists,
    run_git_command: FRunGit,
) -> Result<(), String>
where
    FResolveGitRoot: Fn(&WorkspaceEntry) -> Result<PathBuf, String>,
    FBranchExists: Fn(&PathBuf, &str) -> FutBranchExists,
    FutBranchExists: Future<Output = Result<bool, String>>,
    FFindRemote: Fn(&PathBuf, &str) -> FutFindRemote,
    FutFindRemote: Future<Output = Result<Option<String>, String>>,
    FRemoteExists: Fn(&PathBuf, &str) -> FutRemoteExists,
    FutRemoteExists: Future<Output = Result<bool, String>>,
    FRemoteBranchExists: Fn(&PathBuf, &str, &str) -> FutRemoteBranchExists,
    FutRemoteBranchExists: Future<Output = Result<bool, String>>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let old_branch = old_branch.trim().to_string();
    let new_branch = new_branch.trim().to_string();
    if old_branch.is_empty() || new_branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    if old_branch == new_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    let (_entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let parent_root = resolve_git_root(&parent)?;
    if !git_branch_exists(&parent_root, &new_branch).await? {
        return Err("Local branch not found.".to_string());
    }

    let remote_for_old = git_find_remote_for_branch(&parent_root, &old_branch).await?;
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

    if git_remote_branch_exists(&parent_root, &remote_name, &new_branch).await? {
        return Err("Remote branch already exists.".to_string());
    }

    if remote_for_old.is_some() {
        run_git_command(
            &parent_root,
            &["push", &remote_name, &format!("{new_branch}:{new_branch}")],
        )
        .await?;
        run_git_command(
            &parent_root,
            &["push", &remote_name, &format!(":{old_branch}")],
        )
        .await?;
    } else {
        run_git_command(&parent_root, &["push", &remote_name, &new_branch]).await?;
    }

    run_git_command(
        &parent_root,
        &[
            "branch",
            "--set-upstream-to",
            &format!("{remote_name}/{new_branch}"),
            &new_branch,
        ],
    )
    .await?;

    Ok(())
}
