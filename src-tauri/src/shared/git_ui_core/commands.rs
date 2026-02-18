use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use git2::{BranchType, Repository, Status, StatusOptions};
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::git_utils::{
    checkout_branch, list_git_roots as scan_git_roots, parse_github_repo, resolve_git_root,
};
use crate::shared::git_core;
use crate::shared::process_core::tokio_command;
use crate::types::{BranchInfo, GitSelectionApplyResult, GitSelectionLine, WorkspaceEntry};
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

async fn run_gh_command(repo_root: &Path, args: &[&str]) -> Result<(String, String), String> {
    let output = tokio_command("gh")
        .args(args)
        .current_dir(repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        return Ok((stdout, stderr));
    }

    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        return Err("GitHub CLI command failed.".to_string());
    }
    Err(detail.to_string())
}

async fn gh_stdout_trim(repo_root: &Path, args: &[&str]) -> Result<String, String> {
    let (stdout, _) = run_gh_command(repo_root, args).await?;
    Ok(stdout.trim().to_string())
}

async fn gh_git_protocol(repo_root: &Path) -> String {
    gh_stdout_trim(repo_root, &["config", "get", "git_protocol"])
        .await
        .unwrap_or_else(|_| "https".to_string())
}

fn count_effective_dir_entries(root: &Path) -> Result<usize, String> {
    let entries = fs::read_dir(root).map_err(|err| format!("Failed to read directory: {err}"))?;
    let mut count = 0usize;
    for entry in entries {
        let entry = entry.map_err(|err| {
            format!(
                "Failed to read directory entry in {}: {err}",
                root.display()
            )
        })?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == ".git" || name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }
        count += 1;
    }
    Ok(count)
}

fn validate_branch_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("Branch name cannot be '.' or '..'.".to_string());
    }
    if trimmed.chars().any(|ch| ch.is_whitespace()) {
        return Err("Branch name cannot contain spaces.".to_string());
    }
    if trimmed.starts_with('/') || trimmed.ends_with('/') {
        return Err("Branch name cannot start or end with '/'.".to_string());
    }
    if trimmed.contains("//") {
        return Err("Branch name cannot contain '//'.".to_string());
    }
    if trimmed.ends_with(".lock") {
        return Err("Branch name cannot end with '.lock'.".to_string());
    }
    if trimmed.contains("..") {
        return Err("Branch name cannot contain '..'.".to_string());
    }
    if trimmed.contains("@{") {
        return Err("Branch name cannot contain '@{'.".to_string());
    }
    let invalid_chars = ['~', '^', ':', '?', '*', '[', '\\'];
    if trimmed.chars().any(|ch| invalid_chars.contains(&ch)) {
        return Err("Branch name contains invalid characters.".to_string());
    }
    if trimmed.ends_with('.') {
        return Err("Branch name cannot end with '.'.".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_github_repo_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Repository name is required.".to_string());
    }
    if trimmed.chars().any(|ch| ch.is_whitespace()) {
        return Err("Repository name cannot contain spaces.".to_string());
    }
    if trimmed.starts_with('/') || trimmed.ends_with('/') {
        return Err("Repository name cannot start or end with '/'.".to_string());
    }
    if trimmed.contains("//") {
        return Err("Repository name cannot contain '//'.".to_string());
    }
    Ok(trimmed.to_string())
}

fn github_repo_exists_message(lower: &str) -> bool {
    lower.contains("already exists")
        || lower.contains("name already exists")
        || lower.contains("has already been taken")
        || lower.contains("repository with this name already exists")
}

fn normalize_repo_full_name(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("https://github.com/")
        .trim_start_matches("http://github.com/")
        .trim_start_matches("git@github.com:")
        .trim_end_matches(".git")
        .trim_end_matches('/')
        .to_string()
}

pub(super) fn validate_normalized_repo_name(value: &str) -> Result<String, String> {
    let normalized = normalize_repo_full_name(value);
    if normalized.is_empty() {
        return Err(
            "Repository name is empty after normalization. Use 'repo' or 'owner/repo'.".to_string(),
        );
    }
    Ok(normalized)
}

