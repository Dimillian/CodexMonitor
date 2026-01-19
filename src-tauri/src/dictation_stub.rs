use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

const DEFAULT_MODEL_ID: &str = "base";
const UNSUPPORTED_MESSAGE: &str = "Dictation is not supported on Windows builds.";

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

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum DictationEvent {
    State { state: DictationSessionState },
    Level { value: f32 },
    Transcript { text: String },
    Error { message: String },
    Canceled { message: String },
}

pub(crate) struct DictationState {
    pub(crate) model_status: DictationModelStatus,
    pub(crate) session_state: DictationSessionState,
}

impl Default for DictationState {
    fn default() -> Self {
        Self {
            model_status: DictationModelStatus {
                state: DictationModelState::Error,
                model_id: DEFAULT_MODEL_ID.to_string(),
                progress: None,
                error: Some(UNSUPPORTED_MESSAGE.to_string()),
                path: None,
            },
            session_state: DictationSessionState::Idle,
        }
    }
}

fn emit_status(app: &AppHandle, status: &DictationModelStatus) {
    let _ = app.emit("dictation-download", status);
}

fn emit_event(app: &AppHandle, event: DictationEvent) {
    let _ = app.emit("dictation-event", event);
}

fn windows_unsupported_status(model_id: Option<String>) -> DictationModelStatus {
    DictationModelStatus {
        state: DictationModelState::Error,
        model_id: model_id.unwrap_or_else(|| DEFAULT_MODEL_ID.to_string()),
        progress: None,
        error: Some(UNSUPPORTED_MESSAGE.to_string()),
        path: None,
    }
}

#[tauri::command]
pub(crate) async fn dictation_model_status(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let status = windows_unsupported_status(model_id);
    {
        let mut dictation = state.dictation.lock().await;
        dictation.model_status = status.clone();
        dictation.session_state = DictationSessionState::Idle;
    }
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn dictation_download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let status = dictation_model_status(app.clone(), state, model_id).await?;
    emit_event(
        &app,
        DictationEvent::Error {
            message: status
                .error
                .clone()
                .unwrap_or_else(|| "Dictation is unavailable on Windows.".to_string()),
        },
    );
    Ok(status)
}

#[tauri::command]
pub(crate) async fn dictation_cancel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    dictation_model_status(app, state, model_id).await
}

#[tauri::command]
pub(crate) async fn dictation_remove_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    dictation_model_status(app, state, model_id).await
}

#[tauri::command]
pub(crate) async fn dictation_start(
    _preferred_language: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    {
        let mut dictation = state.dictation.lock().await;
        dictation.session_state = DictationSessionState::Idle;
    }
    let message = UNSUPPORTED_MESSAGE.to_string();
    emit_event(&app, DictationEvent::Error { message: message.clone() });
    Err(message)
}

#[tauri::command]
pub(crate) async fn dictation_stop(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    {
        let mut dictation = state.dictation.lock().await;
        dictation.session_state = DictationSessionState::Idle;
    }
    let message = UNSUPPORTED_MESSAGE.to_string();
    emit_event(&app, DictationEvent::Error { message: message.clone() });
    Err(message)
}

#[tauri::command]
pub(crate) async fn dictation_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    {
        let mut dictation = state.dictation.lock().await;
        dictation.session_state = DictationSessionState::Idle;
    }
    emit_event(
        &app,
        DictationEvent::Canceled {
            message: "Canceled".to_string(),
        },
    );
    Ok(DictationSessionState::Idle)
}

