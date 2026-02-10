use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{BranchType, DiffOptions, Repository, Sort, Status, StatusOptions};
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::git_utils::{
    checkout_branch, commit_to_entry, diff_patch_to_string, diff_stats_for_path, image_mime_type,
    list_git_roots as scan_git_roots, parse_github_repo, resolve_git_root,
};
use crate::shared::process_core::tokio_command;
use crate::types::{
    AppSettings, BranchInfo, GitCommitDiff, GitFileDiff, GitFileStatus, GitHubIssue,
    GitHubIssuesResponse, GitHubPullRequest, GitHubPullRequestComment, GitHubPullRequestDiff,
    GitHubPullRequestsResponse, GitLogResponse, WorkspaceEntry,
};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};

const INDEX_SKIP_WORKTREE_FLAG: u16 = 0x4000;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_TEXT_DIFF_BYTES: usize = 2 * 1024 * 1024;

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

fn bytes_look_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0)
}

fn split_lines_preserving_newlines(content: &str) -> Vec<String> {
    if content.is_empty() {
        return Vec::new();
    }
    content
        .split_inclusive('\n')
        .map(ToString::to_string)
        .collect()
}

fn blob_to_lines(blob: git2::Blob<'_>) -> Option<Vec<String>> {
    if blob.size() > MAX_TEXT_DIFF_BYTES || blob.is_binary() {
        return None;
    }
    let content = String::from_utf8_lossy(blob.content());
    Some(split_lines_preserving_newlines(content.as_ref()))
}

fn read_text_lines(path: &Path) -> Option<Vec<String>> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_TEXT_DIFF_BYTES as u64 {
        return None;
    }
    let data = fs::read(path).ok()?;
    if bytes_look_binary(&data) {
        return None;
    }
    let content = String::from_utf8_lossy(&data);
    Some(split_lines_preserving_newlines(content.as_ref()))
}

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

fn has_ignored_parent_directory(repo: &Repository, path: &Path) -> bool {
    let mut current = path.parent();
    while let Some(parent) = current {
        if parent.as_os_str().is_empty() {
            break;
        }
        let probe = parent.join(".codexmonitor-ignore-probe");
        if repo.status_should_ignore(&probe).unwrap_or(false) {
            return true;
        }
        current = parent.parent();
    }
    false
}

fn collect_ignored_paths_with_git(repo: &Repository, paths: &[PathBuf]) -> Option<HashSet<PathBuf>> {
    if paths.is_empty() {
        return Some(HashSet::new());
    }

    let repo_root = repo.workdir()?;
    let git_bin = resolve_git_binary().ok()?;
    let mut child = std::process::Command::new(git_bin)
        .arg("check-ignore")
        .arg("--stdin")
        .arg("-z")
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let mut stdout = child.stdout.take()?;
    let stdout_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        stdout.read_to_end(&mut buffer).ok()?;
        Some(buffer)
    });

    let wrote_all_input = {
        let mut wrote_all = true;
        if let Some(mut stdin) = child.stdin.take() {
            for path in paths {
                if stdin
                    .write_all(path.as_os_str().as_encoded_bytes())
                    .is_err()
                {
                    wrote_all = false;
                    break;
                }
                if stdin.write_all(&[0]).is_err() {
                    wrote_all = false;
                    break;
                }
            }
        } else {
            wrote_all = false;
        }
        wrote_all
    };

    if !wrote_all_input {
        let _ = child.kill();
        let _ = child.wait();
        let _ = stdout_thread.join();
        return None;
    }

    let status = child.wait().ok()?;
    let stdout = stdout_thread.join().ok().flatten()?;
    match status.code() {
        Some(0) | Some(1) => {}
        _ => return None,
    }

    let mut ignored_paths = HashSet::new();
    for raw in stdout.split(|byte| *byte == 0) {
        if raw.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw);
        ignored_paths.insert(PathBuf::from(path.as_ref()));
    }
    Some(ignored_paths)
}