pub(super) fn github_repo_names_match(existing: &str, requested: &str) -> bool {
    normalize_repo_full_name(existing).eq_ignore_ascii_case(&normalize_repo_full_name(requested))
}

fn git_remote_url(repo_root: &Path, remote_name: &str) -> Option<String> {
    let repo = Repository::open(repo_root).ok()?;
    let remote = repo.find_remote(remote_name).ok()?;
    remote.url().map(|url| url.to_string())
}

fn gh_repo_create_args<'a>(
    full_name: &'a str,
    visibility_flag: &'a str,
    origin_exists: bool,
) -> Vec<&'a str> {
    if origin_exists {
        vec!["repo", "create", full_name, visibility_flag]
    } else {
        vec![
            "repo",
            "create",
            full_name,
            visibility_flag,
            "--source=.",
            "--remote=origin",
        ]
    }
}

async fn ensure_github_repo_exists(
    repo_root: &Path,
    full_name: &str,
    visibility_flag: &str,
    origin_exists: bool,
) -> Result<(), String> {
    // If origin already exists, verify the remote repository is reachable first.
    // This covers the common retry case where origin is preconfigured but the
    // GitHub repository itself has not been created yet.
    if origin_exists
        && run_gh_command(
            repo_root,
            &["repo", "view", full_name, "--json", "name", "--jq", ".name"],
        )
        .await
        .is_ok()
    {
        return Ok(());
    }

    let create_args = gh_repo_create_args(full_name, visibility_flag, origin_exists);
    if let Err(error) = run_gh_command(repo_root, &create_args).await {
        let lower = error.to_lowercase();
        if !github_repo_exists_message(&lower) {
            return Err(error);
        }
    }
    Ok(())
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SelectionLineType {
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct SelectionLineKey {
    line_type: SelectionLineType,
    old_line: Option<usize>,
    new_line: Option<usize>,
    text: String,
}

impl TryFrom<&GitSelectionLine> for SelectionLineKey {
    type Error = String;

    fn try_from(value: &GitSelectionLine) -> Result<Self, Self::Error> {
        let line_type = match value.line_type.as_str() {
            "add" => SelectionLineType::Add,
            "del" => SelectionLineType::Del,
            _ => {
                return Err(format!(
                    "Unsupported selection line type `{}`. Expected `add` or `del`.",
                    value.line_type
                ));
            }
        };
        if line_type == SelectionLineType::Add && value.new_line.is_none() {
            return Err("Selected `add` line is missing `newLine`.".to_string());
        }
        if line_type == SelectionLineType::Del && value.old_line.is_none() {
            return Err("Selected `del` line is missing `oldLine`.".to_string());
        }
        Ok(Self {
            line_type,
            old_line: value.old_line,
            new_line: value.new_line,
            text: value.text.clone(),
        })
    }
}

#[derive(Debug, Clone)]
struct ParsedPatchLine {
    line_type: SelectionLineType,
    old_line: Option<usize>,
    new_line: Option<usize>,
    old_anchor: usize,
    new_anchor: usize,
    text: String,
}

#[derive(Debug, Clone)]
struct ParsedPatchHunk {
    lines: Vec<ParsedPatchLine>,
}

#[derive(Debug, Clone)]
struct ParsedPatch {
    headers: Vec<String>,
    hunks: Vec<ParsedPatchHunk>,
}

fn parse_hunk_range(raw: &str) -> Option<(usize, usize)> {
    if let Some((start, count)) = raw.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((raw.parse().ok()?, 1))
    }
}

fn parse_hunk_header(line: &str) -> Option<(usize, usize, usize, usize)> {
    let suffix = line.strip_prefix("@@ -")?;
    let (old_range_raw, rest) = suffix.split_once(" +")?;
    let marker_index = rest.find(" @@")?;
    let new_range_raw = &rest[..marker_index];
    let (old_start, old_count) = parse_hunk_range(old_range_raw)?;
    let (new_start, new_count) = parse_hunk_range(new_range_raw)?;
    Some((old_start, old_count, new_start, new_count))
}

fn parse_zero_context_patch(diff_patch: &str) -> Result<ParsedPatch, String> {
    let lines: Vec<&str> = diff_patch.lines().collect();
    if lines.is_empty() {
        return Err("No patch content to apply.".to_string());
    }

    let mut headers = Vec::new();
    let mut hunks = Vec::new();
    let mut index = 0usize;

    while index < lines.len() {
        let line = lines[index];
        if let Some((old_start, _old_count, new_start, _new_count)) = parse_hunk_header(line) {
            let mut old_cursor = old_start;
            let mut new_cursor = new_start;
            let mut parsed_lines = Vec::new();
            let mut inner_index = index + 1;
            while inner_index < lines.len() {
                let body_line = lines[inner_index];
                if parse_hunk_header(body_line).is_some() || body_line.starts_with("diff --git ") {
                    break;
                }

                if let Some(text) = body_line.strip_prefix('+') {
                    if !body_line.starts_with("+++") {
                        parsed_lines.push(ParsedPatchLine {
                            line_type: SelectionLineType::Add,
                            old_line: None,
                            new_line: Some(new_cursor),
                            old_anchor: old_cursor,
                            new_anchor: new_cursor,
                            text: text.to_string(),
                        });
                        new_cursor += 1;
                    }
                } else if let Some(text) = body_line.strip_prefix('-') {
                    if !body_line.starts_with("---") {
                        parsed_lines.push(ParsedPatchLine {
                            line_type: SelectionLineType::Del,
                            old_line: Some(old_cursor),
                            new_line: None,
                            old_anchor: old_cursor,
                            new_anchor: new_cursor,
                            text: text.to_string(),
                        });
                        old_cursor += 1;
                    }
                } else if body_line.starts_with(' ') {
                    old_cursor += 1;
                    new_cursor += 1;
                }
                inner_index += 1;
            }
            if !parsed_lines.is_empty() {
                hunks.push(ParsedPatchHunk { lines: parsed_lines });
            }
            index = inner_index;
            continue;
        }

        if hunks.is_empty() {
            headers.push(line.to_string());
        }
        index += 1;
    }

    if headers.is_empty() || hunks.is_empty() {
        return Err("Could not parse diff hunks for line selection.".to_string());
    }

    Ok(ParsedPatch { headers, hunks })
}

fn build_selected_patch(
    diff_patch: &str,
    selected_lines: &HashSet<SelectionLineKey>,
) -> Result<(String, usize), String> {
    let parsed = parse_zero_context_patch(diff_patch)?;
    let mut output = parsed.headers.clone();
    let mut applied_line_count = 0usize;

    for hunk in &parsed.hunks {
        let mut group: Vec<&ParsedPatchLine> = Vec::new();
        let flush_group = |group: &mut Vec<&ParsedPatchLine>, output: &mut Vec<String>| {
            if group.is_empty() {
                return;
            }
            let first = group[0];
            let old_count = group
                .iter()
                .filter(|line| line.line_type == SelectionLineType::Del)
                .count();
            let new_count = group
                .iter()
                .filter(|line| line.line_type == SelectionLineType::Add)
                .count();
            output.push(format!(
                "@@ -{},{} +{},{} @@",
                first.old_anchor, old_count, first.new_anchor, new_count
            ));
            for line in group.iter() {
                let prefix = if line.line_type == SelectionLineType::Add {
                    '+'
                } else {
                    '-'
                };
                output.push(format!("{prefix}{}", line.text));
            }
            group.clear();
        };

        for line in &hunk.lines {
            let key = SelectionLineKey {
                line_type: line.line_type,
                old_line: line.old_line,
                new_line: line.new_line,
                text: line.text.clone(),
            };
            if selected_lines.contains(&key) {
                group.push(line);
                applied_line_count += 1;
            } else {
                flush_group(&mut group, &mut output);
            }
        }
        flush_group(&mut group, &mut output);
    }

    if applied_line_count == 0 {
        return Err("Selected lines do not match the current diff. Refresh and try again.".to_string());
    }

    let mut patch = output.join("\n");
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    Ok((patch, applied_line_count))
}

async fn apply_cached_patch(repo_root: &Path, patch: &str, reverse: bool) -> Result<(), String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut args = vec![
        "apply",
        "--cached",
        "--unidiff-zero",
        "--whitespace=nowarn",
    ];
    if reverse {
        args.push("--reverse");
    }
    args.push("-");

    let mut child = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
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
    Err(detail.to_string())
}

