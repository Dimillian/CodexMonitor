use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{BranchType, DiffOptions, Repository, Sort, Status, StatusOptions};
use serde_json::json;
use tauri::State;
use tokio::process::Command;

use crate::git_utils::{
    checkout_branch, commit_to_entry, diff_patch_to_string, diff_stats_for_path,
    image_mime_type, list_git_roots as scan_git_roots, parse_github_repo, resolve_git_root,
};
use crate::state::AppState;
use crate::types::{
    BranchInfo, GitCommitDiff, GitFileDiff, GitFileStatus, GitHubIssue, GitHubIssuesResponse,
    GitHubPullRequest, GitHubPullRequestComment, GitHubPullRequestDiff,
    GitHubPullRequestsResponse, GitLogResponse,
};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};

const INDEX_SKIP_WORKTREE_FLAG: u16 = 0x4000;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

fn encode_image_base64(data: &[u8]) -> Option<String> {
    if data.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some(STANDARD.encode(data))
}

fn blob_to_base64(blob: git2::Blob) -> Option<String> {
    if blob.size() > MAX_IMAGE_BYTES {
        return None;
    }
    encode_image_base64(blob.content())
}

fn read_image_base64(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return None;
    }
    let data = fs::read(path).ok()?;
    encode_image_base64(&data)
}

async fn run_git_command(repo_root: &Path, args: &[&str]) -> Result<(), String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = Command::new(git_bin)
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

fn action_paths_for_file(repo_root: &Path, path: &str) -> Vec<String> {
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
        let (Some(old_path), Some(new_path)) =
            (delta.old_file().path(), delta.new_file().path())
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
        return if result.is_empty() { vec![target] } else { result };
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
    let upstream_name = upstream_ref
        .name()
        .or_else(|| upstream_ref.shorthand());
    Ok(upstream_name.and_then(parse_upstream_ref))
}

async fn push_with_upstream(repo_root: &Path) -> Result<(), String> {
    let upstream = upstream_remote_and_branch(repo_root)?;
    if let Some((remote, branch)) = upstream {
        let refspec = format!("HEAD:{branch}");
        return run_git_command(
            repo_root,
            &["push", remote.as_str(), refspec.as_str()],
        )
        .await;
    }
    run_git_command(repo_root, &["push"]).await
}

fn status_for_index(status: Status) -> Option<&'static str> {
    if status.contains(Status::INDEX_NEW) {
        Some("A")
    } else if status.contains(Status::INDEX_MODIFIED) {
        Some("M")
    } else if status.contains(Status::INDEX_DELETED) {
        Some("D")
    } else if status.contains(Status::INDEX_RENAMED) {
        Some("R")
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_workdir(status: Status) -> Option<&'static str> {
    if status.contains(Status::WT_NEW) {
        Some("A")
    } else if status.contains(Status::WT_MODIFIED) {
        Some("M")
    } else if status.contains(Status::WT_DELETED) {
        Some("D")
    } else if status.contains(Status::WT_RENAMED) {
        Some("R")
    } else if status.contains(Status::WT_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_delta(status: git2::Delta) -> &'static str {
    match status {
        git2::Delta::Added => "A",
        git2::Delta::Modified => "M",
        git2::Delta::Deleted => "D",
        git2::Delta::Renamed => "R",
        git2::Delta::Typechange => "T",
        _ => "M",
    }
}

fn build_combined_diff(diff: &git2::Diff) -> String {
    let mut combined_diff = String::new();
    for (index, delta) in diff.deltas().enumerate() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path());
        let Some(path) = path else {
            continue;
        };
        let patch = match git2::Patch::from_diff(diff, index) {
            Ok(patch) => patch,
            Err(_) => continue,
        };
        let Some(mut patch) = patch else {
            continue;
        };
        let content = match diff_patch_to_string(&mut patch) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if content.trim().is_empty() {
            continue;
        }
        if !combined_diff.is_empty() {
            combined_diff.push_str("\n\n");
        }
        combined_diff.push_str(&format!("=== {} ===\n", path.display()));
        combined_diff.push_str(&content);
    }
    combined_diff
}