fn check_ignore_with_git(repo: &Repository, path: &Path) -> Option<bool> {
    let ignored_paths = collect_ignored_paths_with_git(repo, &[path.to_path_buf()])?;
    Some(ignored_paths.contains(path))
}

fn is_tracked_path(repo: &Repository, path: &Path) -> bool {
    if let Ok(index) = repo.index() {
        if index.get_path(path, 0).is_some() {
            return true;
        }
    }
    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            if tree.get_path(path).is_ok() {
                return true;
            }
        }
    }
    false
}

fn should_skip_ignored_path_with_cache(
    repo: &Repository,
    path: &Path,
    ignored_paths: Option<&HashSet<PathBuf>>,
) -> bool {
    if is_tracked_path(repo, path) {
        return false;
    }
    if let Some(ignored_paths) = ignored_paths {
        return ignored_paths.contains(path);
    }
    if let Some(ignored) = check_ignore_with_git(repo, path) {
        return ignored;
    }
    // Fallback when git check-ignore is unavailable.
    repo.status_should_ignore(path).unwrap_or(false) || has_ignored_parent_directory(repo, path)
}

fn build_combined_diff(repo: &Repository, diff: &git2::Diff) -> String {
    let diff_entries: Vec<(usize, PathBuf)> = diff
        .deltas()
        .enumerate()
        .filter_map(|(index, delta)| {
            delta.new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|path| (index, path.to_path_buf()))
        })
        .collect();
    let diff_paths: Vec<PathBuf> = diff_entries.iter().map(|(_, path)| path.clone()).collect();
    let ignored_paths = collect_ignored_paths_with_git(repo, &diff_paths);

    let mut combined_diff = String::new();
    for (index, path) in diff_entries {
        if should_skip_ignored_path_with_cache(repo, &path, ignored_paths.as_ref()) {
            continue;
        }
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
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

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
    let combined_diff = build_combined_diff(&repo, &diff);
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
    Ok(build_combined_diff(&repo, &diff))
}

fn github_repo_from_path(path: &Path) -> Result<String, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes.iter().flatten().next().unwrap_or("").to_string()
    };
    if name.is_empty() {
        return Err("No git remote configured.".to_string());
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    let remote_url = remote.url().ok_or("Remote has no URL configured.")?;
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
            new_path
                .clone()
                .or_else(|| old_path.clone())
                .unwrap_or_default()
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

async fn workspace_entry_for_id(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<WorkspaceEntry, String> {
    let workspaces = workspaces.lock().await;
    workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())
}

async fn resolve_repo_root_for_workspace(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<PathBuf, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    resolve_git_root(&entry)
}

async fn get_git_status_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
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
    let status_paths: Vec<PathBuf> = statuses
        .iter()
        .filter_map(|entry| entry.path().map(PathBuf::from))
        .filter(|path| !path.as_os_str().is_empty())
        .collect();
    let ignored_paths = collect_ignored_paths_with_git(&repo, &status_paths);

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
        if should_skip_ignored_path_with_cache(&repo, Path::new(path), ignored_paths.as_ref()) {
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
                diff_stats_for_path(&repo, head_tree.as_ref(), path, true, false).unwrap_or((0, 0));
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
                diff_stats_for_path(&repo, head_tree.as_ref(), path, false, true).unwrap_or((0, 0));
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

async fn stage_git_file_inner(
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

async fn stage_git_all_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["add", "-A"]).await
}

async fn unstage_git_file_inner(
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

async fn revert_git_file_inner(
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

async fn revert_git_all_inner(
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

async fn commit_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    message: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["commit", "-m", &message]).await
}

async fn push_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    push_with_upstream(&repo_root).await
}

async fn pull_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    pull_with_default_strategy(&repo_root).await
}

async fn fetch_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    fetch_with_default_remote(&repo_root).await
}

async fn sync_git_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    pull_with_default_strategy(&repo_root).await?;
    push_with_upstream(&repo_root).await
}

async fn list_git_roots_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    depth: Option<usize>,
) -> Result<Vec<String>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let root = PathBuf::from(&entry.path);
    let depth = depth.unwrap_or(2).clamp(1, 6);
    Ok(scan_git_roots(&root, depth, 200))
}

