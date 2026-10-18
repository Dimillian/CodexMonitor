use std::path::{Path, PathBuf};

use crate::shared::config_toml_core;

pub(crate) fn read_steer_enabled(root: &Path) -> Result<Option<bool>, String> {
    read_feature_flag(root, "steer")
}

pub(crate) fn read_collaboration_modes_enabled(root: &Path) -> Result<Option<bool>, String> {
    read_feature_flag(root, "collaboration_modes")
}

pub(crate) fn read_unified_exec_enabled(root: &Path) -> Result<Option<bool>, String> {
    read_feature_flag(root, "unified_exec")
}

pub(crate) fn read_apps_enabled(root: &Path) -> Result<Option<bool>, String> {
    read_feature_flag(root, "apps")
}

pub(crate) fn read_personality(root: &Path) -> Result<Option<String>, String> {
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(read_personality_from_document(&document))
}

pub(crate) fn write_steer_enabled(root: &Path, enabled: bool) -> Result<(), String> {
    write_feature_flag(root, "steer", enabled)
}

pub(crate) fn write_collaboration_modes_enabled(root: &Path, enabled: bool) -> Result<(), String> {
    write_feature_flag(root, "collaboration_modes", enabled)
}

pub(crate) fn write_unified_exec_enabled(root: &Path, enabled: bool) -> Result<(), String> {
    write_feature_flag(root, "unified_exec", enabled)
}

pub(crate) fn write_apps_enabled(root: &Path, enabled: bool) -> Result<(), String> {
    write_feature_flag(root, "apps", enabled)
}

pub(crate) fn write_feature_enabled(
    root: &Path,
    feature_key: &str,
    enabled: bool,
) -> Result<(), String> {
    let key = feature_key.trim();
    if key.is_empty() {
        return Err("feature key is empty".to_string());
    }
    if key.eq_ignore_ascii_case("collab") {
        return Err("feature key `collab` is no longer supported; use `multi_agent`".to_string());
    }
    write_feature_flag(root, key, enabled)
}

pub(crate) fn write_personality(root: &Path, personality: &str) -> Result<(), String> {
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    let normalized = normalize_personality_value(personality);
    config_toml_core::set_top_level_string(&mut document, "personality", normalized);
    config_toml_core::persist_global_config_document(&root, &document)
}

fn read_feature_flag(root: &Path, key: &str) -> Result<Option<bool>, String> {
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_feature_flag(&document, key))
}

fn write_feature_flag(root: &Path, key: &str, enabled: bool) -> Result<(), String> {
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    config_toml_core::set_feature_flag(&mut document, key, enabled)?;
    config_toml_core::persist_global_config_document(&root, &document)
}

pub(crate) fn config_toml_path(root: &Path) -> PathBuf {
    root.join("config.toml")
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let Some(root) = codex_home else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_top_level_string(&document, "model"))
}

fn read_personality_from_document(document: &toml_edit::Document) -> Option<String> {
    config_toml_core::read_top_level_string(document, "personality")
        .as_deref()
        .and_then(normalize_personality_value)
        .map(|value| value.to_string())
}

fn normalize_personality_value(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_personality_value, read_personality_from_document};
    use crate::shared::config_toml_core;

    #[test]
    fn parse_personality_reads_supported_values() {
        let friendly =
            config_toml_core::parse_document("personality = \"friendly\"\n").expect("parse");
        let pragmatic =
            config_toml_core::parse_document("personality = \"pragmatic\"\n").expect("parse");
        let unknown =
            config_toml_core::parse_document("personality = \"unknown\"\n").expect("parse");

        assert_eq!(
            read_personality_from_document(&friendly),
            Some("friendly".to_string())
        );
        assert_eq!(
            read_personality_from_document(&pragmatic),
            Some("pragmatic".to_string())
        );
        assert_eq!(read_personality_from_document(&unknown), None);
    }

    #[test]
    fn normalize_personality_is_case_insensitive() {
        assert_eq!(normalize_personality_value("Friendly"), Some("friendly"));
        assert_eq!(normalize_personality_value("PRAGMATIC"), Some("pragmatic"));
        assert_eq!(normalize_personality_value("unknown"), None);
    }
}
