use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::fs;

use crate::daemon_binary::resolve_daemon_binary_path;
use crate::shared::orbit_core;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::shared::settings_core;
use crate::state::{AppState, OrbitRunnerRuntime};
use crate::types::{
    OrbitConnectTestResult, OrbitRunnerState, OrbitRunnerStatus, OrbitSignInPollResult,
    OrbitSignInStatus, OrbitSignOutResult,
};

const CURRENT_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const ORBIT_RUNNER_RECORD_FILE: &str = "orbit_runner.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrbitRunnerRecord {
    pid: u32,
    version: String,
    orbit_url: Option<String>,
    started_at_ms: Option<i64>,
}

fn orbit_runner_record_path(state: &AppState) -> Option<std::path::PathBuf> {
    state
        .settings_path
        .parent()
        .map(|parent| parent.join(ORBIT_RUNNER_RECORD_FILE))
}

async fn load_orbit_runner_record(state: &AppState) -> Option<OrbitRunnerRecord> {
    let path = orbit_runner_record_path(state)?;
    let payload = fs::read(path).await.ok()?;
    serde_json::from_slice(&payload).ok()
}

async fn save_orbit_runner_record(state: &AppState, record: &OrbitRunnerRecord) {
    let Some(path) = orbit_runner_record_path(state) else {
        return;
    };
    let Ok(payload) = serde_json::to_vec(record) else {
        return;
    };
    let _ = fs::write(path, payload).await;
}

async fn clear_orbit_runner_record(state: &AppState) {
    let Some(path) = orbit_runner_record_path(state) else {
        return;
    };
    let _ = fs::remove_file(path).await;
}

#[cfg(unix)]
async fn is_pid_running(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as i32, 0) };
    if result == 0 {
        return true;
    }
    match std::io::Error::last_os_error().raw_os_error() {
        Some(code) => code != libc::ESRCH,
        None => false,
    }
}

