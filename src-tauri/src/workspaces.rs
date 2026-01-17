use std::path::PathBuf;

use ignore::WalkBuilder;
use tauri::{AppHandle, Manager, State};
use tokio::process::Command;
use uuid::Uuid;

use crate::codex::spawn_workspace_session;
use crate::state::AppState;
use crate::storage::write_workspaces;
use crate::types::{
    WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
};
use crate::utils::normalize_git_path;

fn resolve_codex_home(entry: &WorkspaceEntry, parent_path: Option<&str>) -> Option<PathBuf> {
    if entry.kind.is_worktree() {
        if let Some(parent_path) = parent_path {
            let legacy_home = PathBuf::from(parent_path).join(".codexmonitor");
            if legacy_home.is_dir() {
                return Some(legacy_home);
            }
        }
    }
    let legacy_home = PathBuf::from(&entry.path).join(".codexmonitor");
    if legacy_home.is_dir() {
        return Some(legacy_home);
    }
    None
}

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

fn sort_workspaces(list: &mut Vec<WorkspaceInfo>) {
    list.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        a_order.cmp(&b_order).then_with(|| a.name.cmp(&b.name))
    });
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

async fn git_branch_exists(repo_path: &PathBuf, branch: &str) -> Result<bool, String> {
    let status = Command::new("git")
        .args(["show-ref", "--verify", &format!("refs/heads/{branch}")])
        .current_dir(repo_path)
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
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

#[tauri::command]
pub(crate) async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceInfo>, String> {
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
pub(crate) async fn add_workspace(
    path: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
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
    let codex_home = resolve_codex_home(&entry, None);
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
    let codex_home = resolve_codex_home(&entry, Some(&parent_entry.path));
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
            run_git_command(
                &parent_path,
                &["worktree", "remove", "--force", &child.path],
            )
            .await?;
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
        run_git_command(
            &parent_path,
            &["worktree", "remove", "--force", &entry.path],
        )
        .await?;
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
pub(crate) async fn update_workspace_settings(
    id: String,
    settings: WorkspaceSettings,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let (entry_snapshot, list) = {
        let mut workspaces = state.workspaces.lock().await;
        let entry_snapshot = match workspaces.get_mut(&id) {
            Some(entry) => {
                entry.settings = settings.clone();
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
    let codex_home = resolve_codex_home(&entry, parent_path.as_deref());
    let session = spawn_workspace_session(entry.clone(), default_bin, app, codex_home).await?;
    state.sessions.lock().await.insert(entry.id, session);
    Ok(())
}

#[tauri::command]
pub(crate) async fn list_workspace_files(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
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
    use super::{sanitize_worktree_name, sort_workspaces};
    use crate::types::{WorkspaceInfo, WorkspaceKind, WorkspaceSettings};

    fn workspace(name: &str, sort_order: Option<u32>) -> WorkspaceInfo {
        WorkspaceInfo {
            id: name.to_string(),
            name: name.to_string(),
            path: "/tmp".to_string(),
            connected: false,
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings {
                sidebar_collapsed: false,
                sort_order,
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
}