pub(super) async fn stage_git_selection_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
    op: String,
    source: String,
    lines: Vec<GitSelectionLine>,
) -> Result<GitSelectionApplyResult, String> {
    if lines.is_empty() {
        return Err("No selected lines provided.".to_string());
    }

    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let action_paths = action_paths_for_file(&repo_root, &path);
    if action_paths.len() != 1 {
        return Err("Line-level stage/unstage for renamed paths is not supported yet.".to_string());
    }
    let action_path = action_paths[0].clone();

    let (diff_args, reverse_apply): (&[&str], bool) = match (op.as_str(), source.as_str()) {
        ("stage", "unstaged") => (&["diff", "--no-color", "-U0", "--"], false),
        ("unstage", "staged") => (&["diff", "--cached", "--no-color", "-U0", "--"], true),
        ("stage", "staged") => {
            return Err("Staging selected lines requires source `unstaged`.".to_string());
        }
        ("unstage", "unstaged") => {
            return Err("Unstaging selected lines requires source `staged`.".to_string());
        }
        _ => {
            return Err("Invalid stage selection request. Expected op/source to be stage+unstaged or unstage+staged.".to_string());
        }
    };

    let mut args = diff_args.to_vec();
    args.push(action_path.as_str());
    let source_patch = String::from_utf8_lossy(&git_core::run_git_diff(
        &repo_root.to_path_buf(),
        &args,
    )
    .await?)
    .to_string();
    if source_patch.trim().is_empty() {
        return Err("No changes available for the requested selection source.".to_string());
    }

    let mut selected_lines = HashSet::new();
    for line in &lines {
        selected_lines.insert(SelectionLineKey::try_from(line)?);
    }

    let (selected_patch, applied_line_count) = build_selected_patch(&source_patch, &selected_lines)?;
    apply_cached_patch(&repo_root, &selected_patch, reverse_apply).await?;

    Ok(GitSelectionApplyResult {
        applied: true,
        applied_line_count,
        warning: None,
    })
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

pub(super) async fn init_git_repo_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    branch: String,
    force: bool,
) -> Result<Value, String> {
    const INITIAL_COMMIT_MESSAGE: &str = "Initial commit";

    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let branch = validate_branch_name(&branch)?;

    if Repository::open(&repo_root).is_ok() {
        return Ok(json!({ "status": "already_initialized" }));
    }

    if !force {
        let entry_count = count_effective_dir_entries(&repo_root)?;
        if entry_count > 0 {
            return Ok(json!({ "status": "needs_confirmation", "entryCount": entry_count }));
        }
    }

    let init_with_branch =
        run_git_command(&repo_root, &["init", "--initial-branch", branch.as_str()]).await;

    if let Err(error) = init_with_branch {
        let lower = error.to_lowercase();
        let unsupported = lower.contains("initial-branch")
            && (lower.contains("unknown option")
                || lower.contains("unrecognized option")
                || lower.contains("unknown switch")
                || lower.contains("usage:"));
        if !unsupported {
            return Err(error);
        }

        run_git_command(&repo_root, &["init"]).await?;
        let head_ref = format!("refs/heads/{branch}");
        run_git_command(&repo_root, &["symbolic-ref", "HEAD", head_ref.as_str()]).await?;
    }

    let commit_error = match run_git_command(&repo_root, &["add", "-A"]).await {
        Ok(()) => match run_git_command(
            &repo_root,
            &["commit", "--allow-empty", "-m", INITIAL_COMMIT_MESSAGE],
        )
        .await
        {
            Ok(()) => None,
            Err(err) => Some(err),
        },
        Err(err) => Some(err),
    };

    if let Some(commit_error) = commit_error {
        return Ok(json!({ "status": "initialized", "commitError": commit_error }));
    }

    Ok(json!({ "status": "initialized" }))
}

