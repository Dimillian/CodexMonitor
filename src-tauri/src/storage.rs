use std::collections::HashMap;
use std::path::PathBuf;

use crate::types::{AppSettings, WorkspaceEntry, WorkspaceSettings};
use serde_json::Value;

fn normalize_windows_namespace_path(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }

    fn strip_prefix_ascii_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
        value
            .get(..prefix.len())
            .filter(|candidate| candidate.eq_ignore_ascii_case(prefix))
            .map(|_| &value[prefix.len()..])
    }

    fn starts_with_drive_path(value: &str) -> bool {
        let bytes = value.as_bytes();
        bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/')
    }

    if let Some(rest) = strip_prefix_ascii_case(path, r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//?/UNC/") {
        return format!("//{rest}");
    }
    if let Some(rest) =
        strip_prefix_ascii_case(path, r"\\?\").filter(|rest| starts_with_drive_path(rest))
    {
        return rest.to_string();
    }
    if let Some(rest) =
        strip_prefix_ascii_case(path, "//?/").filter(|rest| starts_with_drive_path(rest))
    {
        return rest.to_string();
    }
    if let Some(rest) =
        strip_prefix_ascii_case(path, r"\\.\").filter(|rest| starts_with_drive_path(rest))
    {
        return rest.to_string();
    }
    if let Some(rest) =
        strip_prefix_ascii_case(path, "//./").filter(|rest| starts_with_drive_path(rest))
    {
        return rest.to_string();
    }

    path.to_string()
}

fn normalize_optional_windows_namespace_path(path: Option<String>) -> (Option<String>, bool) {
    match path {
        Some(path) => {
            let normalized = normalize_windows_namespace_path(&path);
            let changed = normalized != path;
            (Some(normalized), changed)
        }
        None => (None, false),
    }
}

fn normalize_workspace_settings(settings: WorkspaceSettings) -> (WorkspaceSettings, bool) {
    let (worktrees_folder, changed) =
        normalize_optional_windows_namespace_path(settings.worktrees_folder.clone());
    (
        WorkspaceSettings {
            worktrees_folder,
            ..settings
        },
        changed,
    )
}

fn normalize_workspace_entry(entry: WorkspaceEntry) -> (WorkspaceEntry, bool) {
    let normalized_path = normalize_windows_namespace_path(&entry.path);
    let (settings, settings_changed) = normalize_workspace_settings(entry.settings.clone());
    let changed = normalized_path != entry.path || settings_changed;
    (
        WorkspaceEntry {
            path: normalized_path,
            settings,
            ..entry
        },
        changed,
    )
}

fn normalize_workspace_entries<I>(entries: I) -> (Vec<WorkspaceEntry>, bool)
where
    I: IntoIterator<Item = WorkspaceEntry>,
{
    let mut changed = false;
    let normalized = entries
        .into_iter()
        .map(|entry| {
            let (entry, entry_changed) = normalize_workspace_entry(entry);
            changed |= entry_changed;
            entry
        })
        .collect();
    (normalized, changed)
}

fn normalize_app_settings(settings: AppSettings) -> (AppSettings, bool) {
    let (global_worktrees_folder, changed) =
        normalize_optional_windows_namespace_path(settings.global_worktrees_folder.clone());
    (
        AppSettings {
            global_worktrees_folder,
            ..settings
        },
        changed,
    )
}

fn try_rewrite_settings_with_normalized_paths(path: &PathBuf, settings: &AppSettings) {
    if let Err(error) = write_settings(path, settings) {
        eprintln!(
            "read_settings: failed to persist normalized settings paths to {}: {}",
            path.display(),
            error
        );
    }
}

pub(crate) fn read_workspaces(path: &PathBuf) -> Result<HashMap<String, WorkspaceEntry>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let list: Vec<WorkspaceEntry> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let (list, _) = normalize_workspace_entries(list);
    Ok(list
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect())
}