async fn get_git_diffs_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
) -> Result<Vec<GitFileDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let ignore_whitespace_changes = {
        let settings = app_settings.lock().await;
        settings.git_diff_ignore_whitespace_changes
    };

    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
        let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

        let mut options = DiffOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
        options.ignore_whitespace_change(ignore_whitespace_changes);

        let diff = match head_tree.as_ref() {
            Some(tree) => repo
                .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                .map_err(|e| e.to_string())?,
            None => repo
                .diff_tree_to_workdir_with_index(None, Some(&mut options))
                .map_err(|e| e.to_string())?,
        };
        let diff_paths: Vec<PathBuf> = diff
            .deltas()
            .filter_map(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
            .map(PathBuf::from)
            .collect();
        let ignored_paths = collect_ignored_paths_with_git(&repo, &diff_paths);

        let mut results = Vec::new();
        for (index, delta) in diff.deltas().enumerate() {
            let old_path = delta.old_file().path();
            let new_path = delta.new_file().path();
            let display_path = new_path.or(old_path);
            let Some(display_path) = display_path else {
                continue;
            };
            if should_skip_ignored_path_with_cache(&repo, display_path, ignored_paths.as_ref()) {
                continue;
            }
            let old_path_str = old_path.map(|path| path.to_string_lossy());
            let new_path_str = new_path.map(|path| path.to_string_lossy());
            let display_path_str = display_path.to_string_lossy();
            let normalized_path = normalize_git_path(&display_path_str);
            let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
            let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
            let is_image = old_image_mime.is_some() || new_image_mime.is_some();
            let is_deleted = delta.status() == git2::Delta::Deleted;
            let is_added = delta.status() == git2::Delta::Added;

            let old_lines = if !is_added {
                head_tree
                    .as_ref()
                    .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_lines)
            } else {
                None
            };

            let new_lines = if !is_deleted {
                match new_path {
                    Some(path) => {
                        let full_path = repo_root.join(path);
                        read_text_lines(&full_path)
                    }
                    None => None,
                }
            } else {
                None
            };

            if is_image {
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
                    old_lines: None,
                    new_lines: None,
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
                old_lines,
                new_lines,
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

async fn get_git_log_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    limit: Option<usize>,
) -> Result<GitLogResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let max_items = limit.unwrap_or(40);
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for oid_result in revwalk {
        oid_result.map_err(|e| e.to_string())?;
        total += 1;
    }

    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

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
                            revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
                                ahead_entries.push(commit_to_entry(commit));
                            }

                            let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
                            revwalk.push(upstream_oid).map_err(|e| e.to_string())?;
                            revwalk.hide(head_oid).map_err(|e| e.to_string())?;
                            revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
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

async fn get_git_commit_diff_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
    sha: String,
) -> Result<Vec<GitCommitDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;

    let ignore_whitespace_changes = {
        let settings = app_settings.lock().await;
        settings.git_diff_ignore_whitespace_changes
    };

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let oid = git2::Oid::from_str(&sha).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());

    let mut options = DiffOptions::new();
    options.ignore_whitespace_change(ignore_whitespace_changes);
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
        let is_deleted = delta.status() == git2::Delta::Deleted;
        let is_added = delta.status() == git2::Delta::Added;

        let old_lines = if !is_added {
            parent_tree
                .as_ref()
                .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                .and_then(|entry| repo.find_blob(entry.id()).ok())
                .and_then(blob_to_lines)
        } else {
            None
        };

        let new_lines = if !is_deleted {
            new_path
                .and_then(|path| commit_tree.get_path(path).ok())
                .and_then(|entry| repo.find_blob(entry.id()).ok())
                .and_then(blob_to_lines)
        } else {
            None
        };

        if is_image {
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
                old_lines: None,
                new_lines: None,
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
            old_lines,
            new_lines,
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

async fn get_git_remote_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Option<String>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes.iter().flatten().next().unwrap_or("").to_string()
    };
    if name.is_empty() {
        return Ok(None);
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    Ok(remote.url().map(|url| url.to_string()))
}

