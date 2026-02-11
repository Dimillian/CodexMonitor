use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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