pub(crate) fn write_workspaces(path: &PathBuf, entries: &[WorkspaceEntry]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let (entries, _) = normalize_workspace_entries(entries.iter().cloned());
    let data = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

pub(crate) fn read_settings(path: &PathBuf) -> Result<AppSettings, String> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    migrate_follow_up_message_behavior(&mut value);
    match serde_json::from_value(value.clone()) {
        Ok(settings) => Ok(finalize_loaded_settings(path, settings)),
        Err(_) => {
            sanitize_remote_settings_for_tcp_only(&mut value);
            migrate_follow_up_message_behavior(&mut value);
            serde_json::from_value(value)
                .map(|settings| finalize_loaded_settings(path, settings))
                .map_err(|e| e.to_string())
        }
    }
}

pub(crate) fn write_settings(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let (settings, _) = normalize_app_settings(settings.clone());
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

fn finalize_loaded_settings(path: &PathBuf, settings: AppSettings) -> AppSettings {
    let (settings, changed) = normalize_app_settings(settings);
    if changed {
        try_rewrite_settings_with_normalized_paths(path, &settings);
    }
    settings
}

fn sanitize_remote_settings_for_tcp_only(value: &mut Value) {
    let Value::Object(root) = value else {
        return;
    };
    root.insert(
        "remoteBackendProvider".to_string(),
        Value::String("tcp".to_string()),
    );
    if let Some(Value::Array(remote_backends)) = root.get_mut("remoteBackends") {
        for entry in remote_backends {
            let Value::Object(entry_obj) = entry else {
                continue;
            };
            entry_obj.insert("provider".to_string(), Value::String("tcp".to_string()));
            entry_obj.retain(|key, _| {
                matches!(
                    key.as_str(),
                    "id" | "name" | "provider" | "host" | "token" | "lastConnectedAtMs"
                )
            });
        }
    }
    root.retain(|key, _| !key.to_ascii_lowercase().starts_with("orb"));
}

fn migrate_follow_up_message_behavior(value: &mut Value) {
    let Value::Object(root) = value else {
        return;
    };
    if root.contains_key("followUpMessageBehavior") {
        return;
    }
    let steer_enabled = root
        .get("steerEnabled")
        .or_else(|| root.get("experimentalSteerEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    root.insert(
        "followUpMessageBehavior".to_string(),
        Value::String(if steer_enabled { "steer" } else { "queue" }.to_string()),
    );
}

#[cfg(test)]
mod tests {
    use super::{read_settings, read_workspaces, write_settings, write_workspaces};
    use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use uuid::Uuid;

    #[test]
    fn write_read_workspaces_persists_sort_and_group() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let mut settings = WorkspaceSettings::default();
        settings.sort_order = Some(5);
        settings.group_id = Some("group-42".to_string());
        settings.sidebar_collapsed = true;
        settings.git_root = Some("/tmp".to_string());

        let entry = WorkspaceEntry {
            id: "w1".to_string(),
            name: "Workspace".to_string(),
            path: "/tmp".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: settings.clone(),
        };

        write_workspaces(&path, &[entry]).expect("write workspaces");
        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get("w1").expect("stored workspace");
        assert_eq!(stored.settings.sort_order, Some(5));
        assert_eq!(stored.settings.group_id.as_deref(), Some("group-42"));
        assert!(stored.settings.sidebar_collapsed);
        assert_eq!(stored.settings.git_root.as_deref(), Some("/tmp"));
    }

    #[test]
    fn write_read_workspaces_sanitizes_windows_namespace_paths() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        let entry = WorkspaceEntry {
            id: "w1".to_string(),
            name: "Workspace".to_string(),
            path: r"\\?\I:\gpt-projects\json-composer".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        write_workspaces(&path, &[entry]).expect("write workspaces");

        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get("w1").expect("stored workspace");
        assert_eq!(stored.path, r"I:\gpt-projects\json-composer");
    }

    #[test]
    fn read_workspaces_sanitizes_namespace_paths_without_rewriting_file() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("workspaces.json");

        std::fs::write(
            &path,
            r#"[
  {
    "id": "w1",
    "name": "Workspace",
    "path": "\\\\?\\I:\\gpt-projects\\json-composer",
    "kind": "main",
    "parentId": null,
    "worktree": null,
    "settings": {}
  }
]"#,
        )
        .expect("write workspaces");

        let read = read_workspaces(&path).expect("read workspaces");
        let stored = read.get("w1").expect("stored workspace");
        assert_eq!(stored.path, r"I:\gpt-projects\json-composer");

        let persisted = std::fs::read_to_string(&path).expect("read persisted workspaces");
        let persisted_entries: Vec<WorkspaceEntry> =
            serde_json::from_str(&persisted).expect("deserialize persisted workspaces");
        assert_eq!(persisted_entries.len(), 1);
        assert_eq!(persisted_entries[0].path, r"\\?\I:\gpt-projects\json-composer");
    }

    #[test]
    fn read_settings_sanitizes_non_tcp_remote_provider() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        std::fs::write(
            &path,
            r#"{
  "remoteBackendProvider": "legacy-provider",
  "remoteBackendHost": "example:4732",
  "remoteBackendToken": "token-1",
  "remoteBackends": [
    {
      "id": "remote-a",
      "name": "Remote A",
      "provider": "legacy-provider",
      "host": "example:4732",
      "token": "token-1",
      "legacyWsUrl": "wss://example/ws"
    }
  ],
  "theme": "dark"
}"#,
        )
        .expect("write settings");

        let settings = read_settings(&path).expect("read settings");
        assert!(matches!(
            settings.remote_backend_provider,
            crate::types::RemoteBackendProvider::Tcp
        ));
        assert_eq!(settings.remote_backends.len(), 1);
        assert!(matches!(
            settings.remote_backends[0].provider,
            crate::types::RemoteBackendProvider::Tcp
        ));
        assert_eq!(settings.theme, "dark");
    }

    #[test]
    fn read_settings_migrates_follow_up_behavior_from_legacy_steer_enabled_true() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        std::fs::write(
            &path,
            r#"{
  "steerEnabled": true,
  "theme": "dark"
}"#,
        )
        .expect("write settings");

        let settings = read_settings(&path).expect("read settings");
        assert!(settings.steer_enabled);
        assert_eq!(settings.follow_up_message_behavior, "steer");
    }

    #[test]
    fn read_settings_migrates_follow_up_behavior_from_legacy_steer_enabled_false() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        std::fs::write(
            &path,
            r#"{
  "steerEnabled": false,
  "theme": "dark"
}"#,
        )
        .expect("write settings");

        let settings = read_settings(&path).expect("read settings");
        assert!(!settings.steer_enabled);
        assert_eq!(settings.follow_up_message_behavior, "queue");
    }

    #[test]
    fn write_read_settings_sanitizes_global_worktrees_folder_namespace_paths() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        let mut settings = AppSettings::default();
        settings.global_worktrees_folder = Some(r"\\?\I:\gpt-projects\worktrees".to_string());

        write_settings(&path, &settings).expect("write settings");
        let read = read_settings(&path).expect("read settings");
        assert_eq!(
            read.global_worktrees_folder.as_deref(),
            Some(r"I:\gpt-projects\worktrees")
        );
    }

    #[test]
    fn read_settings_rewrites_global_worktrees_folder_namespace_paths() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        std::fs::write(
            &path,
            r#"{
  "globalWorktreesFolder": "\\\\?\\I:\\gpt-projects\\worktrees",
  "theme": "dark"
}"#,
        )
        .expect("write settings");

        let settings = read_settings(&path).expect("read settings");
        assert_eq!(
            settings.global_worktrees_folder.as_deref(),
            Some(r"I:\gpt-projects\worktrees")
        );

        let rewritten = std::fs::read_to_string(&path).expect("read rewritten settings");
        let rewritten_settings: AppSettings =
            serde_json::from_str(&rewritten).expect("deserialize rewritten settings");
        assert_eq!(
            rewritten_settings.global_worktrees_folder.as_deref(),
            Some(r"I:\gpt-projects\worktrees")
        );
    }

    #[test]
    fn read_settings_keeps_existing_follow_up_behavior() {
        let temp_dir = std::env::temp_dir().join(format!("codex-monitor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let path = temp_dir.join("settings.json");

        std::fs::write(
            &path,
            r#"{
  "steerEnabled": true,
  "followUpMessageBehavior": "queue",
  "theme": "dark"
}"#,
        )
        .expect("write settings");

        let settings = read_settings(&path).expect("read settings");
        assert_eq!(settings.follow_up_message_behavior, "queue");
    }
}
