use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::state::AppState;

#[derive(Debug, Clone)]
pub(crate) enum TelegramEvent {
    AppServerEvent { workspace_id: String, message: Value },
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TelegramBotStatus {
    pub(crate) ok: bool,
    pub(crate) username: Option<String>,
    pub(crate) id: Option<i64>,
    pub(crate) error: Option<String>,
}

pub(crate) fn start_telegram_poller(_app: AppHandle) {}

pub(crate) fn emit_app_server_event(_app: AppHandle, _workspace_id: String, _message: Value) {}

pub(crate) async fn notify_app_exit(_app: AppHandle) {}

#[tauri::command]
pub(crate) async fn telegram_bot_status(_state: State<'_, AppState>) -> Result<TelegramBotStatus, String> {
    Ok(TelegramBotStatus {
        ok: false,
        username: None,
        id: None,
        error: Some("Telegram integration is only available on desktop builds.".to_string()),
    })
}
