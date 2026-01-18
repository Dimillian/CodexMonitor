use serde::Serialize;
use tauri::{AppHandle, State};

use crate::state::AppState;

fn unsupported() -> String {
    "Terminal is not supported on mobile builds.".to_string()
}

pub(crate) struct TerminalSession {
    pub(crate) id: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TerminalSessionInfo {
    id: String,
}

#[tauri::command]
pub(crate) async fn terminal_open(
    _workspace_id: String,
    terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
    _app: AppHandle,
) -> Result<TerminalSessionInfo, String> {
    if terminal_id.trim().is_empty() {
        return Err("Terminal id is required".to_string());
    }
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn terminal_write(
    _workspace_id: String,
    _terminal_id: String,
    _data: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn terminal_resize(
    _workspace_id: String,
    _terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn terminal_close(
    _workspace_id: String,
    _terminal_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(unsupported())
}

