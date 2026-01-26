use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::oneshot;

use crate::state::AppState;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use sha2::{Digest, Sha256};
use whisper_rs::get_lang_id;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

const DEFAULT_MODEL_ID: &str = "base";
const MAX_CAPTURE_SECONDS: u32 = 120;

#[cfg(target_os = "macos")]
static MIC_PERMISSION_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Checks microphone authorization status on macOS.
#[cfg(target_os = "macos")]
fn check_microphone_authorization() -> Result<AVAuthorizationStatus, String> {
    let media_type = unsafe { AVMediaTypeAudio.ok_or("Failed to get audio media type")? };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
    Ok(status)
}

/// Requests microphone permission on macOS.
/// Returns Ok(true) if permission was granted, Ok(false) if denied,
/// or Err with a message if the request failed.
#[cfg(target_os = "macos")]
async fn request_microphone_permission(app: &AppHandle) -> Result<bool, String> {
    let status = check_microphone_authorization()?;

    match status {
        AVAuthorizationStatus::Authorized => Ok(true),
        AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => {
            // Some macOS versions report Denied before the first prompt; try once per process.
            if MIC_PERMISSION_REQUESTED.swap(true, Ordering::SeqCst) {
                return Ok(false);
            }
            request_microphone_permission_with_completion(app).await
        }
        AVAuthorizationStatus::NotDetermined | _ => {
            MIC_PERMISSION_REQUESTED.store(true, Ordering::SeqCst);
            request_microphone_permission_with_completion(app).await
        }
    }
}

#[cfg(target_os = "macos")]
fn trigger_microphone_permission_request(
    tx: oneshot::Sender<Result<bool, String>>,
) {
    use block2::RcBlock;
    use objc2::runtime::Bool;

    let media_type = match unsafe { AVMediaTypeAudio } {
        Some(media_type) => media_type,
        None => {
            let _ = tx.send(Err("Failed to get audio media type".to_string()));
            return;
        }
    };

    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_clone = Arc::clone(&tx);
    let block = RcBlock::new(move |granted: Bool| {
        if let Ok(mut guard) = tx_clone.lock() {
            if let Some(sender) = guard.take() {
                let _ = sender.send(Ok(granted.as_bool()));
            }
        }
    });

    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &block);
    }
}

#[cfg(target_os = "macos")]
async fn request_microphone_permission_with_completion(
    app: &AppHandle,
) -> Result<bool, String> {
    // Trigger the permission request (this shows the system dialog)
    // Ensure we do this on the main thread so the system dialog appears.
    let (tx, rx) = oneshot::channel();
    let app_handle = app.clone();
    app_handle
        .run_on_main_thread(move || {
            trigger_microphone_permission_request(tx);
        })
        .map_err(|error| error.to_string())?;

    match tokio::time::timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(Ok(granted))) => Ok(granted),
        Ok(Ok(Err(error))) => Err(error),
        Ok(Err(_)) => Err("Failed to request microphone permission.".to_string()),
        Err(_) => Err("Microphone permission request timed out.".to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
async fn request_microphone_permission(_app: &AppHandle) -> Result<bool, String> {
    // On non-macOS platforms, assume permission is granted
    // (Linux doesn't have the same permission model)
    Ok(true)
}

struct DictationModelInfo {
    id: &'static str,
    filename: &'static str,
    url: &'static str,
    sha256: &'static str,
}

const MODEL_CATALOG: &[DictationModelInfo] = &[
    DictationModelInfo {
        id: "tiny",
        filename: "ggml-tiny.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    },
    DictationModelInfo {
        id: "base",
        filename: "ggml-base.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    },
    DictationModelInfo {
        id: "small",
        filename: "ggml-small.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    },
    DictationModelInfo {
        id: "medium",
        filename: "ggml-medium.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
    },
    DictationModelInfo {
        id: "large-v3",
        filename: "ggml-large-v3.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
        sha256: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
    },
];

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

pub(crate) struct DictationSessionHandle {
    pub(crate) stop: mpsc::Sender<()>,
    pub(crate) stopped: oneshot::Receiver<()>,
    pub(crate) audio: Arc<Mutex<Vec<f32>>>,
    pub(crate) sample_rate: u32,
    pub(crate) model_id: String,
    pub(crate) preferred_language: Option<String>,
}

pub(crate) struct DictationState {
    pub(crate) model_status: DictationModelStatus,
    pub(crate) download_cancel: Option<Arc<AtomicBool>>,
    pub(crate) download_task: Option<tokio::task::JoinHandle<()>>,
    pub(crate) session_state: DictationSessionState,
    pub(crate) session: Option<DictationSessionHandle>,
    pub(crate) processing_cancel: Option<Arc<AtomicBool>>,
    pub(crate) cached_context: Option<CachedWhisperContext>,
}

pub(crate) struct CachedWhisperContext {
    pub(crate) model_id: String,
    pub(crate) context: Arc<WhisperContext>,
}

impl Default for DictationState {
    fn default() -> Self {
        Self {
            model_status: missing_status(DEFAULT_MODEL_ID),
            download_cancel: None,
            download_task: None,
            session_state: DictationSessionState::Idle,
            session: None,
            processing_cancel: None,
            cached_context: None,
        }
    }
}

fn model_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()))
        .join("models")
        .join("whisper")
}

fn model_info(model_id: &str) -> Option<&'static DictationModelInfo> {
    MODEL_CATALOG.iter().find(|info| info.id == model_id)
}

