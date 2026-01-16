use tauri::State;

use crate::state::AppState;
use crate::storage::write_settings;
use crate::types::AppSettings;

#[tauri::command]
pub(crate) async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.app_settings.lock().await;
    Ok(settings.clone())
}

fn merge_settings(current: &AppSettings, incoming: &AppSettings) -> AppSettings {
    let mut merged = incoming.clone();

    // Preserve generated secrets if a stale client sends empty values.
    if merged.telegram_pairing_secret.trim().is_empty() {
        merged.telegram_pairing_secret = current.telegram_pairing_secret.clone();
    }

    // Linking happens out-of-band (via Telegram). Make this additive so a stale UI
    // snapshot can't wipe the allowlist.
    if !current.telegram_allowed_user_ids.is_empty() {
        let mut ids = current.telegram_allowed_user_ids.clone();
        for id in &incoming.telegram_allowed_user_ids {
            if !ids.contains(id) {
                ids.push(*id);
            }
        }
        merged.telegram_allowed_user_ids = ids;
    }

    // Default chat id is learned during linking; don't lose it if the UI sends null.
    if merged.telegram_default_chat_id.is_none() {
        merged.telegram_default_chat_id = current.telegram_default_chat_id;
    }

    merged
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut current = state.app_settings.lock().await;
    let merged = merge_settings(&current, &settings);
    write_settings(&state.settings_path, &merged)?;
    *current = merged.clone();
    Ok(merged)
}
