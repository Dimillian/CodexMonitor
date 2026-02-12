use std::path::PathBuf;

use crate::shared::git_core;

pub(crate) async fn run_git_command_owned(
    repo_path: PathBuf,
    args_owned: Vec<String>,
) -> Result<String, String> {
    git_core::run_git_command_owned(repo_path, args_owned).await
}

pub(crate) fn is_missing_worktree_error(error: &str) -> bool {
    git_core::is_missing_worktree_error(error)
}

pub(crate) async fn git_branch_exists(repo_path: &PathBuf, branch: &str) -> Result<bool, String> {
    git_core::git_branch_exists(repo_path, branch).await
}

pub(crate) async fn git_remote_exists(repo_path: &PathBuf, remote: &str) -> Result<bool, String> {
    git_core::git_remote_exists(repo_path, remote).await
}

pub(crate) async fn git_remote_branch_exists(
    repo_path: &PathBuf,
    remote: &str,
    branch: &str,
) -> Result<bool, String> {
    git_core::git_remote_branch_exists_live(repo_path, remote, branch).await
}

pub(crate) async fn git_find_remote_for_branch(
    repo_path: &PathBuf,
    branch: &str,
) -> Result<Option<String>, String> {
    git_core::git_find_remote_for_branch_live(repo_path, branch).await
}

pub(crate) async fn unique_branch_name(
    repo_path: &PathBuf,
    desired: &str,
    remote: Option<&str>,
) -> Result<(String, bool), String> {
    git_core::unique_branch_name_live(repo_path, desired, remote).await
}
