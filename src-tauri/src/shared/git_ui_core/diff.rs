use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{DiffOptions, Repository, Status, StatusOptions};
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::git_utils::{
    diff_patch_to_string, diff_stats_for_path, image_mime_type, resolve_git_root,
};
use crate::shared::process_core::std_command;
use crate::types::{AppSettings, GitCommitDiff, GitFileDiff, GitFileStatus, WorkspaceEntry};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};

use super::context::workspace_entry_for_id;

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

pub(super) fn collect_ignored_paths_with_git(
    repo: &Repository,
    paths: &[PathBuf],
) -> Option<HashSet<PathBuf>> {
    if paths.is_empty() {
        return Some(HashSet::new());
    }

    let repo_root = repo.workdir()?;
    let git_bin = resolve_git_binary().ok()?;
    let mut child = std_command(git_bin)
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

pub(super) fn check_ignore_with_git(repo: &Repository, path: &Path) -> Option<bool> {
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

pub(super) fn should_skip_ignored_path_with_cache(
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
            delta
                .new_file()
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

pub(super) fn collect_workspace_diff(repo_root: &Path) -> Result<String, String> {
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

pub(super) async fn get_git_status_inner(
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

pub(super) async fn get_git_diffs_inner(
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

pub(super) async fn get_git_commit_diff_inner(
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
