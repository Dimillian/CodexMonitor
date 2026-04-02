use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex as StdMutex, OnceLock};

use git2::Repository;
use serde_json::Value;
use tokio::runtime::Runtime;
use tokio::sync::Mutex;

use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};

use super::commands;
use super::diff;

fn create_temp_repo() -> (PathBuf, Repository) {
    let root = std::env::temp_dir().join(format!("codex-monitor-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).expect("create temp repo root");
    let repo = Repository::init(&root).expect("init repo");
    (root, repo)
}

fn git_cli_env_lock() -> &'static StdMutex<()> {
    static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| StdMutex::new(()))
}

#[test]
fn collect_workspace_diff_prefers_staged_changes() {
    let (root, repo) = create_temp_repo();
    let file_path = root.join("staged.txt");
    fs::write(&file_path, "staged\n").expect("write staged file");
    let mut index = repo.index().expect("index");
    index.add_path(Path::new("staged.txt")).expect("add path");
    index.write().expect("write index");

    let diff_output = diff::collect_workspace_diff(&root).expect("collect diff");
    assert!(diff_output.contains("staged.txt"));
    assert!(diff_output.contains("staged"));
}

#[test]
fn collect_workspace_diff_falls_back_to_workdir() {
    let (root, _repo) = create_temp_repo();
    let file_path = root.join("unstaged.txt");
    fs::write(&file_path, "unstaged\n").expect("write unstaged file");

    let diff_output = diff::collect_workspace_diff(&root).expect("collect diff");
    assert!(diff_output.contains("unstaged.txt"));
    assert!(diff_output.contains("unstaged"));
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

    let paths = commands::action_paths_for_file(&root, "b.txt");
    assert_eq!(paths, vec!["a.txt".to_string(), "b.txt".to_string()]);
}

#[test]
fn github_repo_names_match_normalizes_and_ignores_case() {
    assert!(commands::github_repo_names_match(
        "https://github.com/Owner/Repo.git",
        "owner/repo"
    ));
    assert!(commands::github_repo_names_match(
        "OWNER/REPO",
        "owner/repo"
    ));
}

#[test]
fn github_repo_names_match_detects_mismatch() {
    assert!(!commands::github_repo_names_match(
        "owner/old-repo",
        "owner/new-repo"
    ));
}

#[test]
fn validate_normalized_repo_name_rejects_empty_slug_after_normalization() {
    assert_eq!(
        commands::validate_normalized_repo_name(".git"),
        Err(
            "Repository name is empty after normalization. Use 'repo' or 'owner/repo'.".to_string()
        )
    );
    assert_eq!(
        commands::validate_normalized_repo_name("git@github.com:.git"),
        Err(
            "Repository name is empty after normalization. Use 'repo' or 'owner/repo'.".to_string()
        )
    );
}

#[test]
fn validate_normalized_repo_name_accepts_non_empty_normalized_slug() {
    assert_eq!(
        commands::validate_normalized_repo_name("owner/repo.git"),
        Ok("owner/repo".to_string())
    );
}

#[test]
fn parse_git_branch_listing_reads_branch_names_and_timestamps() {
    let branches =
        commands::parse_git_branch_listing("feature/b\t100\nmain\t250\nstale\t0\ninvalid\tnope\n");

    assert_eq!(branches[0].name, "main");
    assert_eq!(branches[0].last_commit, 250);
    assert_eq!(branches[1].name, "feature/b");
    assert_eq!(branches[1].last_commit, 100);
    assert_eq!(branches[3].name, "invalid");
    assert_eq!(branches[3].last_commit, 0);
}

#[test]
fn detects_repository_owner_errors_from_git_and_libgit2_messages() {
    assert!(commands::is_repository_owner_error(
        "repository path 'F:/repo' is not owned by current user; class=Config (7); code=Owner (-36)"
    ));
    assert!(commands::is_repository_owner_error(
        "fatal: detected dubious ownership in repository at '/tmp/repo'"
    ));
    assert!(!commands::is_repository_owner_error(
        "fatal: not a git repository (or any of the parent directories): .git"
    ));
}

#[test]
fn detects_repository_missing_errors_from_git_and_libgit2_messages() {
    assert!(commands::is_repository_missing_error(
        "could not find repository at 'F:\\CODE\\daily'; class=Repository (6); code=NotFound (-3)"
    ));
    assert!(commands::is_repository_missing_error(
        "fatal: not a git repository (or any of the parent directories): .git"
    ));
    assert!(commands::is_repository_missing_error(
        "fatal: cannot change to 'F:/CODE/missing': No such file or directory"
    ));
    assert!(!commands::is_repository_missing_error(
        "repository path 'F:/repo' is not owned by current user; class=Config (7); code=Owner (-36)"
    ));
}

