use std::collections::HashMap;
use std::path::PathBuf;

use super::settings::{apply_workspace_settings_update, sort_workspaces};
use super::worktree::{
    build_clone_destination_path, sanitize_clone_dir_name, sanitize_worktree_name,
};
use crate::storage::{read_workspaces, write_workspaces};
use crate::types::{WorktreeInfo, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings};
use uuid::Uuid;

fn workspace(name: &str, sort_order: Option<u32>) -> WorkspaceInfo {
    workspace_with_id_and_kind(name, name, sort_order, WorkspaceKind::Main)
}

fn workspace_with_id_and_kind(
    name: &str,
    id: &str,
    sort_order: Option<u32>,
    kind: WorkspaceKind,
) -> WorkspaceInfo {
    let (parent_id, worktree) = if kind.is_worktree() {
        (
            Some("parent".to_string()),
            Some(WorktreeInfo {
                branch: name.to_string(),
            }),
        )
    } else {
        (None, None)
    };
    WorkspaceInfo {
        id: id.to_string(),
        name: name.to_string(),
        path: "/tmp".to_string(),
        connected: false,
        codex_bin: None,
        kind,
        parent_id,
        worktree,
        settings: WorkspaceSettings {
            sidebar_collapsed: false,
            sort_order,
            group_id: None,
            git_root: None,
            codex_home: None,
            codex_args: None,
            launch_script: None,
            worktree_setup_script: None,
        },
    }
}

#[test]
fn sanitize_worktree_name_rewrites_specials() {
    assert_eq!(sanitize_worktree_name("feature/new-thing"), "feature-new-thing");
    assert_eq!(sanitize_worktree_name("///"), "worktree");
    assert_eq!(sanitize_worktree_name("--branch--"), "branch");
}

#[test]
fn sanitize_worktree_name_allows_safe_chars() {
    assert_eq!(sanitize_worktree_name("release_1.2.3"), "release_1.2.3");
    assert_eq!(sanitize_worktree_name("feature--x"), "feature--x");
}

#[test]
fn sanitize_clone_dir_name_rewrites_specials() {
    assert_eq!(sanitize_clone_dir_name("feature/new-thing"), "feature-new-thing");
    assert_eq!(sanitize_clone_dir_name("///"), "copy");
    assert_eq!(sanitize_clone_dir_name("--name--"), "name");
}

#[test]
fn sanitize_clone_dir_name_allows_safe_chars() {
    assert_eq!(sanitize_clone_dir_name("release_1.2.3"), "release_1.2.3");
    assert_eq!(sanitize_clone_dir_name("feature--x"), "feature--x");
}

#[test]
fn build_clone_destination_path_sanitizes_and_uniquifies() {
    let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
    let copies_folder = temp_dir.join("copies");
    std::fs::create_dir_all(&copies_folder).expect("create copies folder");

    let first = build_clone_destination_path(&copies_folder, "feature/new-thing");
    assert!(first.starts_with(&copies_folder));
    assert_eq!(
        first.file_name().and_then(|name| name.to_str()),
        Some("feature-new-thing")
    );

    std::fs::create_dir_all(&first).expect("create first clone folder");

    let second = build_clone_destination_path(&copies_folder, "feature/new-thing");
    assert!(second.starts_with(&copies_folder));
    assert_ne!(first, second);
    assert_eq!(
        second.file_name().and_then(|name| name.to_str()),
        Some("feature-new-thing-2")
    );
}

#[test]
fn sort_workspaces_orders_by_sort_then_name() {
    let mut items = vec![
        workspace("beta", None),
        workspace("alpha", None),
        workspace("delta", Some(2)),
        workspace("gamma", Some(1)),
    ];

    sort_workspaces(&mut items);

    let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
    assert_eq!(names, vec!["gamma", "delta", "alpha", "beta"]);
}

#[test]
fn sort_workspaces_places_unordered_last_and_names_tie_break() {
    let mut items = vec![
        workspace("delta", None),
        workspace("beta", Some(1)),
        workspace("alpha", Some(1)),
        workspace("gamma", None),
    ];

    sort_workspaces(&mut items);

    let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
    assert_eq!(names, vec!["alpha", "beta", "delta", "gamma"]);
}

