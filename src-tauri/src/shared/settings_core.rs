use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::storage::write_settings;
use crate::types::AppSettings;

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut settings = app_settings.lock().await.clone();
    if let Ok(Some(collab_enabled)) = codex_config::read_collab_enabled() {
        settings.experimental_collab_enabled = collab_enabled;
    }
    if let Ok(Some(collaboration_modes_enabled)) = codex_config::read_collaboration_modes_enabled()
    {
        settings.collaboration_modes_enabled = collaboration_modes_enabled;
    }
    if let Ok(Some(steer_enabled)) = codex_config::read_steer_enabled() {
        settings.steer_enabled = steer_enabled;
    }
    if let Ok(Some(unified_exec_enabled)) = codex_config::read_unified_exec_enabled() {
        settings.unified_exec_enabled = unified_exec_enabled;
    }
    if let Ok(Some(apps_enabled)) = codex_config::read_apps_enabled() {
        settings.experimental_apps_enabled = apps_enabled;
    }
    if let Ok(personality) = codex_config::read_personality() {
        settings.personality = personality
            .as_deref()
            .and_then(normalize_personality)
            .unwrap_or("friendly")
            .to_string();
    }
    settings
}

pub(crate) async fn update_app_settings_core(
    settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    let _ = codex_config::write_collab_enabled(settings.experimental_collab_enabled);
    let _ = codex_config::write_collaboration_modes_enabled(settings.collaboration_modes_enabled);
    let _ = codex_config::write_steer_enabled(settings.steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(settings.unified_exec_enabled);
    let _ = codex_config::write_apps_enabled(settings.experimental_apps_enabled);
    let _ = codex_config::write_personality(settings.personality.as_str());
    write_settings(settings_path, &settings)?;
    let mut current = app_settings.lock().await;
    *current = settings.clone();
    Ok(settings)
}

pub(crate) async fn update_remote_backend_token_core(
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
    token: Option<&str>,
    remote_backend_id: Option<&str>,
) -> Result<AppSettings, String> {
    let normalized_token = token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let normalized_remote_backend_id = remote_backend_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut next_settings = app_settings.lock().await.clone();
    let mut changed = false;

    if next_settings.remote_backends.is_empty() {
        if next_settings.remote_backend_token != normalized_token {
            next_settings.remote_backend_token = normalized_token.clone();
            changed = true;
        }
    } else {
        let active_index = next_settings
            .active_remote_backend_id
            .as_ref()
            .and_then(|id| {
                next_settings
                    .remote_backends
                    .iter()
                    .position(|entry| &entry.id == id)
            })
            .unwrap_or(0);
        let active_remote_id = next_settings.remote_backends[active_index].id.clone();
        if next_settings.active_remote_backend_id.as_deref() != Some(active_remote_id.as_str()) {
            next_settings.active_remote_backend_id = Some(active_remote_id.clone());
            changed = true;
        }

        let target_index = if let Some(target_id) = normalized_remote_backend_id {
            next_settings
                .remote_backends
                .iter()
                .position(|entry| entry.id == target_id)
        } else {
            Some(active_index)
        };

        if let Some(target_index) = target_index {
            if next_settings.remote_backends[target_index].token != normalized_token {
                next_settings.remote_backends[target_index].token = normalized_token.clone();
                changed = true;
            }

            if target_index == active_index
                && next_settings.remote_backend_token != normalized_token
            {
                next_settings.remote_backend_token = normalized_token.clone();
                changed = true;
            }
        }
    }
    if !changed {
        return Ok(next_settings);
    }
    update_app_settings_core(next_settings, app_settings, settings_path).await
}

pub(crate) fn get_codex_config_path_core() -> Result<String, String> {
    codex_config::config_toml_path()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        .and_then(|path| {
            path.to_str()
                .map(|value| value.to_string())
                .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        })
}