pub(super) async fn create_github_repo_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    repo: String,
    visibility: String,
    branch: Option<String>,
) -> Result<Value, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = validate_normalized_repo_name(&validate_github_repo_name(&repo)?)?;

    let visibility_flag = match visibility.trim() {
        "private" => "--private",
        "public" => "--public",
        other => return Err(format!("Invalid repo visibility: {other}")),
    };

    let local_repo = Repository::open(&repo_root)
        .map_err(|_| "Git is not initialized in this folder yet.".to_string())?;
    let origin_url_before = local_repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(|url| url.to_string()));

    let full_name = if repo.contains('/') {
        repo
    } else {
        let owner = gh_stdout_trim(&repo_root, &["api", "user", "--jq", ".login"]).await?;
        if owner.trim().is_empty() {
            return Err("Failed to determine GitHub username.".to_string());
        }
        format!("{owner}/{repo}")
    };

    if let Some(origin_url) = origin_url_before.as_deref() {
        let existing_repo = parse_github_repo(origin_url).ok_or_else(|| {
            "Origin remote is not a GitHub repository. Remove or reconfigure origin before creating a GitHub remote."
                .to_string()
        })?;
        if !github_repo_names_match(&existing_repo, &full_name) {
            return Err(format!(
                "Origin remote already points to '{existing_repo}', but '{full_name}' was requested. Remove or reconfigure origin to continue."
            ));
        }
    }

    ensure_github_repo_exists(
        &repo_root,
        &full_name,
        visibility_flag,
        origin_url_before.is_some(),
    )
    .await?;

    if git_remote_url(&repo_root, "origin").is_none() {
        let protocol = gh_git_protocol(&repo_root).await;
        let jq_field = if protocol.trim() == "ssh" {
            ".sshUrl"
        } else {
            ".httpsUrl"
        };
        let remote_url = gh_stdout_trim(
            &repo_root,
            &[
                "repo",
                "view",
                &full_name,
                "--json",
                "sshUrl,httpsUrl",
                "--jq",
                jq_field,
            ],
        )
        .await?;
        if remote_url.trim().is_empty() {
            return Err("Failed to resolve GitHub remote URL.".to_string());
        }
        run_git_command(&repo_root, &["remote", "add", "origin", remote_url.trim()]).await?;
    }

    let remote_url = git_remote_url(&repo_root, "origin");
    let push_result = run_git_command(&repo_root, &["push", "-u", "origin", "HEAD"]).await;

    let default_branch = if let Some(branch) = branch {
        Some(validate_branch_name(&branch)?)
    } else {
        let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
        let head = repo.head().ok();
        let name = head
            .as_ref()
            .filter(|head| head.is_branch())
            .and_then(|head| head.shorthand())
            .map(str::to_string);
        name.and_then(|name| validate_branch_name(&name).ok())
    };

    let default_branch_result = if let Some(branch) = default_branch.as_deref() {
        run_gh_command(
            &repo_root,
            &[
                "api",
                "-X",
                "PATCH",
                &format!("/repos/{full_name}"),
                "-f",
                &format!("default_branch={branch}"),
            ],
        )
        .await
        .map(|_| ())
    } else {
        Ok(())
    };

    let push_error = push_result.err();
    let default_branch_error = default_branch_result.err();

    if push_error.is_some() || default_branch_error.is_some() {
        return Ok(json!({
            "status": "partial",
            "repo": full_name,
            "remoteUrl": remote_url,
            "pushError": push_error,
            "defaultBranchError": default_branch_error,
        }));
    }

    Ok(json!({
        "status": "ok",
        "repo": full_name,
        "remoteUrl": remote_url,
    }))
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

#[cfg(test)]
mod tests {
    use super::{gh_repo_create_args, validate_branch_name};

    #[test]
    fn validate_branch_name_rejects_repeated_slashes() {
        assert_eq!(
            validate_branch_name("feature//oops"),
            Err("Branch name cannot contain '//'.".to_string())
        );
    }

    #[test]
    fn gh_repo_create_args_include_source_remote_when_origin_missing() {
        assert_eq!(
            gh_repo_create_args("owner/repo", "--private", false),
            vec![
                "repo",
                "create",
                "owner/repo",
                "--private",
                "--source=.",
                "--remote=origin"
            ]
        );
    }

    #[test]
    fn gh_repo_create_args_omit_source_remote_when_origin_exists() {
        assert_eq!(
            gh_repo_create_args("owner/repo", "--public", true),
            vec!["repo", "create", "owner/repo", "--public"]
        );
    }
}