#[test]
fn sort_workspaces_ignores_group_ids() {
    let mut first = workspace("beta", Some(2));
    first.settings.group_id = Some("group-b".to_string());
    let mut second = workspace("alpha", Some(1));
    second.settings.group_id = Some("group-a".to_string());
    let mut third = workspace("gamma", None);
    third.settings.group_id = Some("group-a".to_string());

    let mut items = vec![first, second, third];
    sort_workspaces(&mut items);

    let names: Vec<_> = items.into_iter().map(|item| item.name).collect();
    assert_eq!(names, vec!["alpha", "beta", "gamma"]);
}

#[test]
fn sort_workspaces_breaks_ties_by_id() {
    let mut items = vec![
        workspace_with_id_and_kind("alpha", "b-id", Some(1), WorkspaceKind::Main),
        workspace_with_id_and_kind("alpha", "a-id", Some(1), WorkspaceKind::Main),
    ];

    sort_workspaces(&mut items);

    let ids: Vec<_> = items.into_iter().map(|item| item.id).collect();
    assert_eq!(ids, vec!["a-id", "b-id"]);
}

#[test]
fn sort_workspaces_does_not_bias_kind() {
    let mut items = vec![
        workspace_with_id_and_kind("main", "main", Some(2), WorkspaceKind::Main),
        workspace_with_id_and_kind("worktree", "worktree", Some(1), WorkspaceKind::Worktree),
    ];

    sort_workspaces(&mut items);

    let kinds: Vec<_> = items.into_iter().map(|item| item.kind).collect();
    assert!(matches!(
        kinds.as_slice(),
        [WorkspaceKind::Worktree, WorkspaceKind::Main]
    ));
}

#[test]
fn update_workspace_settings_persists_sort_and_group() {
    let id = "workspace-1".to_string();
    let entry = WorkspaceEntry {
        id: id.clone(),
        name: "Workspace".to_string(),
        path: "/tmp".to_string(),
        codex_bin: None,
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings::default(),
    };
    let mut workspaces = HashMap::from([(id.clone(), entry)]);

    let mut settings = WorkspaceSettings::default();
    settings.sort_order = Some(3);
    settings.group_id = Some("group-1".to_string());
    settings.sidebar_collapsed = true;
    settings.git_root = Some("/tmp".to_string());
    settings.launch_script = Some("npm run dev".to_string());
    settings.worktree_setup_script = Some("pnpm install".to_string());

    let updated =
        apply_workspace_settings_update(&mut workspaces, &id, settings.clone()).expect("update");
    assert_eq!(updated.settings.sort_order, Some(3));
    assert_eq!(updated.settings.group_id.as_deref(), Some("group-1"));
    assert!(updated.settings.sidebar_collapsed);
    assert_eq!(updated.settings.git_root.as_deref(), Some("/tmp"));
    assert_eq!(updated.settings.launch_script.as_deref(), Some("npm run dev"));
    assert_eq!(
        updated.settings.worktree_setup_script.as_deref(),
        Some("pnpm install"),
    );

    let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).expect("create temp dir");
    let path = PathBuf::from(temp_dir.join("workspaces.json"));
    let list: Vec<_> = workspaces.values().cloned().collect();
    write_workspaces(&path, &list).expect("write workspaces");

    let read = read_workspaces(&path).expect("read workspaces");
    let stored = read.get(&id).expect("stored workspace");
    assert_eq!(stored.settings.sort_order, Some(3));
    assert_eq!(stored.settings.group_id.as_deref(), Some("group-1"));
    assert!(stored.settings.sidebar_collapsed);
    assert_eq!(stored.settings.git_root.as_deref(), Some("/tmp"));
    assert_eq!(stored.settings.launch_script.as_deref(), Some("npm run dev"));
    assert_eq!(
        stored.settings.worktree_setup_script.as_deref(),
        Some("pnpm install"),
    );
}
