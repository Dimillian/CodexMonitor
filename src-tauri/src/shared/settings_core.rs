use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::codex::home::{resolve_codex_home, resolve_codex_home_status, CodexHomeStatus};
use crate::storage::write_settings;
use crate::types::AppSettings;
use crate::utils::normalize_windows_namespace_path;

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

fn load_config_settings(settings: &mut AppSettings) {
    // Settings remain accessible so an unavailable home can be corrected.
    // Home status and file commands report the underlying error to the UI.
    let Ok(root) = resolve_codex_home(settings.codex_home.as_deref()) else {
        return;
    };
    if let Ok(Some(enabled)) = codex_config::read_collaboration_modes_enabled(&root) {
        settings.collaboration_modes_enabled = enabled;
    }
    if let Ok(Some(enabled)) = codex_config::read_steer_enabled(&root) {
        settings.steer_enabled = enabled;
    }
    if let Ok(Some(enabled)) = codex_config::read_unified_exec_enabled(&root) {
        settings.unified_exec_enabled = enabled;
    }
    if let Ok(Some(enabled)) = codex_config::read_apps_enabled(&root) {
        settings.experimental_apps_enabled = enabled;
    }
    if let Ok(personality) = codex_config::read_personality(&root) {
        settings.personality = personality
            .as_deref()
            .and_then(normalize_personality)
            .unwrap_or("friendly")
            .to_string();
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut current = app_settings.lock().await;
    let mut settings = current.clone();
    load_config_settings(&mut settings);
    // Track the values presented to the UI so an unrelated save cannot mistake
    // config values loaded from disk for user edits.
    *current = settings.clone();
    settings
}

pub(crate) async fn update_app_settings_core(
    mut settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    settings.global_worktrees_folder = settings
        .global_worktrees_folder
        .map(|path| normalize_windows_namespace_path(&path));
    settings.codex_home = settings
        .codex_home
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut current = app_settings.lock().await;
    if current.codex_home != settings.codex_home {
        // Do not copy the old environment's feature settings into the new home.
        resolve_codex_home(settings.codex_home.as_deref())?;
        let defaults = AppSettings::default();
        settings.collaboration_modes_enabled = defaults.collaboration_modes_enabled;
        settings.steer_enabled = defaults.steer_enabled;
        settings.unified_exec_enabled = defaults.unified_exec_enabled;
        settings.experimental_apps_enabled = defaults.experimental_apps_enabled;
        settings.personality = defaults.personality;
        load_config_settings(&mut settings);
    } else {
        // Unrelated application preferences must not rewrite Codex files.
        // Compare to the last settings presented to the caller, rather than
        // reloading disk here and treating another app's edits as user changes.
        let previous_config = &*current;
        let config_changed = previous_config.collaboration_modes_enabled
            != settings.collaboration_modes_enabled
            || previous_config.steer_enabled != settings.steer_enabled
            || previous_config.unified_exec_enabled != settings.unified_exec_enabled
            || previous_config.experimental_apps_enabled != settings.experimental_apps_enabled
            || previous_config.personality != settings.personality;
        if config_changed {
            let root = resolve_codex_home(settings.codex_home.as_deref())?;
            if previous_config.collaboration_modes_enabled != settings.collaboration_modes_enabled {
                codex_config::write_collaboration_modes_enabled(
                    &root,
                    settings.collaboration_modes_enabled,
                )?;
            }
            if previous_config.steer_enabled != settings.steer_enabled {
                codex_config::write_steer_enabled(&root, settings.steer_enabled)?;
            }
            if previous_config.unified_exec_enabled != settings.unified_exec_enabled {
                codex_config::write_unified_exec_enabled(&root, settings.unified_exec_enabled)?;
            }
            if previous_config.experimental_apps_enabled != settings.experimental_apps_enabled {
                codex_config::write_apps_enabled(&root, settings.experimental_apps_enabled)?;
            }
            if previous_config.personality != settings.personality {
                codex_config::write_personality(&root, settings.personality.as_str())?;
            }
        }
    }
    write_settings(settings_path, &settings)?;
    *current = settings.clone();
    Ok(settings)
}

pub(crate) async fn get_codex_config_path_core(
    app_settings: &Mutex<AppSettings>,
) -> Result<String, String> {
    let settings = app_settings.lock().await;
    let root = resolve_codex_home(settings.codex_home.as_deref())?;
    Ok(codex_config::config_toml_path(&root)
        .to_string_lossy()
        .into_owned())
}

pub(crate) async fn get_codex_home_core(
    app_settings: &Mutex<AppSettings>,
) -> Result<CodexHomeStatus, String> {
    let settings = app_settings.lock().await;
    resolve_codex_home_status(settings.codex_home.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("codex-home-settings-{}", Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
        fn home(&self, name: &str, content: &str) -> String {
            let path = self.0.join(name);
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(path.join("config.toml"), content).unwrap();
            path.to_string_lossy().into_owned()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn unrelated_preferences_do_not_rewrite_config_overlaid_on_stored_settings() {
        tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(async {
        let fixture = Fixture::new();
        let content = "# preserved exactly\npersonality = \"pragmatic\"\n[features]\nsteer = false\napps = true\n";
        let home = fixture.home("selected", content);
        let state = Mutex::new(AppSettings {
            codex_home: Some(home.clone()),
            ..AppSettings::default()
        });
        let mut next = get_app_settings_core(&state).await;
        assert!(!next.steer_enabled);
        assert!(next.experimental_apps_enabled);
        next.theme = "dark".to_string();
        update_app_settings_core(next, &state, &fixture.0.join("settings.json"))
            .await
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(PathBuf::from(home).join("config.toml")).unwrap(),
            content
        );

        });
    }

    #[test]
    fn unrelated_save_preserves_external_config_changes_since_settings_were_loaded() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let fixture = Fixture::new();
                let home = fixture.home("selected", "[features]\napps = false\n");
                let state = Mutex::new(AppSettings {
                    codex_home: Some(home.clone()),
                    ..AppSettings::default()
                });
                let mut next = get_app_settings_core(&state).await;
                let external = "# changed externally\n[features]\napps = true\n";
                let config_path = PathBuf::from(home).join("config.toml");
                std::fs::write(&config_path, external).unwrap();
                next.theme = "dark".to_string();
                update_app_settings_core(next, &state, &fixture.0.join("settings.json"))
                    .await
                    .unwrap();
                assert_eq!(std::fs::read_to_string(config_path).unwrap(), external);
            });
    }

    #[test]
    fn switching_home_preserves_both_configs_and_loads_new_feature_settings() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let fixture = Fixture::new();
                let first_contents = "[features]\napps = false\n";
                let second_contents = "# selected provider config\n[features]\napps = true\n";
                let first = fixture.home("first", first_contents);
                let second = fixture.home("second", second_contents);
                let state = Mutex::new(AppSettings {
                    codex_home: Some(first.clone()),
                    ..AppSettings::default()
                });
                let mut next = get_app_settings_core(&state).await;
                next.codex_home = Some(second.clone());
                let settings_path = fixture.0.join("settings.json");
                let updated = update_app_settings_core(next, &state, &settings_path)
                    .await
                    .unwrap();
                assert!(updated.experimental_apps_enabled);
                assert_eq!(
                    std::fs::read_to_string(PathBuf::from(first).join("config.toml")).unwrap(),
                    first_contents
                );
                assert_eq!(
                    std::fs::read_to_string(PathBuf::from(&second).join("config.toml")).unwrap(),
                    second_contents
                );
                let persisted: AppSettings =
                    serde_json::from_str(&std::fs::read_to_string(settings_path).unwrap()).unwrap();
                assert_eq!(persisted.codex_home.as_deref(), Some(second.as_str()));
            });
    }

    #[test]
    fn unavailable_selection_does_not_replace_persisted_home() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let fixture = Fixture::new();
                let home = fixture.home("working", "model = \"fixture-model\"\n");
                let original = AppSettings {
                    codex_home: Some(home.clone()),
                    ..AppSettings::default()
                };
                let state = Mutex::new(original.clone());
                let settings_path = fixture.0.join("settings.json");
                write_settings(&settings_path, &original).unwrap();
                let bytes = std::fs::read(&settings_path).unwrap();
                let mut next = original;
                next.codex_home = Some(fixture.0.join("unmounted").to_string_lossy().into_owned());
                assert!(update_app_settings_core(next, &state, &settings_path)
                    .await
                    .unwrap_err()
                    .contains("unavailable"));
                assert_eq!(
                    state.lock().await.codex_home.as_deref(),
                    Some(home.as_str())
                );
                assert_eq!(std::fs::read(&settings_path).unwrap(), bytes);
            });
    }
}
