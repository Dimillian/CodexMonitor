use std::fs;
use std::path::{Path, PathBuf};

use toml::Value as TomlValue;

const FEATURES_TABLE: &str = "[features]";

pub(crate) fn read_steer_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("steer")
}

pub(crate) fn read_collab_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("collab")
}

pub(crate) fn read_collaboration_modes_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("collaboration_modes")
}

pub(crate) fn read_unified_exec_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("unified_exec")
}

pub(crate) fn write_steer_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("steer", enabled)
}

pub(crate) fn write_collab_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("collab", enabled)
}

pub(crate) fn write_collaboration_modes_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("collaboration_modes", enabled)
}

pub(crate) fn write_unified_exec_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("unified_exec", enabled)
}

fn read_feature_flag(key: &str) -> Result<Option<bool>, String> {
    let path = config_toml_path().ok_or("Unable to resolve CODEX_HOME".to_string())?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    Ok(find_feature_flag(&contents, key))
}

fn write_feature_flag(key: &str, enabled: bool) -> Result<(), String> {
    let Some(path) = config_toml_path() else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let contents = fs::read_to_string(&path).unwrap_or_default();
    let updated = upsert_feature_flag(&contents, key, enabled);
    fs::write(&path, updated).map_err(|err| err.to_string())
}

pub(crate) fn config_toml_path() -> Option<PathBuf> {
    crate::codex_home::resolve_default_codex_home().map(|home| home.join("config.toml"))
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let path = codex_home
        .or_else(crate::codex_home::resolve_default_codex_home)
        .map(|home| home.join("config.toml"));
    let Some(path) = path else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    read_config_model_from_path(&path)
}

fn read_config_model_from_path(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path).map_err(|err| err.to_string())?;
    Ok(parse_model_from_toml(&contents))
}

fn parse_model_from_toml(contents: &str) -> Option<String> {
    let parsed: TomlValue = toml::from_str(contents).ok()?;
    let model = parsed.get("model")?.as_str()?;
    let trimmed = model.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn find_feature_flag(contents: &str, key: &str) -> Option<bool> {
    let mut in_features = false;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_features = trimmed == FEATURES_TABLE;
            continue;
        }
        if !in_features || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let (candidate_key, value) = trimmed.split_once('=')?;
        if candidate_key.trim() != key {
            continue;
        }
        let value = value.split('#').next().unwrap_or("").trim();
        return match value {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        };
    }
    None
}

fn upsert_feature_flag(contents: &str, key: &str, enabled: bool) -> String {
    let mut lines: Vec<String> = contents.lines().map(|line| line.to_string()).collect();
    let mut in_features = false;
    let mut features_start: Option<usize> = None;
    let mut features_end: Option<usize> = None;
    let mut key_index: Option<usize> = None;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_features {
                features_end = Some(idx);
                break;
            }
            in_features = trimmed == FEATURES_TABLE;
            if in_features {
                features_start = Some(idx);
            }
            continue;
        }
        if !in_features || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((candidate_key, _)) = trimmed.split_once('=') {
            if candidate_key.trim() == key {
                key_index = Some(idx);
                break;
            }
        }
    }

    let flag_line = format!("{key} = {}", if enabled { "true" } else { "false" });

    if let Some(start) = features_start {
        let end = features_end.unwrap_or(lines.len());
        if let Some(index) = key_index {
            lines[index] = flag_line;
        } else {
            let insert_at = if end > start + 1 { end } else { start + 1 };
            lines.insert(insert_at, flag_line);
        }
    } else {
        if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
            lines.push(String::new());
        }
        lines.push(FEATURES_TABLE.to_string());
        lines.push(flag_line);
    }

    let mut updated = lines.join("\n");
    if contents.ends_with('\n') || updated.is_empty() {
        updated.push('\n');
    }
    updated
}
