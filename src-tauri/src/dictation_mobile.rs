use serde::Serialize;
use tauri::{AppHandle, State};

use crate::state::AppState;

fn unsupported() -> String {
    "Dictation is not supported on mobile builds.".to_string()
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DictationModelState {
    Missing,
    Downloading,
    Ready,
    Error,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DictationDownloadProgress {
    #[serde(rename = "downloadedBytes")]
    pub(crate) downloaded_bytes: u64,
    #[serde(rename = "totalBytes")]
    pub(crate) total_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DictationModelStatus {
    pub(crate) state: DictationModelState,
    #[serde(rename = "modelId")]
    pub(crate) model_id: String,
    pub(crate) progress: Option<DictationDownloadProgress>,
    pub(crate) error: Option<String>,
    pub(crate) path: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DictationSessionState {
    Idle,
    Listening,
    Processing,
}

pub(crate) struct DictationState {
    pub(crate) model_status: DictationModelStatus,
    pub(crate) session_state: DictationSessionState,
}

impl Default for DictationState {
    fn default() -> Self {
        Self {
            model_status: DictationModelStatus {
                state: DictationModelState::Missing,
                model_id: "base".to_string(),
                progress: None,
                error: None,
                path: None,
            },
            session_state: DictationSessionState::Idle,
        }
    }
}

#[tauri::command]
pub(crate) async fn dictation_model_status(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_download_model(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_cancel_download(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationModelStatus, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_remove_model(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationModelStatus, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_start(
    _preferred_language: Option<String>,
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_stop(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(unsupported())
}

#[tauri::command]
pub(crate) async fn dictation_cancel(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(unsupported())
}

