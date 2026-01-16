use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::storage::{read_settings, write_settings, read_workspaces};
use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::codex::WorkspaceSession>>>,
    pub(crate) terminal_sessions:
        Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) app_settings: Mutex<AppSettings>,
}

impl AppState {
    pub(crate) fn load(app: &AppHandle) -> Self {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()));
        let storage_path = data_dir.join("workspaces.json");
        let settings_path = data_dir.join("settings.json");
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let mut app_settings = read_settings(&settings_path).unwrap_or_default();

        if cfg!(target_os = "ios") {
            // iOS is a Cloud client; CloudKit is required to do anything useful.
            // Force-enable unless explicitly managed later via Settings UI.
            if !app_settings.cloudkit_enabled {
                app_settings.cloudkit_enabled = true;
            }
        }

        if app_settings
            .cloudkit_container_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            if let Ok(env_container) = std::env::var("CODEXMONITOR_CLOUDKIT_CONTAINER_ID") {
                let trimmed = env_container.trim().to_string();
                if !trimmed.is_empty() {
                    app_settings.cloudkit_container_id = Some(trimmed);
                }
            }

            // For ILASS builds: default to our CloudKit container on iOS so the app isn't a dead end.
            if cfg!(target_os = "ios")
                && app_settings
                    .cloudkit_container_id
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .is_empty()
            {
                app_settings.cloudkit_container_id = Some("iCloud.com.ilass.codexmonitor".to_string());
            }
        }
        if app_settings.runner_id.trim().is_empty() {
            app_settings.runner_id = Uuid::new_v4().to_string();
            let _ = write_settings(&settings_path, &app_settings);
        } else {
            let _ = write_settings(&settings_path, &app_settings);
        }
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
        }
    }
}