#[test]
fn list_git_branches_supports_cli_first_repo_access_mode() {
    let _guard = git_cli_env_lock().lock().expect("env lock");
    let (root, repo) = create_temp_repo();
    fs::write(root.join("tracked.txt"), "tracked\n").expect("write tracked file");
    let mut index = repo.index().expect("repo index");
    index.add_path(Path::new("tracked.txt")).expect("add path");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
    repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
        .expect("commit");
    let default_branch = repo
        .head()
        .expect("head")
        .shorthand()
        .expect("branch name")
        .to_string();

    let head_commit = repo
        .head()
        .expect("head")
        .peel_to_commit()
        .expect("head commit");
    repo.branch("feature/cli", &head_commit, false)
        .expect("create branch");

    let workspace = WorkspaceEntry {
        id: "w1".to_string(),
        name: "w1".to_string(),
        path: root.to_string_lossy().to_string(),
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings::default(),
    };
    let mut entries = HashMap::new();
    entries.insert("w1".to_string(), workspace);
    let workspaces = Mutex::new(entries);

    unsafe {
        std::env::set_var("CODEX_MONITOR_FORCE_SAFE_GIT_CLI", "1");
    }

    let runtime = Runtime::new().expect("create tokio runtime");
    let result = runtime
        .block_on(commands::list_git_branches_inner(
            &workspaces,
            "w1".to_string(),
        ))
        .expect("list branches");

    unsafe {
        std::env::remove_var("CODEX_MONITOR_FORCE_SAFE_GIT_CLI");
    }

    let branches = result
        .get("branches")
        .and_then(Value::as_array)
        .expect("branches array");
    let names: Vec<&str> = branches
        .iter()
        .filter_map(|entry| entry.get("name").and_then(Value::as_str))
        .collect();
    assert!(names.iter().any(|name| *name == default_branch.as_str()));
    assert!(names.contains(&"feature/cli"));
}

#[test]
fn get_git_log_supports_cli_first_repo_access_mode() {
    let _guard = git_cli_env_lock().lock().expect("env lock");
    let (root, repo) = create_temp_repo();
    fs::write(root.join("tracked.txt"), "tracked\n").expect("write tracked file");
    let mut index = repo.index().expect("repo index");
    index.add_path(Path::new("tracked.txt")).expect("add path");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
    repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
        .expect("commit");

    let workspace = WorkspaceEntry {
        id: "w1".to_string(),
        name: "w1".to_string(),
        path: root.to_string_lossy().to_string(),
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings::default(),
    };
    let mut entries = HashMap::new();
    entries.insert("w1".to_string(), workspace);
    let workspaces = Mutex::new(entries);

    unsafe {
        std::env::set_var("CODEX_MONITOR_FORCE_SAFE_GIT_CLI", "1");
    }

    let runtime = Runtime::new().expect("create tokio runtime");
    let result = runtime
        .block_on(super::log::get_git_log_inner(
            &workspaces,
            "w1".to_string(),
            Some(10),
        ))
        .expect("git log");

    unsafe {
        std::env::remove_var("CODEX_MONITOR_FORCE_SAFE_GIT_CLI");
    }

    assert_eq!(result.total, 1);
    assert_eq!(result.entries.len(), 1);
    assert_eq!(result.entries[0].summary, "init");
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
        .block_on(diff::get_git_status_inner(&workspaces, "w1".to_string()))
        .expect("get git status");

    let has_ignored = status
        .get("unstagedFiles")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("path").and_then(Value::as_str))
        .any(|path| path.starts_with("ignored_root/example/foo/bar"));
    assert!(
        !has_ignored,
        "ignored files should not appear in unstagedFiles"
    );
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
        .block_on(diff::get_git_diffs_inner(
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
fn get_git_diffs_marks_large_text_files_as_too_large() {
    let (root, repo) = create_temp_repo();
    let large_path = root.join("dist").join("bundle.js");
    fs::create_dir_all(large_path.parent().expect("parent")).expect("create dist dir");
    fs::write(&large_path, "const version = 1;\n").expect("write initial bundle");

    let mut index = repo.index().expect("repo index");
    index
        .add_path(Path::new("dist/bundle.js"))
        .expect("add bundle");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
    repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
        .expect("commit");

    let large_content = format!("{}\n", "x".repeat(300 * 1024));
    fs::write(&large_path, large_content).expect("overwrite bundle with large output");

    let workspace = WorkspaceEntry {
        id: "w1".to_string(),
        name: "w1".to_string(),
        path: root.to_string_lossy().to_string(),
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
        .block_on(diff::get_git_diffs_inner(
            &workspaces,
            &app_settings,
            "w1".to_string(),
        ))
        .expect("get git diffs");

    let large_diff = diffs
        .iter()
        .find(|diff| diff.path == "dist/bundle.js")
        .expect("bundle diff");

    assert!(
        large_diff.is_diff_too_large,
        "large text outputs should be marked as too large for safe rendering"
    );
    assert!(large_diff.diff.is_empty(), "large text diff content should be omitted");
    assert!(large_diff.old_lines.is_none(), "large diff should not carry old lines");
    assert!(large_diff.new_lines.is_none(), "large diff should not carry new lines");
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
        diff::check_ignore_with_git(&repo, kept_path) == Some(false),
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
        !diff::should_skip_ignored_path_with_cache(&repo, Path::new("ignored_root/keep.txt"), None),
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
        diff::should_skip_ignored_path_with_cache(
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
        !diff::should_skip_ignored_path_with_cache(
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
        diff::check_ignore_with_git(&repo, Path::new("ignored_root/tracked.txt")),
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
        diff::check_ignore_with_git(&repo, Path::new("keep.log")),
        Some(false),
        "repo negation should override global ignore for keep.log"
    );
    assert!(
        !diff::should_skip_ignored_path_with_cache(&repo, Path::new("keep.log"), None),
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
    let ignored_paths =
        diff::collect_ignored_paths_with_git(&repo, &[ignored_path.clone(), visible_path.clone()])
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
        diff::collect_ignored_paths_with_git(&repo, &paths).expect("collect ignored paths");

    assert_eq!(ignored_paths.len(), total);
}