#[cfg(windows)]
async fn is_pid_running(pid: u32) -> bool {
    let output = match tokio_command("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
        .await
    {
        Ok(output) => output,
        Err(_) => return false,
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().any(|line| line.contains(&format!("\"{pid}\"")))
}

#[cfg(not(any(unix, windows)))]
async fn is_pid_running(_pid: u32) -> bool {
    false
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

async fn refresh_runner_runtime(runtime: &mut OrbitRunnerRuntime) {
    let Some(child) = runtime.child.as_mut() else {
        runtime.status.state = OrbitRunnerState::Stopped;
        runtime.status.pid = None;
        runtime.managed_version = None;
        return;
    };

    match child.try_wait() {
        Ok(Some(status)) => {
            let pid = child.id();
            runtime.child = None;
            if status.success() {
                runtime.status = OrbitRunnerStatus {
                    state: OrbitRunnerState::Stopped,
                    pid,
                    started_at_ms: None,
                    last_error: None,
                    orbit_url: runtime.status.orbit_url.clone(),
                };
            } else {
                runtime.status = OrbitRunnerStatus {
                    state: OrbitRunnerState::Error,
                    pid,
                    started_at_ms: runtime.status.started_at_ms,
                    last_error: Some(format!("Runner exited with status: {status}")),
                    orbit_url: runtime.status.orbit_url.clone(),
                };
            }
            runtime.managed_version = None;
        }
        Ok(None) => {
            runtime.status.state = OrbitRunnerState::Running;
            runtime.status.pid = child.id();
            runtime.status.last_error = None;
        }
        Err(err) => {
            runtime.status = OrbitRunnerStatus {
                state: OrbitRunnerState::Error,
                pid: child.id(),
                started_at_ms: runtime.status.started_at_ms,
                last_error: Some(format!("Failed to inspect runner process: {err}")),
                orbit_url: runtime.status.orbit_url.clone(),
            };
            runtime.managed_version = None;
        }
    }
}

#[tauri::command]
pub(crate) async fn orbit_connect_test(
    state: State<'_, AppState>,
) -> Result<OrbitConnectTestResult, String> {
    let settings = state.app_settings.lock().await.clone();
    let ws_url = orbit_core::orbit_ws_url_from_settings(&settings)?;
    orbit_core::orbit_connect_test_core(&ws_url, settings.remote_backend_token.as_deref()).await
}

#[tauri::command]
pub(crate) async fn orbit_sign_in_start(
    state: State<'_, AppState>,
) -> Result<crate::types::OrbitDeviceCodeStart, String> {
    let settings = state.app_settings.lock().await.clone();
    let auth_url = orbit_core::orbit_auth_url_from_settings(&settings)?;
    orbit_core::orbit_sign_in_start_core(&auth_url, settings.orbit_runner_name.as_deref()).await
}

#[tauri::command]
pub(crate) async fn orbit_sign_in_poll(
    device_code: String,
    state: State<'_, AppState>,
) -> Result<OrbitSignInPollResult, String> {
    let auth_url = {
        let settings = state.app_settings.lock().await.clone();
        orbit_core::orbit_auth_url_from_settings(&settings)?
    };
    let result = orbit_core::orbit_sign_in_poll_core(&auth_url, &device_code).await?;

    if matches!(result.status, OrbitSignInStatus::Authorized) {
        if let Some(token) = result.token.as_ref() {
            let _ = settings_core::update_remote_backend_token_core(
                &state.app_settings,
                &state.settings_path,
                Some(token),
            )
            .await?;
        }
    }

    Ok(result)
}

#[tauri::command]
pub(crate) async fn orbit_sign_out(
    state: State<'_, AppState>,
) -> Result<OrbitSignOutResult, String> {
    let settings = state.app_settings.lock().await.clone();
    let auth_url = orbit_core::orbit_auth_url_optional(&settings);
    let token = orbit_core::remote_backend_token_optional(&settings);

    let mut logout_error: Option<String> = None;
    if let (Some(auth_url), Some(token)) = (auth_url.as_ref(), token.as_ref()) {
        if let Err(err) = orbit_core::orbit_sign_out_core(auth_url, token).await {
            logout_error = Some(err);
        }
    }

    let _ = settings_core::update_remote_backend_token_core(
        &state.app_settings,
        &state.settings_path,
        None,
    )
    .await?;

    Ok(OrbitSignOutResult {
        success: logout_error.is_none(),
        message: logout_error,
    })
}

#[tauri::command]
pub(crate) async fn orbit_runner_start(
    state: State<'_, AppState>,
) -> Result<OrbitRunnerStatus, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("Orbit runner start is only supported on desktop.".to_string());
    }

    let settings = state.app_settings.lock().await.clone();
    let ws_url = orbit_core::orbit_ws_url_from_settings(&settings)?;
    let daemon_binary = resolve_daemon_binary_path()?;

    let data_dir = state
        .settings_path
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Unable to resolve app data directory".to_string())?;

    let persisted_runner = load_orbit_runner_record(&state).await;

    let mut runtime = state.orbit_runner.lock().await;
    refresh_runner_runtime(&mut runtime).await;
    if matches!(runtime.status.state, OrbitRunnerState::Running) {
        if runtime.managed_version.as_deref() == Some(CURRENT_APP_VERSION) {
            return Ok(runtime.status.clone());
        }

        if runtime.child.is_none() {
            let pid_display = runtime
                .status
                .pid
                .map(|pid| pid.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let message = format!(
                "Orbit runner (pid {pid_display}) is already running outside this app process. Stop it first to avoid duplicate runners."
            );
            runtime.status.last_error = Some(message.clone());
            return Err(message);
        }

        if let Some(mut child) = runtime.child.take() {
            kill_child_process_tree(&mut child).await;
            let _ = child.wait().await;
        }
        runtime.status = OrbitRunnerStatus {
            state: OrbitRunnerState::Stopped,
            pid: None,
            started_at_ms: None,
            last_error: None,
            orbit_url: runtime.status.orbit_url.clone(),
        };
        runtime.managed_version = None;
    }

    if let Some(record) = persisted_runner {
        if is_pid_running(record.pid).await {
            runtime.status = OrbitRunnerStatus {
                state: OrbitRunnerState::Running,
                pid: Some(record.pid),
                started_at_ms: record.started_at_ms,
                last_error: None,
                orbit_url: record.orbit_url.or_else(|| Some(ws_url.clone())),
            };
            runtime.managed_version = Some(record.version.clone());
            if record.version == CURRENT_APP_VERSION {
                return Ok(runtime.status.clone());
            }
            let message = format!(
                "Orbit runner version {} does not match app version {}. Stop the existing runner before starting a new one.",
                record.version, CURRENT_APP_VERSION
            );
            runtime.status.last_error = Some(message.clone());
            return Err(message);
        }
        clear_orbit_runner_record(&state).await;
    }

    let mut command = tokio_command(&daemon_binary);
    command
        .arg("--data-dir")
        .arg(data_dir)
        .arg("--orbit-url")
        .arg(ws_url.clone())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(token) = settings
        .remote_backend_token
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        command.arg("--orbit-token").arg(token);
    }

    if let Some(auth_url) = settings
        .orbit_auth_url
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        command.arg("--orbit-auth-url").arg(auth_url);
    }

    if let Some(runner_name) = settings
        .orbit_runner_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        command.arg("--orbit-runner-name").arg(runner_name);
    }

    let child = command
        .spawn()
        .map_err(|err| format!("Failed to start Orbit runner daemon: {err}"))?;

    runtime.status = OrbitRunnerStatus {
        state: OrbitRunnerState::Running,
        pid: child.id(),
        started_at_ms: Some(now_unix_ms()),
        last_error: None,
        orbit_url: Some(ws_url),
    };
    runtime.child = Some(child);
    runtime.managed_version = Some(CURRENT_APP_VERSION.to_string());
    if let Some(pid) = runtime.status.pid {
        save_orbit_runner_record(
            &state,
            &OrbitRunnerRecord {
                pid,
                version: CURRENT_APP_VERSION.to_string(),
                orbit_url: runtime.status.orbit_url.clone(),
                started_at_ms: runtime.status.started_at_ms,
            },
        )
        .await;
    }

    Ok(runtime.status.clone())
}

