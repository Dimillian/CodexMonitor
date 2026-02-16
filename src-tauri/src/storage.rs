use std::collections::HashMap;
use std::path::PathBuf;

use crate::types::{AppSettings, WorkspaceEntry};
use serde_json::Value;

pub(crate) fn read_workspaces(path: &PathBuf) -> Result<HashMap<String, WorkspaceEntry>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let list: Vec<WorkspaceEntry> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(list
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect())
}

pub(crate) fn write_workspaces(path: &PathBuf, entries: &[WorkspaceEntry]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

pub(crate) fn read_settings(path: &PathBuf) -> Result<AppSettings, String> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&data) {
        Ok(settings) => Ok(settings),
        Err(_) => {
            let mut value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            sanitize_remote_settings_for_tcp_only(&mut value);
            serde_json::from_value(value).map_err(|e| e.to_string())
        }
    }
}

pub(crate) fn write_settings(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::{read_settings, read_workspaces, write_workspaces};
    use crate::types::{WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
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
        settings.codex_args = Some("--profile personal".to_string());

        let entry = WorkspaceEntry {
            id: "w1".to_string(),
            name: "Workspace".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
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
        assert_eq!(
            stored.settings.codex_args.as_deref(),
            Some("--profile personal")
        );
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
}