async fn get_github_issues_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubIssuesResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
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

    let search_query = format!("repo:{repo_name} is:issue is:open").replace(' ', "+");
    let total = match tokio_command("gh")
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

async fn get_github_pull_requests_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubPullRequestsResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
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

    let search_query = format!("repo:{repo_name} is:pr is:open").replace(' ', "+");
    let total = match tokio_command("gh")
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

async fn get_github_pull_request_diff_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
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

async fn get_github_pull_request_comments_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let comments_endpoint = format!("/repos/{repo_name}/issues/{pr_number}/comments?per_page=30");
    let jq_filter = r#"[.[] | {id, body, createdAt: .created_at, url: .html_url, author: (if .user then {login: .user.login} else null end)}]"#;

    let output = tokio_command("gh")
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

async fn list_git_branches_inner(
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

async fn checkout_git_branch_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    checkout_branch(&repo, &name).map_err(|e| e.to_string())
}

async fn create_git_branch_inner(
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

pub(crate) async fn resolve_repo_root_for_workspace_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<PathBuf, String> {
    resolve_repo_root_for_workspace(workspaces, workspace_id).await
}

pub(crate) fn collect_workspace_diff_core(repo_root: &Path) -> Result<String, String> {
    collect_workspace_diff(repo_root)
}

pub(crate) async fn get_git_status_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    get_git_status_inner(workspaces, workspace_id).await
}

pub(crate) async fn list_git_roots_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    depth: Option<usize>,
) -> Result<Vec<String>, String> {
    list_git_roots_inner(workspaces, workspace_id, depth).await
}

pub(crate) async fn get_git_diffs_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
) -> Result<Vec<GitFileDiff>, String> {
    get_git_diffs_inner(workspaces, app_settings, workspace_id).await
}

pub(crate) async fn get_git_log_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    limit: Option<usize>,
) -> Result<GitLogResponse, String> {
    get_git_log_inner(workspaces, workspace_id, limit).await
}

pub(crate) async fn get_git_commit_diff_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
    sha: String,
) -> Result<Vec<GitCommitDiff>, String> {
    get_git_commit_diff_inner(workspaces, app_settings, workspace_id, sha).await
}

pub(crate) async fn get_git_remote_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Option<String>, String> {
    get_git_remote_inner(workspaces, workspace_id).await
}

pub(crate) async fn stage_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    stage_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn stage_git_all_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    stage_git_all_inner(workspaces, workspace_id).await
}

pub(crate) async fn unstage_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    unstage_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn revert_git_file_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    revert_git_file_inner(workspaces, workspace_id, path).await
}

pub(crate) async fn revert_git_all_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    revert_git_all_inner(workspaces, workspace_id).await
}

pub(crate) async fn commit_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    message: String,
) -> Result<(), String> {
    commit_git_inner(workspaces, workspace_id, message).await
}

pub(crate) async fn push_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    push_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn pull_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    pull_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn fetch_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    fetch_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn sync_git_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    sync_git_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_issues_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubIssuesResponse, String> {
    get_github_issues_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_pull_requests_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubPullRequestsResponse, String> {
    get_github_pull_requests_inner(workspaces, workspace_id).await
}

pub(crate) async fn get_github_pull_request_diff_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    get_github_pull_request_diff_inner(workspaces, workspace_id, pr_number).await
}

pub(crate) async fn get_github_pull_request_comments_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    get_github_pull_request_comments_inner(workspaces, workspace_id, pr_number).await
}

pub(crate) async fn list_git_branches_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    list_git_branches_inner(workspaces, workspace_id).await
}

pub(crate) async fn checkout_git_branch_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    checkout_git_branch_inner(workspaces, workspace_id, name).await
}