fn model_path(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    let info = model_info(model_id)
        .ok_or_else(|| format!("Unknown dictation model: {model_id}"))?;
    Ok(model_dir(app).join(info.filename))
}

fn model_temp_path(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    let info = model_info(model_id)
        .ok_or_else(|| format!("Unknown dictation model: {model_id}"))?;
    Ok(model_dir(app).join(format!("{}.partial", info.filename)))
}

fn missing_status(model_id: &str) -> DictationModelStatus {
    DictationModelStatus {
        state: DictationModelState::Missing,
        model_id: model_id.to_string(),
        progress: None,
        error: None,
        path: None,
    }
}

fn ready_status(model_id: &str, path: &PathBuf) -> DictationModelStatus {
    DictationModelStatus {
        state: DictationModelState::Ready,
        model_id: model_id.to_string(),
        progress: None,
        error: None,
        path: Some(path.to_string_lossy().to_string()),
    }
}

fn emit_status(app: &AppHandle, status: &DictationModelStatus) {
    let _ = app.emit("dictation-download", status);
}

fn emit_event(app: &AppHandle, event: DictationEvent) {
    let _ = app.emit("dictation-event", event);
}

async fn clear_processing_cancel(
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
) -> bool {
    let state_handle = app.state::<AppState>();
    let mut dictation = state_handle.dictation.lock().await;
    if dictation
        .processing_cancel
        .as_ref()
        .map_or(false, |flag| Arc::ptr_eq(flag, cancel_flag))
    {
        dictation.processing_cancel = None;
        return true;
    }
    false
}

async fn update_status(
    app: &AppHandle,
    state: &State<'_, AppState>,
    status: DictationModelStatus,
) {
    {
        let mut dictation = state.dictation.lock().await;
        dictation.model_status = status.clone();
    }
    emit_status(app, &status);
}

async fn clear_download_state(state: &State<'_, AppState>) {
    let mut dictation = state.dictation.lock().await;
    dictation.download_cancel = None;
    dictation.download_task = None;
}

async fn resolve_model_id(
    state: &State<'_, AppState>,
    model_id: Option<String>,
) -> String {
    let candidate = if let Some(model_id) = model_id {
        model_id
    } else {
        let settings = state.app_settings.lock().await;
        if settings.dictation_model_id.trim().is_empty() {
            DEFAULT_MODEL_ID.to_string()
        } else {
            settings.dictation_model_id.clone()
        }
    };
    if model_info(&candidate).is_some() {
        candidate
    } else {
        DEFAULT_MODEL_ID.to_string()
    }
}

async fn refresh_status(
    app: &AppHandle,
    state: &State<'_, AppState>,
    model_id: &str,
) -> DictationModelStatus {
    let mut dictation = state.dictation.lock().await;
    if dictation.model_status.state == DictationModelState::Downloading
        && dictation.model_status.model_id == model_id
    {
        return dictation.model_status.clone();
    }

    let path = match model_path(app, model_id) {
        Ok(path) => path,
        Err(error) => {
            dictation.model_status = DictationModelStatus {
                state: DictationModelState::Error,
                model_id: model_id.to_string(),
                progress: None,
                error: Some(error),
                path: None,
            };
            return dictation.model_status.clone();
        }
    };

    if path.exists() {
        dictation.model_status = ready_status(model_id, &path);
    } else {
        dictation.model_status = missing_status(model_id);
    }
    dictation.model_status.clone()
}