fn collect_workspace_diff(repo_root: &Path) -> Result<String, String> {
    let repo = Repository::open(repo_root).map_err(|e| e.to_string())?;
    let head_tree = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok());

    let mut options = DiffOptions::new();
    let index = repo.index().map_err(|e| e.to_string())?;
    let diff = match head_tree.as_ref() {
        Some(tree) => repo
            .diff_tree_to_index(Some(tree), Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
        None => repo
            .diff_tree_to_index(None, Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
    };
    let combined_diff = build_combined_diff(&diff);
    if !combined_diff.trim().is_empty() {
        return Ok(combined_diff);
    }

    let mut options = DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    let diff = match head_tree.as_ref() {
        Some(tree) => repo
            .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
            .map_err(|e| e.to_string())?,
        None => repo
            .diff_tree_to_workdir_with_index(None, Some(&mut options))
            .map_err(|e| e.to_string())?,
    };
    Ok(build_combined_diff(&diff))
}

fn github_repo_from_path(path: &Path) -> Result<String, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes
            .iter()
            .flatten()
            .next()
            .unwrap_or("")
            .to_string()
    };
    if name.is_empty() {
        return Err("No git remote configured.".to_string());
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    let remote_url = remote
        .url()
        .ok_or("Remote has no URL configured.")?;
    parse_github_repo(remote_url).ok_or("Remote is not a GitHub repository.".to_string())
}

fn parse_pr_diff(diff: &str) -> Vec<GitHubPullRequestDiff> {
    let mut entries = Vec::new();
    let mut current_lines: Vec<&str> = Vec::new();
    let mut current_old_path: Option<String> = None;
    let mut current_new_path: Option<String> = None;
    let mut current_status: Option<String> = None;

    let finalize = |lines: &Vec<&str>,
                        old_path: &Option<String>,
                        new_path: &Option<String>,
                        status: &Option<String>,
                        results: &mut Vec<GitHubPullRequestDiff>| {
        if lines.is_empty() {
            return;
        }
        let diff_text = lines.join("\n");
        if diff_text.trim().is_empty() {
            return;
        }
        let status_value = status.clone().unwrap_or_else(|| "M".to_string());
        let path = if status_value == "D" {
            old_path.clone().unwrap_or_default()
        } else {
            new_path.clone().or_else(|| old_path.clone()).unwrap_or_default()
        };
        if path.is_empty() {
            return;
        }
        results.push(GitHubPullRequestDiff {
            path: normalize_git_path(&path),
            status: status_value,
            diff: diff_text,
        });
    };

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            finalize(
                &current_lines,
                &current_old_path,
                &current_new_path,
                &current_status,
                &mut entries,
            );
            current_lines = vec![line];
            current_old_path = None;
            current_new_path = None;
            current_status = None;

            let rest = line.trim_start_matches("diff --git ").trim();
            let mut parts = rest.split_whitespace();
            let old_part = parts.next().unwrap_or("").trim_start_matches("a/");
            let new_part = parts.next().unwrap_or("").trim_start_matches("b/");
            if !old_part.is_empty() {
                current_old_path = Some(old_part.to_string());
            }
            if !new_part.is_empty() {
                current_new_path = Some(new_part.to_string());
            }
            continue;
        }
        if line.starts_with("new file mode ") {
            current_status = Some("A".to_string());
        } else if line.starts_with("deleted file mode ") {
            current_status = Some("D".to_string());
        } else if line.starts_with("rename from ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename from ").trim();
            if !path.is_empty() {
                current_old_path = Some(path.to_string());
            }
        } else if line.starts_with("rename to ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename to ").trim();
            if !path.is_empty() {
                current_new_path = Some(path.to_string());
            }
        }
        current_lines.push(line);
    }

    finalize(
        &current_lines,
        &current_old_path,
        &current_new_path,
        &current_status,
        &mut entries,
    );

    entries
}
#[tauri::command]
pub(crate) async fn get_git_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;

    let branch_name = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut status_options))
        .map_err(|e| e.to_string())?;

    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let index = repo.index().ok();

    let mut files = Vec::new();
    let mut staged_files = Vec::new();
    let mut unstaged_files = Vec::new();
    let mut total_additions = 0i64;
    let mut total_deletions = 0i64;
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("");
        if path.is_empty() {
            continue;
        }
        if let Some(index) = index.as_ref() {
            if let Some(entry) = index.get_path(Path::new(path), 0) {
                if entry.flags_extended & INDEX_SKIP_WORKTREE_FLAG != 0 {
                    continue;
                }
            }
        }
        let status = entry.status();
        let normalized_path = normalize_git_path(path);
        let include_index = status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        let include_workdir = status.intersects(
            Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        );
        let mut combined_additions = 0i64;
        let mut combined_deletions = 0i64;

        if include_index {
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, true, false)
                    .unwrap_or((0, 0));
            if let Some(status_str) = status_for_index(status) {
                staged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_workdir {
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, false, true)
                    .unwrap_or((0, 0));
            if let Some(status_str) = status_for_workdir(status) {
                unstaged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_index || include_workdir {
            let status_str = status_for_workdir(status)
                .or_else(|| status_for_index(status))
                .unwrap_or("--");
            files.push(GitFileStatus {
                path: normalized_path,
                status: status_str.to_string(),
                additions: combined_additions,
                deletions: combined_deletions,
            });
        }
    }

    Ok(json!({
        "branchName": branch_name,
        "files": files,
        "stagedFiles": staged_files,
        "unstagedFiles": unstaged_files,
        "totalAdditions": total_additions,
        "totalDeletions": total_deletions,
    }))
}

