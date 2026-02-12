use std::path::PathBuf;

use crate::shared::process_core::tokio_command;
use crate::utils::{git_env_path, resolve_git_binary};

fn format_git_error(stdout: &[u8], stderr: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let stdout = String::from_utf8_lossy(stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        "Git command failed.".to_string()
    } else {
        detail.to_string()
    }
}

pub(crate) async fn run_git_command(repo_path: &PathBuf, args: &[&str]) -> Result<String, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let output = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    Err(format_git_error(&output.stdout, &output.stderr))
}

pub(crate) async fn run_git_command_owned(
    repo_path: PathBuf,
    args_owned: Vec<String>,
) -> Result<String, String> {
    let arg_refs = args_owned
        .iter()
        .map(|value| value.as_str())
        .collect::<Vec<_>>();
    run_git_command(&repo_path, &arg_refs).await
}

pub(crate) async fn run_git_command_bytes(
    repo_path: &PathBuf,
    args: &[&str],
) -> Result<Vec<u8>, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let output = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    Err(format_git_error(&output.stdout, &output.stderr))
}

pub(crate) async fn run_git_diff(repo_path: &PathBuf, args: &[&str]) -> Result<Vec<u8>, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let output = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    if output.status.success() || output.status.code() == Some(1) {
        return Ok(output.stdout);
    }
    Err(format_git_error(&output.stdout, &output.stderr))
}

pub(crate) fn is_missing_worktree_error(error: &str) -> bool {
    error.contains("is not a working tree")
}

pub(crate) async fn git_branch_exists(repo_path: &PathBuf, branch: &str) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let status = tokio_command(git_bin)
        .args(["show-ref", "--verify", &format!("refs/heads/{branch}")])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    Ok(status.success())
}

pub(crate) async fn git_remote_exists(repo_path: &PathBuf, remote: &str) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let status = tokio_command(git_bin)
        .args(["remote", "get-url", remote])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    Ok(status.success())
}

pub(crate) async fn git_remote_branch_exists_live(
    repo_path: &PathBuf,
    remote: &str,
    branch: &str,
) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let output = tokio_command(git_bin)
        .args([
            "ls-remote",
            "--heads",
            remote,
            &format!("refs/heads/{branch}"),
        ])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    if output.status.success() {
        return Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty());
    }
    Err(format_git_error(&output.stdout, &output.stderr))
}

// Used by daemon-only worktree orchestration paths.
#[allow(dead_code)]
pub(crate) async fn git_remote_branch_exists_local(
    repo_path: &PathBuf,
    remote: &str,
    branch: &str,
) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|err| format!("Failed to run git: {err}"))?;
    let status = tokio_command(git_bin)
        .args([
            "show-ref",
            "--verify",
            &format!("refs/remotes/{remote}/{branch}"),
        ])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|err| format!("Failed to run git: {err}"))?;
    Ok(status.success())
}

pub(crate) async fn git_list_remotes(repo_path: &PathBuf) -> Result<Vec<String>, String> {
    let output = run_git_command(repo_path, &["remote"]).await?;
    Ok(output
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

pub(crate) async fn git_find_remote_for_branch_live(
    repo_path: &PathBuf,
    branch: &str,
) -> Result<Option<String>, String> {
    if git_remote_exists(repo_path, "origin").await?
        && git_remote_branch_exists_live(repo_path, "origin", branch).await?
    {
        return Ok(Some("origin".to_string()));
    }

    for remote in git_list_remotes(repo_path).await? {
        if remote == "origin" {
            continue;
        }
        if git_remote_branch_exists_live(repo_path, &remote, branch).await? {
            return Ok(Some(remote));
        }
    }

    Ok(None)
}

// Used by daemon-only worktree orchestration paths.
#[allow(dead_code)]
pub(crate) async fn git_find_remote_tracking_branch_local(
    repo_path: &PathBuf,
    branch: &str,
) -> Result<Option<String>, String> {
    if git_remote_branch_exists_local(repo_path, "origin", branch).await? {
        return Ok(Some(format!("origin/{branch}")));
    }

    for remote in git_list_remotes(repo_path).await? {
        if remote == "origin" {
            continue;
        }
        if git_remote_branch_exists_local(repo_path, &remote, branch).await? {
            return Ok(Some(format!("{remote}/{branch}")));
        }
    }

    Ok(None)
}

pub(crate) async fn unique_branch_name_live(
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
            Some(remote) => !git_remote_branch_exists_live(repo_path, remote, &candidate).await?,
            None => true,
        }
    {
        return Ok((candidate, false));
    }
    for index in 2..1000 {
        candidate = format!("{desired}-{index}");
        let local_exists = git_branch_exists(repo_path, &candidate).await?;
        let remote_exists = match remote {
            Some(remote) => git_remote_branch_exists_live(repo_path, remote, &candidate).await?,
            None => false,
        };
        if !local_exists && !remote_exists {
            return Ok((candidate, true));
        }
    }
    Err("Unable to find an available branch name.".to_string())
}

pub(crate) async fn git_get_origin_url(repo_path: &PathBuf) -> Option<String> {
    run_git_command(repo_path, &["remote", "get-url", "origin"])
        .await
        .ok()
}