#[tauri::command]
pub(crate) async fn dictation_model_status(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let model_id = resolve_model_id(&state, model_id).await;
    Ok(refresh_status(&app, &state, &model_id).await)
}

#[tauri::command]
pub(crate) async fn dictation_download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let model_id = resolve_model_id(&state, model_id).await;
    let current = refresh_status(&app, &state, &model_id).await;
    if current.state == DictationModelState::Ready {
        return Ok(current);
    }
    if current.state == DictationModelState::Downloading
        && current.model_id == model_id
    {
        return Ok(current);
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut dictation = state.dictation.lock().await;
        if dictation.model_status.state == DictationModelState::Downloading
            && dictation.model_status.model_id != model_id
        {
            if let Some(flag) = dictation.download_cancel.take() {
                flag.store(true, Ordering::SeqCst);
            }
            if let Some(task) = dictation.download_task.take() {
                task.abort();
            }
        }
        dictation.download_cancel = Some(cancel_flag.clone());
        dictation.model_status = DictationModelStatus {
            state: DictationModelState::Downloading,
            model_id: model_id.clone(),
            progress: Some(DictationDownloadProgress {
                downloaded_bytes: 0,
                total_bytes: None,
            }),
            error: None,
            path: None,
        };
    }
    emit_status(&app, &refresh_status(&app, &state, &model_id).await);

    let app_handle = app.clone();
    let model_id_clone = model_id.clone();
    let task = tokio::spawn(async move {
        let state = app_handle.state::<AppState>();
        let model_dir = model_dir(&app_handle);
        let model_path = match model_path(&app_handle, &model_id_clone) {
            Ok(path) => path,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(error),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };
        let temp_path = match model_temp_path(&app_handle, &model_id_clone) {
            Ok(path) => path,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(error),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };

        if let Err(error) = tokio::fs::create_dir_all(&model_dir).await {
            let status = DictationModelStatus {
                state: DictationModelState::Error,
                model_id: model_id_clone.clone(),
                progress: None,
                error: Some(format!("Failed to create model directory: {error}")),
                path: None,
            };
            update_status(&app_handle, &state, status).await;
            clear_download_state(&state).await;
            return;
        }

        let (url, expected_sha) = match model_info(&model_id_clone) {
            Some(info) => (info.url, info.sha256),
            None => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some("Unknown dictation model.".to_string()),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };
        let client = match reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30 * 60))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(format!("Failed to configure download client: {error}")),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };
        let response = match client.get(url).send().await {
            Ok(response) => response,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(format!("Failed to download model: {error}")),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };
        let response = match response.error_for_status() {
            Ok(response) => response,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(format!("Model download failed: {error}")),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };

        let total = response.content_length();
        let mut downloaded = 0u64;
        let mut file = match tokio::fs::File::create(&temp_path).await {
            Ok(file) => file,
            Err(error) => {
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(format!("Failed to write model: {error}")),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
        };

        let mut response = response;
        let mut hasher = Sha256::new();
        let mut last_progress = Instant::now();
        loop {
            let cancel = {
                let dictation = state.dictation.lock().await;
                dictation
                    .download_cancel
                    .as_ref()
                    .map(|flag| flag.load(Ordering::Relaxed))
                    .unwrap_or(false)
            };
            if cancel {
                let _ = tokio::fs::remove_file(&temp_path).await;
                let status = missing_status(&model_id_clone);
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }

            let chunk = match response.chunk().await {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                Err(error) => {
                    let _ = tokio::fs::remove_file(&temp_path).await;
                    let status = DictationModelStatus {
                        state: DictationModelState::Error,
                        model_id: model_id_clone.clone(),
                        progress: None,
                        error: Some(format!("Model download failed: {error}")),
                        path: None,
                    };
                    update_status(&app_handle, &state, status).await;
                    clear_download_state(&state).await;
                    return;
                }
            };

            if let Err(error) = file.write_all(&chunk).await {
                let _ = tokio::fs::remove_file(&temp_path).await;
                let status = DictationModelStatus {
                    state: DictationModelState::Error,
                    model_id: model_id_clone.clone(),
                    progress: None,
                    error: Some(format!("Failed to write model: {error}")),
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
                clear_download_state(&state).await;
                return;
            }
            downloaded += chunk.len() as u64;
            hasher.update(&chunk);

            if last_progress.elapsed() >= Duration::from_millis(150) {
                last_progress = Instant::now();
                let status = DictationModelStatus {
                    state: DictationModelState::Downloading,
                    model_id: model_id_clone.clone(),
                    progress: Some(DictationDownloadProgress {
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                    }),
                    error: None,
                    path: None,
                };
                update_status(&app_handle, &state, status).await;
            }
        }

        let hash = hasher.finalize();
        let mut hash_hex = String::with_capacity(64);
        for byte in hash {
            use std::fmt::Write;
            let _ = write!(&mut hash_hex, "{:02x}", byte);
        }
        if hash_hex != expected_sha {
            let _ = tokio::fs::remove_file(&temp_path).await;
            let status = DictationModelStatus {
                state: DictationModelState::Error,
                model_id: model_id_clone.clone(),
                progress: None,
                error: Some("Model hash mismatch; download canceled.".to_string()),
                path: None,
            };
            update_status(&app_handle, &state, status).await;
            clear_download_state(&state).await;
            return;
        }

        if let Err(error) = file.flush().await {
            let _ = tokio::fs::remove_file(&temp_path).await;
            let status = DictationModelStatus {
                state: DictationModelState::Error,
                model_id: model_id_clone.clone(),
                progress: None,
                error: Some(format!("Failed to finalize model: {error}")),
                path: None,
            };
            update_status(&app_handle, &state, status).await;
            clear_download_state(&state).await;
            return;
        }

        if let Err(error) = tokio::fs::rename(&temp_path, &model_path).await {
            let _ = tokio::fs::remove_file(&temp_path).await;
            let status = DictationModelStatus {
                state: DictationModelState::Error,
                model_id: model_id_clone.clone(),
                progress: None,
                error: Some(format!("Failed to move model into place: {error}")),
                path: None,
            };
            update_status(&app_handle, &state, status).await;
            clear_download_state(&state).await;
            return;
        }

        let status = ready_status(&model_id_clone, &model_path);
        update_status(&app_handle, &state, status).await;
        clear_download_state(&state).await;
    });

    {
        let mut dictation = state.dictation.lock().await;
        dictation.download_task = Some(task);
    }

    Ok(refresh_status(&app, &state, &model_id).await)
}

