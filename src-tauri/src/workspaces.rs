use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

use crate::codex::spawn_workspace_session;
use crate::codex_home::resolve_workspace_codex_home;
use crate::remote_backend;
use crate::state::AppState;
use crate::git_utils::resolve_git_root;
use crate::storage::write_workspaces;
use crate::types::{
    WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
};
use crate::utils::normalize_git_path;

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "target" | "release-artifacts"
    )
}

fn sanitize_worktree_name(branch: &str) -> String {
    let mut result = String::new();
    for ch in branch.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "worktree".to_string()
    } else {
        trimmed
    }
}

fn sanitize_clone_dir_name(name: &str) -> String {
    let mut result = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "copy".to_string()
    } else {
        trimmed
    }
}

fn list_workspace_files_inner(root: &PathBuf, max_files: usize) -> Vec<String> {
    let mut results = Vec::new();
    let walker = WalkBuilder::new(root)
        // Allow hidden entries.
        .hidden(false)
        // Avoid crawling symlink targets.
        .follow_links(false)
        // Don't require git to be present to apply to apply git-related ignore rules.
        .require_git(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                let name = entry.file_name().to_string_lossy();
                return !should_skip_dir(&name);
            }
            true
        })
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        if let Ok(rel_path) = entry.path().strip_prefix(root) {
            let normalized = normalize_git_path(&rel_path.to_string_lossy());
            if !normalized.is_empty() {
                results.push(normalized);
            }
        }
        if results.len() >= max_files {
            break;
        }
    }

    results.sort();
    results
}

const MAX_WORKSPACE_FILE_BYTES: u64 = 400_000;

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceFileResponse {
    content: String,
    truncated: bool,
}

fn read_workspace_file_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<WorkspaceFileResponse, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }
    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read file metadata: {err}"))?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let file =
        File::open(&canonical_path).map_err(|err| format!("Failed to open file: {err}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_WORKSPACE_FILE_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read file: {err}"))?;

    let truncated = buffer.len() > MAX_WORKSPACE_FILE_BYTES as usize;
    if truncated {
        buffer.truncate(MAX_WORKSPACE_FILE_BYTES as usize);
    }

    let content =
        String::from_utf8(buffer).map_err(|_| "File is not valid UTF-8".to_string())?;
    Ok(WorkspaceFileResponse { content, truncated })
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

fn sort_workspaces(list: &mut Vec<WorkspaceInfo>) {
    list.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        a_order
            .cmp(&b_order)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });
}

fn apply_workspace_settings_update(
    workspaces: &mut HashMap<String, WorkspaceEntry>,
    id: &str,
    settings: WorkspaceSettings,
) -> Result<WorkspaceEntry, String> {
    match workspaces.get_mut(id) {
        Some(entry) => {
            entry.settings = settings.clone();
            Ok(entry.clone())
        }
        None => Err("workspace not found".to_string()),
    }
}

