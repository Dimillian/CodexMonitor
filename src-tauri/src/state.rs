use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::storage::{read_settings, read_workspaces, write_settings};
use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::codex::WorkspaceSession>>>,
    pub(crate) terminal_sessions:
        Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) app_settings: Mutex<AppSettings>,
    #[cfg(desktop)]
    pub(crate) telegram_tx:
        Mutex<Option<tokio::sync::mpsc::UnboundedSender<crate::telegram::TelegramEvent>>>,
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

        if app_settings.telegram_pairing_secret.trim().is_empty() {
            app_settings.telegram_pairing_secret = Uuid::new_v4().to_string();
            let _ = write_settings(&settings_path, &app_settings);
        }
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
            #[cfg(desktop)]
            telegram_tx: Mutex::new(None),
        }
    }
}