#[tauri::command]
pub(crate) async fn stage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    // If libgit2 reports a rename, we want a single UI action to stage both the
    // old + new paths so the change actually moves to the staged section.
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["add", "-A", "--", &path]).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn stage_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["add", "-A"]).await
}

#[tauri::command]
pub(crate) async fn unstage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["restore", "--staged", "--", &path]).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn revert_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

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

#[tauri::command]
pub(crate) async fn revert_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?;
    let repo_root = resolve_git_root(entry)?;
    run_git_command(&repo_root, &["restore", "--staged", "--worktree", "--", "."]).await?;
    run_git_command(&repo_root, &["clean", "-f", "-d"]).await
}

#[tauri::command]
pub(crate) async fn commit_git(
    workspace_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["commit", "-m", &message]).await
}

#[tauri::command]
pub(crate) async fn push_git(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    push_with_upstream(&repo_root).await
}

#[tauri::command]
pub(crate) async fn pull_git(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["pull"]).await
}

#[tauri::command]
pub(crate) async fn sync_git(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    // Pull first, then push (like VSCode sync)
    run_git_command(&repo_root, &["pull"]).await?;
    push_with_upstream(&repo_root).await
}

#[tauri::command]
pub(crate) async fn list_git_roots(
    workspace_id: String,
    depth: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let root = PathBuf::from(&entry.path);
    let depth = depth.unwrap_or(2).clamp(1, 6);
    Ok(scan_git_roots(&root, depth, 200))
}

/// Helper function to get the combined diff for a workspace (used by commit message generation)
pub(crate) async fn get_workspace_diff(
    workspace_id: &str,
    state: &State<'_, AppState>,
) -> Result<String, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    collect_workspace_diff(&repo_root)
}

