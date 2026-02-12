use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{BranchType, Repository, Status, StatusOptions};
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::git_utils::{checkout_branch, list_git_roots as scan_git_roots, resolve_git_root};
use crate::shared::process_core::tokio_command;
use crate::types::{BranchInfo, WorkspaceEntry};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};

use super::context::workspace_entry_for_id;

async fn run_git_command(repo_root: &Path, args: &[&str]) -> Result<(), String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .output()
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
        return Err("Git command failed.".to_string());
    }
    Err(detail.to_string())
}

pub(super) fn action_paths_for_file(repo_root: &Path, path: &str) -> Vec<String> {
    let target = normalize_git_path(path).trim().to_string();
    if target.is_empty() {
        return Vec::new();
    }

    let repo = match Repository::open(repo_root) {
        Ok(repo) => repo,
        Err(_) => return vec![target],
    };

    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = match repo.statuses(Some(&mut status_options)) {
        Ok(statuses) => statuses,
        Err(_) => return vec![target],
    };

    for entry in statuses.iter() {
        let status = entry.status();
        if !(status.contains(Status::WT_RENAMED) || status.contains(Status::INDEX_RENAMED)) {
            continue;
        }
        let delta = entry.index_to_workdir().or_else(|| entry.head_to_index());
        let Some(delta) = delta else {
            continue;
        };
        let (Some(old_path), Some(new_path)) = (delta.old_file().path(), delta.new_file().path())
        else {
            continue;
        };
        let old_path = normalize_git_path(old_path.to_string_lossy().as_ref());
        let new_path = normalize_git_path(new_path.to_string_lossy().as_ref());
        if old_path != target && new_path != target {
            continue;
        }
        if old_path == new_path || new_path.is_empty() {
            return vec![target];
        }
        let mut result = Vec::new();
        if !old_path.is_empty() {
            result.push(old_path);
        }
        if !new_path.is_empty() && !result.contains(&new_path) {
            result.push(new_path);
        }
        return if result.is_empty() {
            vec![target]
        } else {
            result
        };
    }

    vec![target]
}

fn parse_upstream_ref(name: &str) -> Option<(String, String)> {
    let trimmed = name.strip_prefix("refs/remotes/").unwrap_or(name);
    let mut parts = trimmed.splitn(2, '/');
    let remote = parts.next()?;
    let branch = parts.next()?;
    if remote.is_empty() || branch.is_empty() {
        return None;
    }
    Some((remote.to_string(), branch.to_string()))
}

fn upstream_remote_and_branch(repo_root: &Path) -> Result<Option<(String, String)>, String> {
    let repo = Repository::open(repo_root).map_err(|e| e.to_string())?;
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(None),
    };
    if !head.is_branch() {
        return Ok(None);
    }
    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return Ok(None),
    };
    let branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|e| e.to_string())?;
    let upstream_branch = match branch.upstream() {
        Ok(upstream) => upstream,
        Err(_) => return Ok(None),
    };
    let upstream_ref = upstream_branch.get();
    let upstream_name = upstream_ref.name().or_else(|| upstream_ref.shorthand());
    Ok(upstream_name.and_then(parse_upstream_ref))
}

async fn push_with_upstream(repo_root: &Path) -> Result<(), String> {
    let upstream = upstream_remote_and_branch(repo_root)?;
    if let Some((remote, branch)) = upstream {
        let _ = run_git_command(repo_root, &["fetch", "--prune", remote.as_str()]).await;
        let refspec = format!("HEAD:{branch}");
        return run_git_command(repo_root, &["push", remote.as_str(), refspec.as_str()]).await;
    }
    run_git_command(repo_root, &["push"]).await
}

async fn fetch_with_default_remote(repo_root: &Path) -> Result<(), String> {
    let upstream = upstream_remote_and_branch(repo_root)?;
    if let Some((remote, _)) = upstream {
        return run_git_command(repo_root, &["fetch", "--prune", remote.as_str()]).await;
    }
    run_git_command(repo_root, &["fetch", "--prune"]).await
}