#[tauri::command]
pub(crate) async fn dictation_cancel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let model_id = resolve_model_id(&state, model_id).await;
    {
        let mut dictation = state.dictation.lock().await;
        if let Some(flag) = dictation.download_cancel.take() {
            flag.store(true, Ordering::Relaxed);
        }
        if let Some(task) = dictation.download_task.take() {
            task.abort();
        }
        dictation.model_status = missing_status(&model_id);
    }
    if let Ok(temp_path) = model_temp_path(&app, &model_id) {
        let _ = tokio::fs::remove_file(&temp_path).await;
    }
    let status = refresh_status(&app, &state, &model_id).await;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn dictation_remove_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    let model_id = resolve_model_id(&state, model_id).await;
    let model_path = model_path(&app, &model_id)?;
    if model_path.exists() {
        tokio::fs::remove_file(&model_path)
            .await
            .map_err(|error| format!("Failed to remove model: {error}"))?;
    }
    {
        let mut dictation = state.dictation.lock().await;
        if dictation
            .cached_context
            .as_ref()
            .map(|cached| cached.model_id.as_str() == model_id)
            .unwrap_or(false)
        {
            dictation.cached_context = None;
        }
        dictation.model_status = missing_status(&model_id);
    }
    let status = refresh_status(&app, &state, &model_id).await;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