async fn run_git_command(repo_path: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

fn is_missing_worktree_error(error: &str) -> bool {
    error.contains("is not a working tree")
}

async fn run_git_command_bytes(repo_path: &PathBuf, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

async fn run_git_diff(repo_path: &PathBuf, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() || output.status.code() == Some(1) {
        Ok(output.stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

async fn git_branch_exists(repo_path: &PathBuf, branch: &str) -> Result<bool, String> {
    let status = Command::new("git")
        .args(["show-ref", "--verify", &format!("refs/heads/{branch}")])
        .current_dir(repo_path)
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
}

async fn git_remote_exists(repo_path: &PathBuf, remote: &str) -> Result<bool, String> {
    let status = Command::new("git")
        .args(["remote", "get-url", remote])
        .current_dir(repo_path)
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
}

async fn git_remote_branch_exists(
    repo_path: &PathBuf,
    remote: &str,
    branch: &str,
) -> Result<bool, String> {
    let output = Command::new("git")
        .args([
            "ls-remote",
            "--heads",
            remote,
            &format!("refs/heads/{branch}"),
        ])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

async fn git_list_remotes(repo_path: &PathBuf) -> Result<Vec<String>, String> {
    let output = run_git_command(repo_path, &["remote"]).await?;
    Ok(output
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

async fn git_find_remote_for_branch(
    repo_path: &PathBuf,
    branch: &str,
) -> Result<Option<String>, String> {
    if git_remote_exists(repo_path, "origin").await?
        && git_remote_branch_exists(repo_path, "origin", branch).await?
    {
        return Ok(Some("origin".to_string()));
    }

    for remote in git_list_remotes(repo_path).await? {
        if remote == "origin" {
            continue;
        }
        if git_remote_branch_exists(repo_path, &remote, branch).await? {
            return Ok(Some(remote));
        }
    }

    Ok(None)
}

async fn unique_branch_name(
    repo_path: &PathBuf,
    desired: &str,
    remote: Option<&str>,
) -> Result<(String, bool), String> {
    let mut candidate = desired.to_string();
    if desired.is_empty() {
        return Ok((candidate, false));
    }
    if !git_branch_exists(repo_path, &candidate).await?
        && match remote {
            Some(remote) => !git_remote_branch_exists(repo_path, remote, &candidate).await?,
            None => true,
        }
    {
        return Ok((candidate, false));
    }
    for index in 2..1000 {
        candidate = format!("{desired}-{index}");
        let local_exists = git_branch_exists(repo_path, &candidate).await?;
        let remote_exists = match remote {
            Some(remote) => git_remote_branch_exists(repo_path, remote, &candidate).await?,
            None => false,
        };
        if !local_exists && !remote_exists {
            return Ok((candidate, true));
        }
    }
    Err("Unable to find an available branch name.".to_string())
}

async fn git_get_origin_url(repo_path: &PathBuf) -> Option<String> {
    match run_git_command(repo_path, &["config", "--get", "remote.origin.url"]).await {
        Ok(url) if !url.trim().is_empty() => Some(url),
        _ => None,
    }
}

fn unique_worktree_path(base_dir: &PathBuf, name: &str) -> PathBuf {
    let mut candidate = base_dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if !next.exists() {
            candidate = next;
            break;
        }
    }
    candidate
}

fn unique_worktree_path_for_rename(
    base_dir: &PathBuf,
    name: &str,
    current_path: &PathBuf,
) -> Result<PathBuf, String> {
    let candidate = base_dir.join(name);
    if candidate == *current_path {
        return Ok(candidate);
    }
    if !candidate.exists() {
        return Ok(candidate);
    }
    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if next == *current_path || !next.exists() {
            return Ok(next);
        }
    }
    Err(format!(
        "Failed to find an available worktree path under {}.",
        base_dir.display()
    ))
}

fn build_clone_destination_path(copies_folder: &PathBuf, copy_name: &str) -> PathBuf {
    let safe_name = sanitize_clone_dir_name(copy_name);
    unique_worktree_path(copies_folder, &safe_name)
}

fn null_device_path() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
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

    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = spawn_workspace_session(entry.clone(), default_bin, app, codex_home).await?;

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

    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = match spawn_workspace_session(entry.clone(), default_bin, app, codex_home).await {
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
        settings: WorkspaceSettings::default(),
    };

    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let codex_home = resolve_workspace_codex_home(&entry, Some(&parent_entry.path));
    let session = spawn_workspace_session(entry.clone(), default_bin, app, codex_home).await?;
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
pub(crate) async fn remove_workspace(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
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
) -> Result<(), String> {
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
        let default_bin = {
            let settings = state.app_settings.lock().await;
            settings.codex_bin.clone()
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, Some(&parent.path));
        match spawn_workspace_session(entry_snapshot.clone(), default_bin, app, codex_home).await {
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

    let mut child = Command::new("git")
        .args(["apply", "--3way", "--whitespace=nowarn", "-"])
        .current_dir(&parent_root)
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
) -> Result<WorkspaceInfo, String> {
    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry_snapshot = apply_workspace_settings_update(&mut workspaces, &id, settings)?;
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
pub(crate) async fn update_workspace_codex_bin(
    id: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
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

    let (entry, parent_path) = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&id)
            .cloned()
            .map(|entry| {
                let parent_path = entry
                    .parent_id
                    .as_ref()
                    .and_then(|parent_id| workspaces.get(parent_id))
                    .map(|parent| parent.path.clone());
                (entry, parent_path)
            })
            .ok_or("workspace not found")?
    };

    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let codex_home = resolve_workspace_codex_home(&entry, parent_path.as_deref());
    let session = spawn_workspace_session(entry.clone(), default_bin, app, codex_home).await?;
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
    app: String,
) -> Result<(), String> {
    let status = std::process::Command::new("open")
        .arg("-a")
        .arg(app)
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to open app: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Failed to open app".to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;

    use super::{
        apply_workspace_settings_update, build_clone_destination_path, sanitize_clone_dir_name,
        sanitize_worktree_name, sort_workspaces,
    };
    use crate::storage::{read_workspaces, write_workspaces};
    use crate::types::{WorktreeInfo, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings};
    use uuid::Uuid;

    fn workspace(name: &str, sort_order: Option<u32>) -> WorkspaceInfo {
        workspace_with_id_and_kind(name, name, sort_order, WorkspaceKind::Main)
    }

    fn workspace_with_id_and_kind(
        name: &str,
        id: &str,
        sort_order: Option<u32>,
        kind: WorkspaceKind,
    ) -> WorkspaceInfo {
        let (parent_id, worktree) = if kind.is_worktree() {
            (
                Some("parent".to_string()),
                Some(WorktreeInfo {
                    branch: name.to_string(),
                }),
            )
        } else {
            (None, None)
        };
        WorkspaceInfo {
            id: id.to_string(),
            name: name.to_string(),
            path: "/tmp".to_string(),
            connected: false,
            codex_bin: None,
            kind,
            parent_id,
            worktree,
            settings: WorkspaceSettings {
                sidebar_collapsed: false,
                sort_order,
                group_id: None,
                git_root: None,
            },
        }
    }

    #[test]
    fn sanitize_worktree_name_rewrites_specials() {
        assert_eq!(sanitize_worktree_name("feature/new-thing"), "feature-new-thing");
        assert_eq!(sanitize_worktree_name("///"), "worktree");
        assert_eq!(sanitize_worktree_name("--branch--"), "branch");
    }

    #[test]
    fn sanitize_worktree_name_allows_safe_chars() {
        assert_eq!(sanitize_worktree_name("release_1.2.3"), "release_1.2.3");
        assert_eq!(sanitize_worktree_name("feature--x"), "feature--x");
    }

    #[test]
    fn sanitize_clone_dir_name_rewrites_specials() {
        assert_eq!(sanitize_clone_dir_name("feature/new-thing"), "feature-new-thing");
        assert_eq!(sanitize_clone_dir_name("///"), "copy");
        assert_eq!(sanitize_clone_dir_name("--name--"), "name");
    }

    #[test]
    fn sanitize_clone_dir_name_allows_safe_chars() {
        assert_eq!(sanitize_clone_dir_name("release_1.2.3"), "release_1.2.3");
        assert_eq!(sanitize_clone_dir_name("feature--x"), "feature--x");
    }

    #[test]
    fn build_clone_destination_path_sanitizes_and_uniquifies() {
        let temp_dir =
            std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        let copies_folder = temp_dir.join("copies");
        std::fs::create_dir_all(&copies_folder).expect("create copies folder");

        let first = build_clone_destination_path(&copies_folder, "feature/new-thing");
        assert!(first.starts_with(&copies_folder));
        assert_eq!(
            first.file_name().and_then(|name| name.to_str()),
            Some("feature-new-thing")
        );

        std::fs::create_dir_all(&first).expect("create first clone folder");

        let second = build_clone_destination_path(&copies_folder, "feature/new-thing");
        assert!(second.starts_with(&copies_folder));
        assert_ne!(first, second);
        assert_eq!(
            second.file_name().and_then(|name| name.to_str()),
            Some("feature-new-thing-2")
        );
    }

    #[test]
    fn sort_workspaces_orders_by_sort_then_name() {
        let mut items = vec![
            workspace("beta", None),
            workspace("alpha", None),
            workspace("delta", Some(2)),
            workspace("gamma", Some(1)),
        ];

        sort_workspaces(&mut items);

        let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
        assert_eq!(names, vec!["gamma", "delta", "alpha", "beta"]);
    }

    #[test]
    fn sort_workspaces_places_unordered_last_and_names_tie_break() {
        let mut items = vec![
            workspace("delta", None),
            workspace("beta", Some(1)),
            workspace("alpha", Some(1)),
            workspace("gamma", None),
        ];

        sort_workspaces(&mut items);

        let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
        assert_eq!(names, vec!["alpha", "beta", "delta", "gamma"]);
    }

    #[test]
    fn sort_workspaces_ignores_group_ids() {
        let mut first = workspace("beta", Some(2));
        first.settings.group_id = Some("group-b".to_string());
        let mut second = workspace("alpha", Some(1));
        second.settings.group_id = Some("group-a".to_string());
        let mut third = workspace("gamma", None);
        third.settings.group_id = Some("group-a".to_string());

        let mut items = vec![first, second, third];
        sort_workspaces(&mut items);

        let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
        assert_eq!(names, vec!["alpha", "beta", "gamma"]);
    }

    #[test]
    fn sort_workspaces_breaks_ties_by_id() {
        let mut items = vec![
            workspace_with_id_and_kind("alpha", "b-id", Some(1), WorkspaceKind::Main),
            workspace_with_id_and_kind("alpha", "a-id", Some(1), WorkspaceKind::Main),
        ];

        sort_workspaces(&mut items);

        let ids: Vec<_> = items.into_iter().map(|item| item.id).collect();
        assert_eq!(ids, vec!["a-id", "b-id"]);
    }

    #[test]
    fn sort_workspaces_does_not_bias_kind() {
        let mut items = vec![
            workspace_with_id_and_kind("main", "main", Some(2), WorkspaceKind::Main),
            workspace_with_id_and_kind("worktree", "worktree", Some(1), WorkspaceKind::Worktree),
        ];

        sort_workspaces(&mut items);

        let kinds: Vec<_> = items.into_iter().map(|item| item.kind).collect();
        assert!(matches!(
            kinds.as_slice(),
            [WorkspaceKind::Worktree, WorkspaceKind::Main]
        ));
    }

    #[test]
    fn update_workspace_settings_persists_sort_and_group() {
        let id = "workspace-1".to_string();
        let entry = WorkspaceEntry {
            id: id.clone(),
            name: "Workspace".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let mut workspaces = HashMap::from([(id.clone(), entry)]);

        let mut settings = WorkspaceSettings::default();
        settings.sort_order = Some(3);
        settings.group_id = Some("group-1".to_string());
        settings.sidebar_collapsed = true;
        settings.git_root = Some("/tmp".to_string());

        let updated =
            apply_workspace_settings_update(&mut workspaces, &id, settings.clone()).expect("update");
        assert_eq!(updated.settings.sort_order, Some(3));
        assert_eq!(updated.settings.group_id.as_deref(), Some("group-1"));
        assert!(updated.settings.sidebar_collapsed);
        assert_eq!(updated.settings.git_root.as_deref(), Some("/tmp"));

        let temp_dir = std::env::temp_dir()
            .join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = PathBuf::from(temp_dir.join("workspaces.json"));
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&path, &list).expect("write workspaces");

        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get(&id).expect("stored workspace");
        assert_eq!(stored.settings.sort_order, Some(3));
        assert_eq!(stored.settings.group_id.as_deref(), Some("group-1"));
        assert!(stored.settings.sidebar_collapsed);
        assert_eq!(stored.settings.git_root.as_deref(), Some("/tmp"));
    }
}
