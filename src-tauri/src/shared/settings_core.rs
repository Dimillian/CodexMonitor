use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::types::OpenAppTarget;
use crate::shared::workspaces_core::optional_open_app_targets_core;
use crate::storage::write_settings;
use crate::types::AppSettings;

const OPTIONAL_OPEN_APP_TARGET_IDS: &[&str] = &["phpstorm"];

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut settings = app_settings.lock().await.clone();
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
    inject_optional_open_app_targets(&mut settings);
    settings
}

pub(crate) async fn update_app_settings_core(
    settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    let _ = codex_config::write_collaboration_modes_enabled(settings.collaboration_modes_enabled);
    let _ = codex_config::write_steer_enabled(settings.steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(settings.unified_exec_enabled);
    let _ = codex_config::write_apps_enabled(settings.experimental_apps_enabled);
    let _ = codex_config::write_personality(settings.personality.as_str());
    write_settings(settings_path, &settings)?;
    let mut current = app_settings.lock().await;
    *current = settings.clone();
    let mut response = settings;
    inject_optional_open_app_targets(&mut response);
    Ok(response)
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

fn inject_optional_open_app_targets(settings: &mut AppSettings) {
    let optional_targets = optional_open_app_targets_core();
    let mut available_optional_targets_by_id = optional_targets
        .into_iter()
        .map(|target| (target.id.clone(), target))
        .collect::<std::collections::HashMap<String, OpenAppTarget>>();
    let mut existing_targets = std::mem::take(&mut settings.open_app_targets);
    existing_targets.retain(|target| {
        !OPTIONAL_OPEN_APP_TARGET_IDS.contains(&target.id.as_str())
            || available_optional_targets_by_id.contains_key(&target.id)
    });

    let mut merged_targets =
        Vec::with_capacity(existing_targets.len() + available_optional_targets_by_id.len());
    let mut inserted_optional = false;

    for target in existing_targets {
        if OPTIONAL_OPEN_APP_TARGET_IDS.contains(&target.id.as_str()) {
            available_optional_targets_by_id.remove(&target.id);
        }
        if !inserted_optional && target.kind == "finder" {
            merged_targets.extend(available_optional_targets_by_id.into_values());
            available_optional_targets_by_id = std::collections::HashMap::new();
            inserted_optional = true;
        }
        merged_targets.push(target);
    }

    if !inserted_optional {
        merged_targets.extend(available_optional_targets_by_id.into_values());
    }

    settings.open_app_targets = merged_targets;

    if !settings
        .open_app_targets
        .iter()
        .any(|target| target.id == settings.selected_open_app_id)
    {
        settings.selected_open_app_id = settings
            .open_app_targets
            .first()
            .map(|target| target.id.clone())
            .unwrap_or_default();
    }
}