#[tauri::command]
pub(crate) async fn orbit_runner_stop(
    state: State<'_, AppState>,
) -> Result<OrbitRunnerStatus, String> {
    let mut runtime = state.orbit_runner.lock().await;
    if let Some(mut child) = runtime.child.take() {
        kill_child_process_tree(&mut child).await;
        let _ = child.wait().await;
        clear_orbit_runner_record(&state).await;
    }

    runtime.status = OrbitRunnerStatus {
        state: OrbitRunnerState::Stopped,
        pid: None,
        started_at_ms: None,
        last_error: None,
        orbit_url: runtime.status.orbit_url.clone(),
    };
    runtime.managed_version = None;

    Ok(runtime.status.clone())
}

#[tauri::command]
pub(crate) async fn orbit_runner_status(
    state: State<'_, AppState>,
) -> Result<OrbitRunnerStatus, String> {
    let settings = state.app_settings.lock().await.clone();
    let configured_orbit_url = settings
        .orbit_ws_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let mut runtime = state.orbit_runner.lock().await;
    refresh_runner_runtime(&mut runtime).await;
    if !matches!(runtime.status.state, OrbitRunnerState::Running) {
        if let Some(record) = load_orbit_runner_record(&state).await {
            if is_pid_running(record.pid).await {
                runtime.status = OrbitRunnerStatus {
                    state: OrbitRunnerState::Running,
                    pid: Some(record.pid),
                    started_at_ms: record.started_at_ms,
                    last_error: None,
                    orbit_url: record.orbit_url.clone(),
                };
                runtime.managed_version = Some(record.version);
            } else {
                clear_orbit_runner_record(&state).await;
            }
        }
    }
    if runtime.status.orbit_url.is_none() {
        runtime.status.orbit_url = configured_orbit_url;
    }

    Ok(runtime.status.clone())
}