#[tauri::command]
pub(crate) async fn get_git_diffs(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitFileDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
        let head_tree = repo
            .head()
            .ok()
            .and_then(|head| head.peel_to_tree().ok());

        let mut options = DiffOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);

        let diff = match head_tree.as_ref() {
            Some(tree) => repo
                .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                .map_err(|e| e.to_string())?,
            None => repo
                .diff_tree_to_workdir_with_index(None, Some(&mut options))
                .map_err(|e| e.to_string())?,
        };

        let mut results = Vec::new();
        for (index, delta) in diff.deltas().enumerate() {
            let old_path = delta.old_file().path();
            let new_path = delta.new_file().path();
            let display_path = new_path.or(old_path);
            let Some(display_path) = display_path else {
                continue;
            };
            let old_path_str = old_path.map(|path| path.to_string_lossy());
            let new_path_str = new_path.map(|path| path.to_string_lossy());
            let display_path_str = display_path.to_string_lossy();
            let normalized_path = normalize_git_path(&display_path_str);
            let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
            let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
            let is_image = old_image_mime.is_some() || new_image_mime.is_some();

            if is_image {
                let is_deleted = delta.status() == git2::Delta::Deleted;
                let is_added = delta.status() == git2::Delta::Added;

                let old_image_data = if !is_added && old_image_mime.is_some() {
                    head_tree
                        .as_ref()
                        .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                        .and_then(|entry| repo.find_blob(entry.id()).ok())
                        .and_then(blob_to_base64)
                } else {
                    None
                };

                let new_image_data = if !is_deleted && new_image_mime.is_some() {
                    match new_path {
                        Some(path) => {
                            let full_path = repo_root.join(path);
                            read_image_base64(&full_path)
                        }
                        None => None,
                    }
                } else {
                    None
                };

                results.push(GitFileDiff {
                    path: normalized_path,
                    diff: String::new(),
                    is_binary: true,
                    is_image: true,
                    old_image_data,
                    new_image_data,
                    old_image_mime: old_image_mime.map(str::to_string),
                    new_image_mime: new_image_mime.map(str::to_string),
                });
                continue;
            }

            let patch = match git2::Patch::from_diff(&diff, index) {
                Ok(patch) => patch,
                Err(_) => continue,
            };
            let Some(mut patch) = patch else {
                continue;
            };
            let content = match diff_patch_to_string(&mut patch) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if content.trim().is_empty() {
                continue;
            }
            results.push(GitFileDiff {
                path: normalized_path,
                diff: content,
                is_binary: false,
                is_image: false,
                old_image_data: None,
                new_image_data: None,
                old_image_mime: None,
                new_image_mime: None,
            });
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn get_git_log(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let max_items = limit.unwrap_or(40);
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for oid_result in revwalk {
        oid_result.map_err(|e| e.to_string())?;
        total += 1;
    }

    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for oid_result in revwalk.take(max_items) {
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        entries.push(commit_to_entry(commit));
    }

    let mut ahead = 0usize;
    let mut behind = 0usize;
    let mut ahead_entries = Vec::new();
    let mut behind_entries = Vec::new();
    let mut upstream = None;

    if let Ok(head) = repo.head() {
        if head.is_branch() {
            if let Some(branch_name) = head.shorthand() {
                if let Ok(branch) = repo.find_branch(branch_name, BranchType::Local) {
                    if let Ok(upstream_branch) = branch.upstream() {
                        let upstream_ref = upstream_branch.get();
                        upstream = upstream_ref
                            .shorthand()
                            .map(|name| name.to_string())
                            .or_else(|| upstream_ref.name().map(|name| name.to_string()));
                        if let (Some(head_oid), Some(upstream_oid)) =
                            (head.target(), upstream_ref.target())
                        {
                            let (ahead_count, behind_count) = repo
                                .graph_ahead_behind(head_oid, upstream_oid)
                                .map_err(|e| e.to_string())?;
                            ahead = ahead_count;
                            behind = behind_count;

                            let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
                            revwalk.push(head_oid).map_err(|e| e.to_string())?;
                            revwalk.hide(upstream_oid).map_err(|e| e.to_string())?;
                            revwalk
                                .set_sorting(Sort::TIME)
                                .map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit =
                                    repo.find_commit(oid).map_err(|e| e.to_string())?;
                                ahead_entries.push(commit_to_entry(commit));
                            }

                            let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
                            revwalk.push(upstream_oid).map_err(|e| e.to_string())?;
                            revwalk.hide(head_oid).map_err(|e| e.to_string())?;
                            revwalk
                                .set_sorting(Sort::TIME)
                                .map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit =
                                    repo.find_commit(oid).map_err(|e| e.to_string())?;
                                behind_entries.push(commit_to_entry(commit));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(GitLogResponse {
        total,
        entries,
        ahead,
        behind,
        ahead_entries,
        behind_entries,
        upstream,
    })
}

#[tauri::command]
pub(crate) async fn get_git_commit_diff(
    workspace_id: String,
    sha: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommitDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let oid = git2::Oid::from_str(&sha).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit
        .parent(0)
        .ok()
        .and_then(|parent| parent.tree().ok());

    let mut options = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for (index, delta) in diff.deltas().enumerate() {
        let old_path = delta.old_file().path();
        let new_path = delta.new_file().path();
        let display_path = new_path.or(old_path);
        let Some(display_path) = display_path else {
            continue;
        };
        let old_path_str = old_path.map(|path| path.to_string_lossy());
        let new_path_str = new_path.map(|path| path.to_string_lossy());
        let display_path_str = display_path.to_string_lossy();
        let normalized_path = normalize_git_path(&display_path_str);
        let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
        let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
        let is_image = old_image_mime.is_some() || new_image_mime.is_some();

        if is_image {
            let is_deleted = delta.status() == git2::Delta::Deleted;
            let is_added = delta.status() == git2::Delta::Added;

            let old_image_data = if !is_added && old_image_mime.is_some() {
                parent_tree
                    .as_ref()
                    .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            let new_image_data = if !is_deleted && new_image_mime.is_some() {
                new_path
                    .and_then(|path| commit_tree.get_path(path).ok())
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            results.push(GitCommitDiff {
                path: normalized_path,
                status: status_for_delta(delta.status()).to_string(),
                diff: String::new(),
                is_binary: true,
                is_image: true,
                old_image_data,
                new_image_data,
                old_image_mime: old_image_mime.map(str::to_string),
                new_image_mime: new_image_mime.map(str::to_string),
            });
            continue;
        }

        let patch = match git2::Patch::from_diff(&diff, index) {
            Ok(patch) => patch,
            Err(_) => continue,
        };
        let Some(mut patch) = patch else {
            continue;
        };
        let content = match diff_patch_to_string(&mut patch) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if content.trim().is_empty() {
            continue;
        }
        results.push(GitCommitDiff {
            path: normalized_path,
            status: status_for_delta(delta.status()).to_string(),
            diff: content,
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes
            .iter()
            .flatten()
            .next()
            .unwrap_or("")
            .to_string()
    };
    if name.is_empty() {
        return Ok(None);
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    Ok(remote.url().map(|url| url.to_string()))
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssuesResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = Command::new("gh")
        .args([
            "issue",
            "list",
            "--repo",
            &repo_name,
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let issues: Vec<GitHubIssue> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:issue is:open");
    let search_query = search_query.replace(' ', "+");
    let total = match Command::new("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(issues.len()),
        _ => issues.len(),
    };

    Ok(GitHubIssuesResponse { total, issues })
}

#[tauri::command]
pub(crate) async fn get_github_pull_requests(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestsResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = Command::new("gh")
        .args([
            "pr",
            "list",
            "--repo",
            &repo_name,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt,createdAt,body,headRefName,baseRefName,isDraft,author",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let pull_requests: Vec<GitHubPullRequest> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:pr is:open");
    let search_query = search_query.replace(' ', "+");
    let total = match Command::new("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(pull_requests.len()),
        _ => pull_requests.len(),
    };

    Ok(GitHubPullRequestsResponse {
        total,
        pull_requests,
    })
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_diff(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = Command::new("gh")
        .args([
            "pr",
            "diff",
            &pr_number.to_string(),
            "--repo",
            &repo_name,
            "--color",
            "never",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_pr_diff(&diff_text))
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_comments(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let comments_endpoint =
        format!("/repos/{repo_name}/issues/{pr_number}/comments?per_page=30");
    let jq_filter = r#"[.[] | {id, body, createdAt: .created_at, url: .html_url, author: (if .user then {login: .user.login} else null end)}]"#;

    let output = Command::new("gh")
        .args(["api", &comments_endpoint, "--jq", jq_filter])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let comments: Vec<GitHubPullRequestComment> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    Ok(comments)
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
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

#[tauri::command]
pub(crate) async fn checkout_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    checkout_branch(&repo, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn create_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let target = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&name, &target, false)
        .map_err(|e| e.to_string())?;
    checkout_branch(&repo, &name).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_temp_repo() -> (PathBuf, Repository) {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create temp repo root");
        let repo = Repository::init(&root).expect("init repo");
        (root, repo)
    }

    #[test]
    fn collect_workspace_diff_prefers_staged_changes() {
        let (root, repo) = create_temp_repo();
        let file_path = root.join("staged.txt");
        fs::write(&file_path, "staged\n").expect("write staged file");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("staged.txt")).expect("add path");
        index.write().expect("write index");

        let diff = collect_workspace_diff(&root).expect("collect diff");
        assert!(diff.contains("staged.txt"));
        assert!(diff.contains("staged"));
    }

    #[test]
    fn collect_workspace_diff_falls_back_to_workdir() {
        let (root, _repo) = create_temp_repo();
        let file_path = root.join("unstaged.txt");
        fs::write(&file_path, "unstaged\n").expect("write unstaged file");

        let diff = collect_workspace_diff(&root).expect("collect diff");
        assert!(diff.contains("unstaged.txt"));
        assert!(diff.contains("unstaged"));
    }

    #[test]
    fn action_paths_for_file_expands_renames() {
        let (root, repo) = create_temp_repo();
        fs::write(root.join("a.txt"), "hello\n").expect("write file");

        let mut index = repo.index().expect("repo index");
        index
            .add_path(Path::new("a.txt"))
            .expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig =
            git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        fs::rename(root.join("a.txt"), root.join("b.txt")).expect("rename file");

        // Stage the rename so libgit2 reports it as an INDEX_RENAMED entry.
        let mut index = repo.index().expect("repo index");
        index
            .remove_path(Path::new("a.txt"))
            .expect("remove old path");
        index
            .add_path(Path::new("b.txt"))
            .expect("add new path");
        index.write().expect("write index");

        let paths = action_paths_for_file(&root, "b.txt");
        assert_eq!(paths, vec!["a.txt".to_string(), "b.txt".to_string()]);
    }
}
