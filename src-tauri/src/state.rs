use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::dictation::DictationState;
use crate::storage::{read_settings, read_workspaces, write_settings};
use crate::integrations::IntegrationsRuntime;
use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::codex::WorkspaceSession>>>,
    pub(crate) terminal_sessions:
        Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) app_settings: Mutex<AppSettings>,
    pub(crate) dictation: Mutex<DictationState>,
    pub(crate) integrations: Mutex<IntegrationsRuntime>,
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
        let defaults = AppSettings::default();
        let mut settings_changed = false;
        if app_settings.runner_id.trim().is_empty() || app_settings.runner_id == "unknown" {
            app_settings.runner_id = Uuid::new_v4().to_string();
            settings_changed = true;
        }
        if app_settings.telegram_pairing_secret.trim().is_empty()
            || app_settings.telegram_pairing_secret == "unknown"
        {
            app_settings.telegram_pairing_secret = Uuid::new_v4().to_string();
            settings_changed = true;
        }
        if app_settings
            .nats_url
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            app_settings.nats_url = defaults.nats_url;
            settings_changed = true;
        }
        if app_settings
            .cloudkit_container_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            app_settings.cloudkit_container_id = defaults.cloudkit_container_id;
            settings_changed = true;
        }
        if settings_changed {
            let _ = write_settings(&settings_path, &app_settings);
        }
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
            dictation: Mutex::new(DictationState::default()),
            integrations: Mutex::new(IntegrationsRuntime::default()),
        }
    }
}