pub(crate) async fn dictation_start(
    preferred_language: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    let model_id = resolve_model_id(&state, None).await;
    let model_status = refresh_status(&app, &state, &model_id).await;
    if model_status.state != DictationModelState::Ready {
        let message = "Dictation model is not downloaded yet.".to_string();
        emit_event(&app, DictationEvent::Error { message: message.clone() });
        return Err(message);
    }
    {
        let dictation = state.dictation.lock().await;
        if dictation.session_state != DictationSessionState::Idle {
            let message = "Dictation is already active.".to_string();
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
    }

    // Request microphone permission before attempting to capture audio
    match request_microphone_permission(&app).await {
        Ok(true) => {
            // Permission granted, continue
        }
        Ok(false) => {
            let message = "Microphone access was denied. Please grant microphone permission in System Settings > Privacy & Security > Microphone.".to_string();
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
        Err(error) => {
            emit_event(&app, DictationEvent::Error { message: error.clone() });
            return Err(error);
        }
    }

    let audio = Arc::new(Mutex::new(Vec::new()));
    let (stop_tx, stop_rx) = mpsc::channel();
    let stop_tx_thread = stop_tx.clone();
    let (ready_tx, ready_rx) = oneshot::channel();
    let (stopped_tx, stopped_rx) = oneshot::channel();
    let app_handle = app.clone();
    let preferred_clone = preferred_language.clone();
    let audio_capture = audio.clone();

    std::thread::spawn(move || {
        start_capture_thread(
            app_handle,
            audio_capture,
            stop_rx,
            stop_tx_thread,
            stopped_tx,
            ready_tx,
        );
    });

    let sample_rate = match ready_rx.await {
        Ok(Ok(rate)) => rate,
        Ok(Err(message)) => {
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
        Err(_) => {
            let message = "Failed to start microphone capture.".to_string();
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
    };

    {
        let mut dictation = state.dictation.lock().await;
        dictation.session_state = DictationSessionState::Listening;
        dictation.session = Some(DictationSessionHandle {
            stop: stop_tx,
            stopped: stopped_rx,
            audio,
            sample_rate,
            model_id: model_id.clone(),
            preferred_language: preferred_clone,
        });
    }

    emit_event(
        &app,
        DictationEvent::State {
            state: DictationSessionState::Listening,
        },
    );

    Ok(DictationSessionState::Listening)
}

#[tauri::command]
pub(crate) async fn dictation_request_permission(app: AppHandle) -> Result<bool, String> {
    request_microphone_permission(&app).await
}

#[tauri::command]
pub(crate) async fn dictation_stop(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let (audio, sample_rate, model_id, preferred_language, stopped, stop_tx) = {
        let mut dictation = state.dictation.lock().await;
        if dictation.session_state != DictationSessionState::Listening {
            let message = "Dictation is not currently listening.".to_string();
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
        dictation.session_state = DictationSessionState::Processing;
        dictation.processing_cancel = Some(Arc::clone(&cancel_flag));
        let session = dictation
            .session
            .take()
            .ok_or_else(|| "Dictation session is unavailable.".to_string())?;
        (
            session.audio,
            session.sample_rate,
            session.model_id,
            session.preferred_language,
            session.stopped,
            session.stop,
        )
    };

    emit_event(
        &app,
        DictationEvent::State {
            state: DictationSessionState::Processing,
        },
    );

    let app_handle = app.clone();
    let _ = stop_tx.send(());
    let _ = stopped.await;
    tokio::spawn(async move {
        let samples = {
            let mut guard = audio.lock().unwrap();
            let captured = guard.clone();
            guard.clear();
            captured
        };
        if cancel_flag.load(Ordering::Relaxed) {
            clear_processing_cancel(&app_handle, &cancel_flag).await;
            return;
        }

        let state_handle = app_handle.state::<AppState>();
        let cached_context = {
            let dictation = state_handle.dictation.lock().await;
            dictation
                .cached_context
                .as_ref()
                .filter(|cached| cached.model_id == model_id)
                .map(|cached| Arc::clone(&cached.context))
        };

        let context = if let Some(context) = cached_context {
            context
        } else {
            let model_path = match model_path(&app_handle, &model_id) {
                Ok(path) => path,
                Err(error) => {
                    emit_event(&app_handle, DictationEvent::Error { message: error });
                    let mut dictation = state_handle.dictation.lock().await;
                    dictation.session_state = DictationSessionState::Idle;
                    emit_event(
                        &app_handle,
                        DictationEvent::State {
                            state: DictationSessionState::Idle,
                        },
                    );
                    return;
                }
            };
            let path = model_path.to_string_lossy().into_owned();
            let created = tokio::task::spawn_blocking(move || {
                WhisperContext::new_with_params(&path, WhisperContextParameters::default())
            })
            .await;
            let context = match created {
                Ok(Ok(context)) => context,
                Ok(Err(error)) => {
                    emit_event(
                        &app_handle,
                        DictationEvent::Error {
                            message: format!("Failed to load Whisper model: {error}"),
                        },
                    );
                    let mut dictation = state_handle.dictation.lock().await;
                    dictation.session_state = DictationSessionState::Idle;
                    emit_event(
                        &app_handle,
                        DictationEvent::State {
                            state: DictationSessionState::Idle,
                        },
                    );
                    return;
                }
                Err(error) => {
                    emit_event(
                        &app_handle,
                        DictationEvent::Error {
                            message: format!("Failed to load Whisper model: {error}"),
                        },
                    );
                    let mut dictation = state_handle.dictation.lock().await;
                    dictation.session_state = DictationSessionState::Idle;
                    emit_event(
                        &app_handle,
                        DictationEvent::State {
                            state: DictationSessionState::Idle,
                        },
                    );
                    return;
                }
            };
            let context = Arc::new(context);
            let mut dictation = state_handle.dictation.lock().await;
            dictation.cached_context = Some(CachedWhisperContext {
                model_id: model_id.clone(),
                context: Arc::clone(&context),
            });
            context
        };

        let preferred = preferred_language.clone();

        let result = tokio::task::spawn_blocking(move || {
            transcribe_audio(samples, sample_rate, &context, preferred)
        })
        .await;

        let outcome = match result {
            Ok(result) => result,
            Err(error) => Err(format!("Transcription task failed: {error}")),
        };

        if cancel_flag.load(Ordering::Relaxed) {
            clear_processing_cancel(&app_handle, &cancel_flag).await;
            return;
        }

        match outcome {
            Ok(text) => {
                if !text.trim().is_empty() {
                    emit_event(
                        &app_handle,
                        DictationEvent::Transcript { text },
                    );
                }
            }
            Err(message) => {
                emit_event(
                    &app_handle,
                    DictationEvent::Error { message },
                );
            }
        }

        clear_processing_cancel(&app_handle, &cancel_flag).await;
        let state_handle = app_handle.state::<AppState>();
        let mut dictation = state_handle.dictation.lock().await;
        dictation.session_state = DictationSessionState::Idle;
        emit_event(
            &app_handle,
            DictationEvent::State {
                state: DictationSessionState::Idle,
            },
        );
    });

    Ok(DictationSessionState::Processing)
}

#[tauri::command]
pub(crate) async fn dictation_cancel(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    {
        let mut dictation = state.dictation.lock().await;
        if dictation.session_state == DictationSessionState::Processing {
            if let Some(flag) = dictation.processing_cancel.take() {
                flag.store(true, Ordering::Relaxed);
            }
            dictation.session_state = DictationSessionState::Idle;
            emit_event(
                &app,
                DictationEvent::State {
                    state: DictationSessionState::Idle,
                },
            );
            emit_event(
                &app,
                DictationEvent::Canceled {
                    message: "Canceled".to_string(),
                },
            );
            return Ok(DictationSessionState::Idle);
        }
    }
    let (audio, stopped, stop_tx) = {
        let mut dictation = state.dictation.lock().await;
        if dictation.session_state != DictationSessionState::Listening {
            let message = "Dictation is not currently listening.".to_string();
            emit_event(&app, DictationEvent::Error { message: message.clone() });
            return Err(message);
        }
        dictation.session_state = DictationSessionState::Idle;
        let session = dictation
            .session
            .take()
            .ok_or_else(|| "Dictation session is unavailable.".to_string())?;
        (session.audio, session.stopped, session.stop)
    };

    let _ = stop_tx.send(());
    let _ = stopped.await;
    {
        let mut guard = audio.lock().unwrap();
        guard.clear();
    }

    emit_event(
        &app,
        DictationEvent::State {
            state: DictationSessionState::Idle,
        },
    );
    emit_event(
        &app,
        DictationEvent::Canceled {
            message: "Canceled".to_string(),
        },
    );

    Ok(DictationSessionState::Idle)
}

fn start_capture_thread(
    app: AppHandle,
    audio: Arc<Mutex<Vec<f32>>>,
    stop_rx: mpsc::Receiver<()>,
    stop_tx: mpsc::Sender<()>,
    stopped_tx: oneshot::Sender<()>,
    ready_tx: oneshot::Sender<Result<u32, String>>,
) {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device available.".to_string());
    let device = match device {
        Ok(device) => device,
        Err(error) => {
            let _ = ready_tx.send(Err(error));
            let _ = stopped_tx.send(());
            return;
        }
    };
    let config = device
        .default_input_config()
        .map_err(|error| format!("Failed to read microphone config: {error}"));
    let config = match config {
        Ok(config) => config,
        Err(error) => {
            let _ = ready_tx.send(Err(error));
            let _ = stopped_tx.send(());
            return;
        }
    };
    let sample_rate = config.sample_rate().0;
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();
    let channels = stream_config.channels as usize;
    let max_samples = (sample_rate as usize)
        .saturating_mul(MAX_CAPTURE_SECONDS as usize)
        .max(1);
    let app_handle = app.clone();
    let audio_capture = audio.clone();
    let stop_on_error = stop_tx.clone();

    let err_fn = move |error| {
        emit_event(
            &app_handle,
            DictationEvent::Error {
                message: format!("Microphone error: {error}"),
            },
        );
        let _ = stop_on_error.send(());
        let state_app = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let state_handle = state_app.state::<AppState>();
            let should_emit = {
                let mut dictation = state_handle.dictation.lock().await;
                if dictation.session_state == DictationSessionState::Idle {
                    false
                } else {
                    dictation.session_state = DictationSessionState::Idle;
                    dictation.session = None;
                    true
                }
            };
            if should_emit {
                emit_event(
                    &state_app,
                    DictationEvent::State {
                        state: DictationSessionState::Idle,
                    },
                );
            }
        });
    };

    let level_value = Arc::new(AtomicU32::new(0));

    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(
            &device,
            &stream_config,
            channels,
            max_samples,
            audio_capture,
            level_value.clone(),
            err_fn,
        ),
        SampleFormat::I16 => build_stream::<i16>(
            &device,
            &stream_config,
            channels,
            max_samples,
            audio_capture,
            level_value.clone(),
            err_fn,
        ),
        SampleFormat::U16 => build_stream::<u16>(
            &device,
            &stream_config,
            channels,
            max_samples,
            audio_capture,
            level_value.clone(),
            err_fn,
        ),
        _ => {
            let _ = ready_tx.send(Err("Unsupported microphone sample format.".to_string()));
            let _ = stopped_tx.send(());
            return;
        }
    };

    let stream = match stream {
        Ok(stream) => stream,
        Err(error) => {
            let _ = ready_tx.send(Err(error));
            let _ = stopped_tx.send(());
            return;
        }
    };
    if let Err(error) = stream.play() {
        let _ = ready_tx.send(Err(format!("Failed to start microphone: {error}")));
        let _ = stopped_tx.send(());
        return;
    }

    let running = Arc::new(AtomicBool::new(true));
    let level_task_app = app.clone();
    let level_task_value = level_value.clone();
    let level_task_running = running.clone();
    std::thread::spawn(move || {
        while level_task_running.load(Ordering::Relaxed) {
            let value = f32::from_bits(level_task_value.load(Ordering::Relaxed));
            emit_event(&level_task_app, DictationEvent::Level { value });
            std::thread::sleep(Duration::from_millis(33));
        }
    });

    eprintln!(
        "dictation: capture started (rate={}Hz, channels={}, format={:?})",
        sample_rate, channels, sample_format
    );
    let _ = ready_tx.send(Ok(sample_rate));
    let _ = stop_rx.recv();
    running.store(false, Ordering::Relaxed);
    drop(stream);
    let _ = stopped_tx.send(());
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    max_samples: usize,
    audio: Arc<Mutex<Vec<f32>>>,
    level_value: Arc<AtomicU32>,
    err_fn: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<cpal::Stream, String>
where
    T: Sample + SizedSample,
    f32: FromSample<T>,
{
    let channels = channels.max(1);
    let mut mono_buffer: Vec<f32> = Vec::with_capacity(2048);
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if data.is_empty() {
                    return;
                }
                let mut sum = 0.0f32;
                let mut frames = 0usize;
                mono_buffer.clear();
                let target_len = data.len() / channels;
                if mono_buffer.capacity() < target_len {
                    mono_buffer.reserve(target_len - mono_buffer.capacity());
                }
                for frame in data.chunks(channels) {
                    let mut frame_sum = 0.0f32;
                    let mut count = 0usize;
                    for sample in frame {
                        let value: f32 = sample.to_sample();
                        frame_sum += value;
                        count += 1;
                    }
                    if count == 0 {
                        continue;
                    }
                    let mono = frame_sum / count as f32;
                    mono_buffer.push(mono);
                    sum += mono * mono;
                    frames += 1;
                }
                if frames == 0 {
                    return;
                }
                if let Ok(mut buffer) = audio.lock() {
                    if buffer.len() < max_samples {
                        let remaining = max_samples.saturating_sub(buffer.len());
                        let slice_len = remaining.min(mono_buffer.len());
                        if slice_len > 0 {
                            buffer.extend_from_slice(&mono_buffer[..slice_len]);
                        }
                    }
                }
                let rms = (sum / frames as f32).sqrt();
                let scaled = (rms * 6.0).clamp(0.0, 1.0);
                level_value.store(scaled.to_bits(), Ordering::Relaxed);
            },
            err_fn,
            None,
        )
        .map_err(|error| format!("Failed to build microphone stream: {error}"))
}

fn transcribe_audio(
    samples: Vec<f32>,
    sample_rate: u32,
    context: &WhisperContext,
    preferred_language: Option<String>,
) -> Result<String, String> {
    if samples.is_empty() {
        return Ok(String::new());
    }
    let mut max = 0.0f32;
    let mut sum = 0.0f32;
    let mean = samples.iter().copied().sum::<f32>() / samples.len() as f32;
    let mut normalized = Vec::with_capacity(samples.len());
    for value in &samples {
        let centered = value - mean;
        let abs = centered.abs();
        if abs > max {
            max = abs;
        }
        sum += centered * centered;
        normalized.push(centered);
    }
    let rms = (sum / samples.len() as f32).sqrt();
    let duration = samples.len() as f32 / sample_rate as f32;
    let gain = if max > 0.0 { (0.6 / max).min(10.0) } else { 1.0 };
    if gain != 1.0 {
        for value in &mut normalized {
            *value = (*value * gain).clamp(-1.0, 1.0);
        }
    }
    eprintln!(
        "dictation: captured {} samples ({:.2}s), max={:.4}, rms={:.4}, gain={:.2}",
        samples.len(),
        duration,
        max,
        rms,
        gain
    );
    if duration < 0.2 {
        return Err("Audio too short for transcription.".to_string());
    }
    let audio = if sample_rate == 16_000 {
        normalized
    } else {
        resample_audio(&normalized, sample_rate, 16_000)
    };

    let mut state = context
        .create_state()
        .map_err(|error| format!("Failed to initialize Whisper: {error}"))?;
    let threads = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_no_timestamps(true);
    params.set_translate(false);
    params.set_no_context(true);
    params.set_single_segment(false);
    let mut forced_language: Option<String> = None;
    if let Some(preferred) = preferred_language.clone() {
        if let Some(pref_id) = get_lang_id(&preferred) {
            if state.pcm_to_mel(&audio, threads).is_ok() {
                if let Ok((_detected, probs)) = state.lang_detect(0, threads) {
                    let pref_index = pref_id.max(0) as usize;
                    let pref_prob = probs.get(pref_index).copied().unwrap_or(0.0);
                    let best_prob = probs
                        .iter()
                        .copied()
                        .fold(0.0_f32, |acc, value| acc.max(value));
                    if best_prob > 0.0 && (best_prob - pref_prob) <= 0.30 {
                        forced_language = Some(preferred);
                    }
                }
            }
        }
    }

    if let Some(language) = forced_language.as_deref() {
        // Use the preferred language only when detection is ambiguous.
        params.set_language(Some(language));
    } else {
        // Auto-detect language while still running transcription.
        params.set_language(Some("auto"));
    }
    params.set_n_threads(threads as i32);

    state
        .full(params, &audio)
        .map_err(|error| format!("Transcription failed: {error}"))?;

    let segments = state
        .full_n_segments()
        .map_err(|error| format!("Failed to read segments: {error}"))?;
    eprintln!("dictation: whisper segments={}", segments);
    let mut transcript = String::new();
    for index in 0..segments {
        let segment = state
            .full_get_segment_text(index)
            .map_err(|error| format!("Failed to read segment: {error}"))?;
        transcript.push_str(&segment);
    }
    let cleaned = transcript.trim().to_string();
    if cleaned.is_empty() {
        eprintln!(
            "dictation: no speech detected (rms={:.4}, max={:.4}, duration={:.2}s, segments={})",
            rms, max, duration, segments
        );
        return Ok(String::new());
    }
    Ok(cleaned)
}

fn resample_audio(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = to_rate as f64 / from_rate as f64;
    let new_len = (samples.len() as f64 * ratio).round() as usize;
    let mut out = Vec::with_capacity(new_len.max(1));
    for i in 0..new_len {
        let pos = i as f64 / ratio;
        let idx = pos.floor() as usize;
        let frac = pos - idx as f64;
        let s0 = samples.get(idx).copied().unwrap_or(0.0);
        let s1 = samples.get(idx + 1).copied().unwrap_or(s0);
        out.push((s0 as f64 + (s1 as f64 - s0 as f64) * frac) as f32);
    }
    out
}
