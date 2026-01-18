use tauri::State;

use crate::codex_config;
use crate::state::AppState;
use crate::storage::write_settings;
use crate::types::AppSettings;

#[tauri::command]
pub(crate) async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
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
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let _ = codex_config::write_collab_enabled(settings.experimental_collab_enabled);
    let _ = codex_config::write_steer_enabled(settings.experimental_steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(settings.experimental_unified_exec_enabled);
    write_settings(&state.settings_path, &settings)?;
    let mut current = state.app_settings.lock().await;
    *current = settings.clone();
    Ok(settings)
}
