use std::collections::HashMap;

use git2::{BranchType, Repository, Sort};
use tokio::sync::Mutex;

use crate::git_utils::{commit_to_entry, resolve_git_root};
use crate::types::{GitLogEntry, GitLogResponse, WorkspaceEntry};

use super::commands::{
    git_remote_url, normalize_repository_access_error, normalized_repo_root_for_safe_directory,
    prefer_safe_git_cli_repo_access,
};
use super::context::workspace_entry_for_id;

fn parse_git_log_entries(stdout: &str) -> Vec<GitLogEntry> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\u{1f}');
            let sha = parts.next()?.trim();
            let summary = parts.next()?.trim();
            let author = parts.next()?.trim();
            let timestamp = parts.next()?.trim().parse::<i64>().ok()?;
            if sha.is_empty() {
                return None;
            }
            Some(GitLogEntry {
                sha: sha.to_string(),
                summary: summary.to_string(),
                author: author.to_string(),
                timestamp,
            })
        })
        .collect()
}

async fn git_log_entries(
    repo_root: &std::path::Path,
    range: Option<&str>,
    limit: usize,
) -> Result<Vec<GitLogEntry>, String> {
    let git_bin =
        crate::utils::resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let safe_directory = format!(
        "safe.directory={}",
        normalized_repo_root_for_safe_directory(repo_root)
    );
    let mut command = crate::shared::process_core::tokio_command(git_bin);
    command.arg("-c").arg(&safe_directory).arg("log");
    if let Some(range) = range {
        command.arg(range);
    }
    let output = command
        .arg("--format=%H%x1f%s%x1f%an%x1f%ct")
        .arg("-n")
        .arg(limit.to_string())
        .current_dir(repo_root)
        .env("PATH", crate::utils::git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        });
    }
    Ok(parse_git_log_entries(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

async fn git_count(repo_root: &std::path::Path, args: &[&str]) -> Result<usize, String> {
    let git_bin =
        crate::utils::resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = crate::shared::process_core::tokio_command(git_bin)
        .arg("-c")
        .arg(format!(
            "safe.directory={}",
            normalized_repo_root_for_safe_directory(repo_root)
        ))
        .args(args)
        .current_dir(repo_root)
        .env("PATH", crate::utils::git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<usize>()
        .unwrap_or(0))
}

pub(super) async fn get_git_log_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    limit: Option<usize>,
) -> Result<GitLogResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let max_items = limit.unwrap_or(40);

    if prefer_safe_git_cli_repo_access() {
        let total = git_count(&repo_root, &["rev-list", "--count", "HEAD"]).await?;
        let entries = git_log_entries(&repo_root, None, max_items).await?;
        let upstream = match crate::utils::resolve_git_binary() {
            Ok(git_bin) => {
                let output = crate::shared::process_core::tokio_command(git_bin)
                    .arg("-c")
                    .arg(format!(
                        "safe.directory={}",
                        normalized_repo_root_for_safe_directory(&repo_root)
                    ))
                    .args([
                        "rev-parse",
                        "--abbrev-ref",
                        "--symbolic-full-name",
                        "@{upstream}",
                    ])
                    .current_dir(&repo_root)
                    .env("PATH", crate::utils::git_env_path())
                    .output()
                    .await
                    .ok();
                output.and_then(|output| {
                    if output.status.success() {
                        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        (!value.is_empty()).then_some(value)
                    } else {
                        None
                    }
                })
            }
            Err(_) => None,
        };
        let ahead = git_count(&repo_root, &["rev-list", "--count", "@{upstream}..HEAD"])
            .await
            .unwrap_or(0);
        let behind = git_count(&repo_root, &["rev-list", "--count", "HEAD..@{upstream}"])
            .await
            .unwrap_or(0);
        let ahead_entries = git_log_entries(&repo_root, Some("@{upstream}..HEAD"), max_items)
            .await
            .unwrap_or_default();
        let behind_entries = git_log_entries(&repo_root, Some("HEAD..@{upstream}"), max_items)
            .await
            .unwrap_or_default();

        return Ok(GitLogResponse {
            total,
            entries,
            ahead,
            behind,
            ahead_entries,
            behind_entries,
            upstream,
        });
    }

    let repo = Repository::open(&repo_root)
        .map_err(|e| normalize_repository_access_error(&repo_root, &e.to_string()))?;
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

pub(super) async fn get_git_remote_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Option<String>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let name = super::commands::preferred_git_remote_name(&repo_root)?;
    Ok(name.and_then(|remote| git_remote_url(&repo_root, &remote)))
}