pub(crate) async fn create_git_branch_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    create_git_branch_inner(workspaces, workspace_id, name).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceKind, WorkspaceSettings};
    use std::fs;
    use std::path::Path;
    use tokio::runtime::Runtime;

    fn create_temp_repo() -> (PathBuf, Repository) {
        let root =
            std::env::temp_dir().join(format!("codex-monitor-test-{}", uuid::Uuid::new_v4()));
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
        index.add_path(Path::new("a.txt")).expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        fs::rename(root.join("a.txt"), root.join("b.txt")).expect("rename file");

        let mut index = repo.index().expect("repo index");
        index
            .remove_path(Path::new("a.txt"))
            .expect("remove old path");
        index.add_path(Path::new("b.txt")).expect("add new path");
        index.write().expect("write index");

        let paths = action_paths_for_file(&root, "b.txt");
        assert_eq!(paths, vec!["a.txt".to_string(), "b.txt".to_string()]);
    }

    #[test]
    fn get_git_status_omits_global_ignored_paths() {
        let (root, repo) = create_temp_repo();
        fs::write(root.join("tracked.txt"), "tracked\n").expect("write tracked file");
        let mut index = repo.index().expect("repo index");
        index.add_path(Path::new("tracked.txt")).expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        let ignored_path = root.join("ignored_root/example/foo/bar.txt");
        fs::create_dir_all(ignored_path.parent().expect("parent")).expect("create ignored dir");
        fs::write(&ignored_path, "ignored\n").expect("write ignored file");

        let workspace = WorkspaceEntry {
            id: "w1".to_string(),
            name: "w1".to_string(),
            path: root.to_string_lossy().to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let mut entries = HashMap::new();
        entries.insert("w1".to_string(), workspace);
        let workspaces = Mutex::new(entries);

        let runtime = Runtime::new().expect("create tokio runtime");
        let status = runtime
            .block_on(get_git_status_inner(&workspaces, "w1".to_string()))
            .expect("get git status");

        let has_ignored = status
            .get("unstagedFiles")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.get("path").and_then(Value::as_str))
            .any(|path| path.starts_with("ignored_root/example/foo/bar"));
        assert!(!has_ignored, "ignored files should not appear in unstagedFiles");
    }

    #[test]
    fn get_git_diffs_omits_global_ignored_paths() {
        let (root, repo) = create_temp_repo();
        fs::write(root.join("tracked.txt"), "tracked\n").expect("write tracked file");
        let mut index = repo.index().expect("repo index");
        index.add_path(Path::new("tracked.txt")).expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        let ignored_path = root.join("ignored_root/example/foo/bar.txt");
        fs::create_dir_all(ignored_path.parent().expect("parent")).expect("create ignored dir");
        fs::write(&ignored_path, "ignored\n").expect("write ignored file");

        let workspace = WorkspaceEntry {
            id: "w1".to_string(),
            name: "w1".to_string(),
            path: root.to_string_lossy().to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let mut entries = HashMap::new();
        entries.insert("w1".to_string(), workspace);
        let workspaces = Mutex::new(entries);
        let app_settings = Mutex::new(AppSettings::default());

        let runtime = Runtime::new().expect("create tokio runtime");
        let diffs = runtime
            .block_on(get_git_diffs_inner(
                &workspaces,
                &app_settings,
                "w1".to_string(),
            ))
            .expect("get git diffs");

        let has_ignored = diffs
            .iter()
            .any(|diff| diff.path.starts_with("ignored_root/example/foo/bar"));
        assert!(!has_ignored, "ignored files should not appear in diff list");
    }

    #[test]
    fn check_ignore_with_git_respects_negated_rule_for_specific_file() {
        let (root, repo) = create_temp_repo();

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root/*\n!ignored_root/keep.txt\n")
            .expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        let kept_path = Path::new("ignored_root/keep.txt");
        assert!(
            check_ignore_with_git(&repo, kept_path) == Some(false),
            "keep.txt should be visible because of negated rule"
        );
    }

    #[test]
    fn should_skip_ignored_path_respects_negated_rule_for_specific_file() {
        let (root, repo) = create_temp_repo();

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root/*\n!ignored_root/keep.txt\n")
            .expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        assert!(
            !should_skip_ignored_path_with_cache(&repo, Path::new("ignored_root/keep.txt"), None),
            "keep.txt should not be skipped when unignored by negated rule"
        );
    }

    #[test]
    fn should_skip_ignored_path_skips_paths_with_ignored_parent() {
        let (root, repo) = create_temp_repo();

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        assert!(
            should_skip_ignored_path_with_cache(
                &repo,
                Path::new("ignored_root/example/foo/bar.txt"),
                None,
            ),
            "nested path should be skipped when parent directory is ignored"
        );
    }

    #[test]
    fn should_skip_ignored_path_keeps_tracked_file_under_ignored_parent_pattern() {
        let (root, repo) = create_temp_repo();
        let tracked_path = root.join("ignored_root/tracked.txt");
        fs::create_dir_all(tracked_path.parent().expect("parent")).expect("create tracked dir");
        fs::write(&tracked_path, "tracked\n").expect("write tracked file");
        let mut index = repo.index().expect("repo index");
        index
            .add_path(Path::new("ignored_root/tracked.txt"))
            .expect("add tracked path");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root/*\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        assert!(
            !should_skip_ignored_path_with_cache(
                &repo,
                Path::new("ignored_root/tracked.txt"),
                None,
            ),
            "tracked file should not be skipped even if ignore pattern matches its path"
        );
    }

    #[test]
    fn check_ignore_with_git_treats_tracked_file_as_not_ignored() {
        let (root, repo) = create_temp_repo();
        let tracked_path = root.join("ignored_root/tracked.txt");
        fs::create_dir_all(tracked_path.parent().expect("parent")).expect("create tracked dir");
        fs::write(&tracked_path, "tracked\n").expect("write tracked file");
        let mut index = repo.index().expect("repo index");
        index
            .add_path(Path::new("ignored_root/tracked.txt"))
            .expect("add tracked path");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root/*\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        assert_eq!(
            check_ignore_with_git(&repo, Path::new("ignored_root/tracked.txt")),
            Some(false),
            "git check-ignore should treat tracked files as not ignored"
        );
    }

    #[test]
    fn should_skip_ignored_path_respects_repo_negation_over_global_ignore() {
        let (root, repo) = create_temp_repo();

        fs::write(root.join(".gitignore"), "!keep.log\n").expect("write repo gitignore");
        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "*.log\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        assert_eq!(
            check_ignore_with_git(&repo, Path::new("keep.log")),
            Some(false),
            "repo negation should override global ignore for keep.log"
        );
        assert!(
            !should_skip_ignored_path_with_cache(&repo, Path::new("keep.log"), None),
            "keep.log should remain visible when repo .gitignore negates global ignore"
        );
    }

    #[test]
    fn collect_ignored_paths_with_git_checks_multiple_paths_in_one_call() {
        let (root, repo) = create_temp_repo();
        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        let ignored_path = PathBuf::from("ignored_root/example/foo/bar.txt");
        let visible_path = PathBuf::from("visible.txt");
        let ignored_paths = collect_ignored_paths_with_git(
            &repo,
            &[ignored_path.clone(), visible_path.clone()],
        )
        .expect("collect ignored paths");

        assert!(ignored_paths.contains(&ignored_path));
        assert!(!ignored_paths.contains(&visible_path));
    }

    #[test]
    fn collect_ignored_paths_with_git_handles_large_ignored_output() {
        let (root, repo) = create_temp_repo();
        let excludes_path = root.join("global-excludes.txt");
        fs::write(&excludes_path, "ignored_root\n").expect("write excludes file");
        let mut config = repo.config().expect("repo config");
        config
            .set_str(
                "core.excludesfile",
                excludes_path.to_string_lossy().as_ref(),
            )
            .expect("set core.excludesfile");

        let total = 6000usize;
        let paths: Vec<PathBuf> = (0..total)
            .map(|i| PathBuf::from(format!("ignored_root/deep/path/file-{i}.txt")))
            .collect();
        let ignored_paths =
            collect_ignored_paths_with_git(&repo, &paths).expect("collect ignored paths");

        assert_eq!(ignored_paths.len(), total);
    }
}
