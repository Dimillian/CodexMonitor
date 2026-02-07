use std::path::PathBuf;
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::shared::orbit_core;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::shared::settings_core;
use crate::state::{AppState, OrbitRunnerRuntime};
use crate::types::{
    OrbitConnectTestResult, OrbitRunnerState, OrbitRunnerStatus, OrbitSignInPollResult,
    OrbitSignInStatus, OrbitSignOutResult,
};

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn daemon_binary_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &["codex_monitor_daemon.exe", "codex-monitor-daemon.exe"]
    } else {
        &["codex_monitor_daemon", "codex-monitor-daemon"]
    }
}

fn resolve_daemon_binary_path() -> Result<PathBuf, String> {
    let current_exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let parent = current_exe
        .parent()
        .ok_or_else(|| "Unable to resolve executable directory".to_string())?;
    let candidate_names = daemon_binary_candidates();

    for name in candidate_names {
        let candidate = parent.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Unable to locate daemon binary in {} (tried: {})",
        parent.display(),
        candidate_names.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::daemon_binary_candidates;

    #[test]
    fn daemon_binary_candidates_prioritize_underscored_name() {
        assert!(daemon_binary_candidates()[0].starts_with("codex_monitor_daemon"));
    }
}

async fn refresh_runner_runtime(runtime: &mut OrbitRunnerRuntime) {
    let Some(child) = runtime.child.as_mut() else {
        runtime.status.state = OrbitRunnerState::Stopped;
        runtime.status.pid = None;
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

    let mut runtime = state.orbit_runner.lock().await;
    refresh_runner_runtime(&mut runtime).await;
    if matches!(runtime.status.state, OrbitRunnerState::Running) {
        return Ok(runtime.status.clone());
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
    }

    runtime.status = OrbitRunnerStatus {
        state: OrbitRunnerState::Stopped,
        pid: None,
        started_at_ms: None,
        last_error: None,
        orbit_url: runtime.status.orbit_url.clone(),
    };

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
    if runtime.status.orbit_url.is_none() {
        runtime.status.orbit_url = configured_orbit_url;
    }

    Ok(runtime.status.clone())
}
