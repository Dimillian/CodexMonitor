use serde::Serialize;
use tauri::{AppHandle, State};

use crate::state::AppState;

pub(crate) struct TerminalSession {
    #[allow(dead_code)]
    pub(crate) id: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TerminalSessionInfo {
    id: String,
}

fn unsupported() -> Result<(), String> {
    Err("Terminal is not supported on iOS.".to_string())
}

#[tauri::command]
pub(crate) async fn terminal_open(
    _workspace_id: String,
    _terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
    _app: AppHandle,
) -> Result<TerminalSessionInfo, String> {
    unsupported()?;
    unreachable!()
}

#[tauri::command]
pub(crate) async fn terminal_write(
    _workspace_id: String,
    _terminal_id: String,
    _data: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    unsupported()
}

#[tauri::command]
pub(crate) async fn terminal_resize(
    _workspace_id: String,
    _terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    unsupported()
}

#[tauri::command]
pub(crate) async fn terminal_close(
    _workspace_id: String,
    _terminal_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    unsupported()
}

