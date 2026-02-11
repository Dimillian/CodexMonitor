use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::process::Stdio;

use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::git_utils::resolve_git_root;
use crate::shared::process_core::tokio_command;
use crate::shared::{git_core, worktree_core};
use crate::types::WorkspaceEntry;

pub(crate) fn run_git_command_unit<F, Fut>(
    repo_path: &PathBuf,
    args: &[&str],
    run_git_command: F,
) -> impl Future<Output = Result<(), String>>
where
    F: Fn(PathBuf, Vec<String>) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    let repo_path = repo_path.clone();
    let args_owned = args
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    async move {
        run_git_command(repo_path, args_owned)
            .await
            .map(|_output| ())
    }
}

pub(crate) async fn apply_worktree_changes_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
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

    apply_worktree_changes_inner_core(&entry, &parent).await
}

pub(super) async fn apply_worktree_changes_inner_core(
    entry: &WorkspaceEntry,
    parent: &WorkspaceEntry,
) -> Result<(), String> {
    let worktree_root = resolve_git_root(entry)?;
    let parent_root = resolve_git_root(parent)?;

    let parent_status =
        git_core::run_git_command_bytes(&parent_root, &["status", "--porcelain"]).await?;
    if !String::from_utf8_lossy(&parent_status).trim().is_empty() {
        return Err(
            "Your current branch has uncommitted changes. Please commit, stash, or discard them before applying worktree changes."
                .to_string(),
        );
    }

    let mut patch: Vec<u8> = Vec::new();
    let staged_patch = git_core::run_git_diff(
        &worktree_root,
        &["diff", "--binary", "--no-color", "--cached"],
    )
    .await?;
    patch.extend_from_slice(&staged_patch);
    let unstaged_patch =
        git_core::run_git_diff(&worktree_root, &["diff", "--binary", "--no-color"]).await?;
    patch.extend_from_slice(&unstaged_patch);

    let untracked_output = git_core::run_git_command_bytes(
        &worktree_root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )
    .await?;
    for raw_path in untracked_output.split(|byte| *byte == 0) {
        if raw_path.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw_path).to_string();
        let diff = git_core::run_git_diff(
            &worktree_root,
            &[
                "diff",
                "--binary",
                "--no-color",
                "--no-index",
                "--",
                worktree_core::null_device_path(),
                &path,
            ],
        )
        .await?;
        patch.extend_from_slice(&diff);
    }

    if String::from_utf8_lossy(&patch).trim().is_empty() {
        return Err("No changes to apply.".to_string());
    }

    let git_bin =
        crate::utils::resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut child = tokio_command(git_bin)
        .args(["apply", "--3way", "--whitespace=nowarn", "-"])
        .current_dir(&parent_root)
        .env("PATH", crate::utils::git_env_path())
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