async fn pull_with_default_strategy(repo_root: &Path) -> Result<(), String> {
    fn autostash_unsupported(lower: &str) -> bool {
        lower.contains("unknown option") && lower.contains("autostash")
    }

    fn needs_reconcile_strategy(lower: &str) -> bool {
        lower.contains("need to specify how to reconcile divergent branches")
            || lower.contains("you have divergent branches")
    }

    match run_git_command(repo_root, &["pull", "--autostash"]).await {
        Ok(()) => Ok(()),
        Err(err) => {
            let lower = err.to_lowercase();
            if autostash_unsupported(&lower) {
                match run_git_command(repo_root, &["pull"]).await {
                    Ok(()) => Ok(()),
                    Err(no_autostash_err) => {
                        let no_autostash_lower = no_autostash_err.to_lowercase();
                        if needs_reconcile_strategy(&no_autostash_lower) {
                            return run_git_command(repo_root, &["pull", "--no-rebase"]).await;
                        }
                        Err(no_autostash_err)
                    }
                }
            } else if needs_reconcile_strategy(&lower) {
                match run_git_command(repo_root, &["pull", "--no-rebase", "--autostash"]).await {
                    Ok(()) => Ok(()),
                    Err(merge_err) => {
                        let merge_lower = merge_err.to_lowercase();
                        if autostash_unsupported(&merge_lower) {
                            return run_git_command(repo_root, &["pull", "--no-rebase"]).await;
                        }
                        Err(merge_err)
                    }
                }
            } else {
                Err(err)
            }
        }
    }
}

pub(super) async fn stage_git_file_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["add", "-A", "--", &path]).await?;
    }
    Ok(())
}

pub(super) async fn stage_git_all_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["add", "-A"]).await
}

pub(super) async fn unstage_git_file_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["restore", "--staged", "--", &path]).await?;
    }
    Ok(())
}

pub(super) async fn revert_git_file_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        if run_git_command(
            &repo_root,
            &["restore", "--staged", "--worktree", "--", &path],
        )
        .await
        .is_ok()
        {
            continue;
        }
        run_git_command(&repo_root, &["clean", "-f", "--", &path]).await?;
    }
    Ok(())
}

pub(super) async fn revert_git_all_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    run_git_command(
        &repo_root,
        &["restore", "--staged", "--worktree", "--", "."],
    )
    .await?;
    run_git_command(&repo_root, &["clean", "-f", "-d"]).await
}

pub(super) async fn commit_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    message: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["commit", "-m", &message]).await
}

pub(super) async fn push_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    push_with_upstream(&repo_root).await
}

pub(super) async fn pull_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    pull_with_default_strategy(&repo_root).await
}

pub(super) async fn fetch_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    fetch_with_default_remote(&repo_root).await
}

pub(super) async fn sync_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    pull_with_default_strategy(&repo_root).await?;
    push_with_upstream(&repo_root).await
}

pub(super) async fn list_git_roots_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    depth: Option<usize>,
) -> Result<Vec<String>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let root = PathBuf::from(&entry.path);
    let depth = depth.unwrap_or(2).clamp(1, 6);
    Ok(scan_git_roots(&root, depth, 200))
}

pub(super) async fn list_git_branches_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let mut branches = Vec::new();
    let refs = repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.to_string())?;
    for branch_result in refs {
        let (branch, _) = branch_result.map_err(|e| e.to_string())?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let last_commit = branch
            .get()
            .target()
            .and_then(|oid| repo.find_commit(oid).ok())
            .map(|commit| commit.time().seconds())
            .unwrap_or(0);
        branches.push(BranchInfo { name, last_commit });
    }
    branches.sort_by(|a, b| b.last_commit.cmp(&a.last_commit));
    Ok(json!({ "branches": branches }))
}

pub(super) async fn checkout_git_branch_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    checkout_branch(&repo, &name).map_err(|e| e.to_string())
}

pub(super) async fn create_git_branch_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let target = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&name, &target, false)
        .map_err(|e| e.to_string())?;
    checkout_branch(&repo, &name).map_err(|e| e.to_string())
}
