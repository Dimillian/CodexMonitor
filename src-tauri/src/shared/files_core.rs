use std::collections::HashMap;
use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::home as codex_home;
use crate::files::io::TextFileResponse;
use crate::files::ops::{read_with_policy, write_with_policy};
use crate::files::policy::{policy_for, FileKind, FileScope};
use crate::types::{AppSettings, WorkspaceEntry};

async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

pub(crate) async fn resolve_root_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    scope: FileScope,
    workspace_id: Option<&str>,
) -> Result<PathBuf, String> {
    match scope {
        FileScope::Global => {
            let settings = app_settings.lock().await;
            codex_home::resolve_codex_home(settings.codex_home.as_deref())
        }
        FileScope::Workspace => {
            let workspace_id = workspace_id.ok_or_else(|| "workspaceId is required".to_string())?;
            resolve_workspace_root(workspaces, workspace_id).await
        }
    }
}

pub(crate) async fn file_read_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
) -> Result<TextFileResponse, String> {
    let policy = policy_for(scope, kind)?;
    let root = resolve_root_core(workspaces, app_settings, scope, workspace_id.as_deref()).await?;
    read_with_policy(&root, policy)
}

pub(crate) async fn file_write_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
) -> Result<(), String> {
    let policy = policy_for(scope, kind)?;
    let root = resolve_root_core(workspaces, app_settings, scope, workspace_id.as_deref()).await?;
    write_with_policy(&root, policy, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_file_operations_use_selected_home_and_reject_unavailable_selection() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let fixture =
                    std::env::temp_dir().join(format!("codex-home-files-{}", uuid::Uuid::new_v4()));
                let selected = fixture.join("selected");
                std::fs::create_dir_all(&selected).unwrap();
                std::fs::write(
                    selected.join("config.toml"),
                    "model = \"fixture-provider\"\n",
                )
                .unwrap();
                let settings = Mutex::new(AppSettings {
                    codex_home: Some(selected.to_string_lossy().into_owned()),
                    ..AppSettings::default()
                });
                let workspaces = Mutex::new(HashMap::new());
                let config = file_read_core(
                    &workspaces,
                    &settings,
                    FileScope::Global,
                    FileKind::Config,
                    None,
                )
                .await
                .unwrap();
                assert_eq!(config.content, "model = \"fixture-provider\"\n");
                file_write_core(
                    &workspaces,
                    &settings,
                    FileScope::Global,
                    FileKind::Agents,
                    None,
                    "Selected-home instructions\n".to_string(),
                )
                .await
                .unwrap();
                assert_eq!(
                    std::fs::read_to_string(selected.join("AGENTS.md")).unwrap(),
                    "Selected-home instructions\n"
                );
                settings.lock().await.codex_home =
                    Some(fixture.join("unavailable").to_string_lossy().into_owned());
                assert!(file_read_core(
                    &workspaces,
                    &settings,
                    FileScope::Global,
                    FileKind::Config,
                    None
                )
                .await
                .unwrap_err()
                .contains("unavailable"));
                assert!(file_write_core(
                    &workspaces,
                    &settings,
                    FileScope::Global,
                    FileKind::Agents,
                    None,
                    "must not write".to_string()
                )
                .await
                .unwrap_err()
                .contains("unavailable"));
                assert!(!fixture.join("unavailable").exists());
                std::fs::remove_dir_all(fixture).unwrap();
            });
    }
}
