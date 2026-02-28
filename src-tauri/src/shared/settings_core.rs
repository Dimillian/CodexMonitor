use std::path::PathBuf;

use serde_json::Value;
use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::storage::{read_settings, write_settings};
use crate::types::{AppSettings, SettingsSyncMode};

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut settings = app_settings.lock().await.clone();
    if matches!(settings.sync_mode, SettingsSyncMode::Bidirectional) {
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
    }
    settings
}

pub(crate) async fn update_app_settings_core(
    settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    let previous = app_settings.lock().await.clone();
    let mut next = settings;

    if matches!(next.sync_mode, SettingsSyncMode::Bidirectional) {
        if let Ok(disk_settings) = read_settings(settings_path) {
            next = merge_bidirectional_settings(previous.clone(), next, disk_settings)?;
        }
        reconcile_managed_config_fields(&previous, &mut next);
    }

    let _ = codex_config::write_collaboration_modes_enabled(next.collaboration_modes_enabled);
    let _ = codex_config::write_steer_enabled(next.steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(next.unified_exec_enabled);
    let _ = codex_config::write_apps_enabled(next.experimental_apps_enabled);
    let _ = codex_config::write_personality(next.personality.as_str());
    write_settings(settings_path, &next)?;
    let mut current = app_settings.lock().await;
    *current = next.clone();
    Ok(next)
}

fn merge_bidirectional_settings(
    previous: AppSettings,
    incoming: AppSettings,
    disk: AppSettings,
) -> Result<AppSettings, String> {
    let previous_value = serde_json::to_value(previous).map_err(|e| e.to_string())?;
    let incoming_value = serde_json::to_value(incoming.clone()).map_err(|e| e.to_string())?;
    let disk_value = serde_json::to_value(disk).map_err(|e| e.to_string())?;

    let mut merged = incoming_value.clone();
    let (Value::Object(previous_map), Value::Object(incoming_map), Value::Object(disk_map), Value::Object(merged_map)) =
        (&previous_value, &incoming_value, &disk_value, &mut merged)
    else {
        return Ok(incoming);
    };

    for (key, incoming_field) in incoming_map {
        if let Some(previous_field) = previous_map.get(key) {
            if incoming_field == previous_field {
                if let Some(disk_field) = disk_map.get(key) {
                    merged_map.insert(key.clone(), disk_field.clone());
                }
            }
        }
    }

    serde_json::from_value(merged).map_err(|e| e.to_string())
}

fn reconcile_managed_config_fields(previous: &AppSettings, next: &mut AppSettings) {
    if next.collaboration_modes_enabled == previous.collaboration_modes_enabled {
        if let Ok(Some(value)) = codex_config::read_collaboration_modes_enabled() {
            next.collaboration_modes_enabled = value;
        }
    }
    if next.steer_enabled == previous.steer_enabled {
        if let Ok(Some(value)) = codex_config::read_steer_enabled() {
            next.steer_enabled = value;
        }
    }
    if next.unified_exec_enabled == previous.unified_exec_enabled {
        if let Ok(Some(value)) = codex_config::read_unified_exec_enabled() {
            next.unified_exec_enabled = value;
        }
    }
    if next.experimental_apps_enabled == previous.experimental_apps_enabled {
        if let Ok(Some(value)) = codex_config::read_apps_enabled() {
            next.experimental_apps_enabled = value;
        }
    }
    if next.personality == previous.personality {
        if let Ok(personality) = codex_config::read_personality() {
            next.personality = personality
                .as_deref()
                .and_then(normalize_personality)
                .unwrap_or("friendly")
                .to_string();
        }
    }
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
