use tauri::{AppHandle, State, Window};

use crate::codex_config;
use crate::integrations;
use crate::state::AppState;
use crate::storage::write_settings;
use crate::types::AppSettings;
use crate::window;

#[tauri::command]
pub(crate) async fn get_app_settings(
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let mut settings = state.app_settings.lock().await.clone();
    if let Ok(Some(collab_enabled)) = codex_config::read_collab_enabled() {
        settings.experimental_collab_enabled = collab_enabled;
    }
    if let Ok(Some(steer_enabled)) = codex_config::read_steer_enabled() {
        settings.experimental_steer_enabled = steer_enabled;
    }
    if let Ok(Some(unified_exec_enabled)) = codex_config::read_unified_exec_enabled() {
        settings.experimental_unified_exec_enabled = unified_exec_enabled;
    }
    let _ = window::apply_window_appearance(&window, settings.theme.as_str());
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    window: Window,
    app: AppHandle,
) -> Result<AppSettings, String> {
    // Merge in bot-managed fields to prevent the UI from accidentally clearing
    // persisted Telegram pairing state.
    let merged = {
        let current = state.app_settings.lock().await.clone();
        let mut merged = settings.clone();

        if merged.telegram_allowed_user_ids.is_none() && current.telegram_allowed_user_ids.is_some()
        {
            merged.telegram_allowed_user_ids = current.telegram_allowed_user_ids.clone();
        }
        if merged.telegram_default_chat_id.is_none() && current.telegram_default_chat_id.is_some() {
            merged.telegram_default_chat_id = current.telegram_default_chat_id;
        }
        if merged.telegram_pairing_secret.trim().is_empty()
            || merged.telegram_pairing_secret == "unknown"
        {
            merged.telegram_pairing_secret = current.telegram_pairing_secret.clone();
        }

        merged
    };

    let _ = codex_config::write_collab_enabled(settings.experimental_collab_enabled);
    let _ = codex_config::write_steer_enabled(settings.experimental_steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(settings.experimental_unified_exec_enabled);
    write_settings(&state.settings_path, &merged)?;
    let mut current = state.app_settings.lock().await;
    *current = merged.clone();
    let _ = window::apply_window_appearance(&window, merged.theme.as_str());
    tauri::async_runtime::spawn(integrations::apply_settings(app));
    Ok(merged)
}
