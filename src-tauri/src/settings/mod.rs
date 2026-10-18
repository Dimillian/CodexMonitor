use tauri::{AppHandle, State, Window};

use crate::codex::home::{resolve_codex_home_status, CodexHomeStatus};
use crate::shared::settings_core::{
    get_app_settings_core, get_codex_config_path_core, get_codex_home_core,
    update_app_settings_core,
};
use crate::shared::workspaces_core::{disconnect_all_sessions_core, workspace_session_spawn_lock};
use crate::state::AppState;
use crate::types::{AppSettings, BackendMode};
use crate::window;

#[tauri::command]
pub(crate) async fn get_app_settings(
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let settings = get_app_settings_core(&state.app_settings).await;
    let _ = window::apply_window_appearance(&window, settings.theme.as_str());
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let _spawn_guard = workspace_session_spawn_lock().lock().await;
    let previous = state.app_settings.lock().await.clone();
    let updated =
        update_app_settings_core(settings, &state.app_settings, &state.settings_path).await?;
    if previous.codex_home != updated.codex_home {
        disconnect_all_sessions_core(&state.sessions).await;
    }
    if should_reset_remote_backend(&previous, &updated) {
        *state.remote_backend.lock().await = None;
    }
    ensure_remote_runtime_for_settings(&updated, state).await;
    let _ = window::apply_window_appearance(&window, updated.theme.as_str());
    Ok(updated)
}

#[tauri::command]
pub(crate) async fn get_codex_config_path(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    if crate::remote_backend::is_remote_mode(&state).await {
        let response = crate::remote_backend::call_remote(
            &state,
            app,
            "get_codex_config_path",
            serde_json::json!({}),
        )
        .await?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }
    get_codex_config_path_core(&state.app_settings).await
}

#[tauri::command]
pub(crate) async fn get_codex_home(state: State<'_, AppState>) -> Result<CodexHomeStatus, String> {
    get_codex_home_core(&state.app_settings).await
}

#[tauri::command]
pub(crate) async fn validate_codex_home(
    codex_home: Option<String>,
) -> Result<CodexHomeStatus, String> {
    resolve_codex_home_status(codex_home.as_deref())
}

fn should_reset_remote_backend(previous: &AppSettings, updated: &AppSettings) -> bool {
    let backend_mode_changed = !matches!(
        (&previous.backend_mode, &updated.backend_mode),
        (
            crate::types::BackendMode::Local,
            crate::types::BackendMode::Local
        ) | (
            crate::types::BackendMode::Remote,
            crate::types::BackendMode::Remote
        )
    );
    backend_mode_changed
        || previous.remote_backend_provider != updated.remote_backend_provider
        || previous.remote_backend_host != updated.remote_backend_host
        || previous.remote_backend_token != updated.remote_backend_token
}

async fn ensure_remote_runtime_for_settings(settings: &AppSettings, state: State<'_, AppState>) {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return;
    }
    if !matches!(settings.backend_mode, BackendMode::Remote) {
        return;
    }

    let _ = crate::tailscale::tailscale_daemon_start(state).await;
}

#[cfg(test)]
mod tests {
    use super::should_reset_remote_backend;
    use crate::types::{AppSettings, BackendMode};

    #[test]
    fn should_reset_remote_backend_when_provider_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.remote_backend_provider = crate::types::RemoteBackendProvider::Tcp;
        updated.remote_backend_host = "remote.example:4732".to_string();
        assert!(should_reset_remote_backend(&previous, &updated));
    }

    #[test]
    fn should_reset_remote_backend_when_transport_token_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.remote_backend_token = Some("token-1".to_string());
        assert!(should_reset_remote_backend(&previous, &updated));
    }

    #[test]
    fn should_not_reset_remote_backend_for_non_transport_setting_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.theme = "dark".to_string();
        updated.backend_mode = BackendMode::Local;
        assert!(!should_reset_remote_backend(&previous, &updated));
    }
}
