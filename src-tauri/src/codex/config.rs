use std::path::{Path, PathBuf};

use toml::Value as TomlValue;

use crate::files::io::read_text_file_within;
use crate::files::ops::write_with_policy;
use crate::files::policy::{policy_for, FileKind, FileScope};

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

pub(crate) fn read_apps_enabled() -> Result<Option<bool>, String> {
    read_feature_flag("apps")
}

pub(crate) fn read_personality() -> Result<Option<String>, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(None);
    };
    let contents = read_config_contents_from_root(&root)?;
    Ok(contents
        .as_deref()
        .and_then(parse_personality_from_toml)
        .map(|value| value.to_string()))
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

pub(crate) fn write_apps_enabled(enabled: bool) -> Result<(), String> {
    write_feature_flag("apps", enabled)
}

pub(crate) fn write_personality(personality: &str) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let policy = config_policy()?;
    let response = read_text_file_within(
        &root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    let contents = if response.exists {
        response.content
    } else {
        String::new()
    };
    let normalized = normalize_personality_value(personality);
    let updated = match normalized {
        Some(value) => upsert_top_level_string_key(&contents, "personality", value),
        None => remove_top_level_key(&contents, "personality"),
    };
    write_with_policy(&root, policy, &updated)
}

fn read_feature_flag(key: &str) -> Result<Option<bool>, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(None);
    };
    let contents = read_config_contents_from_root(&root)?;
    Ok(contents.as_deref().and_then(|value| find_feature_flag(value, key)))
}

fn write_feature_flag(key: &str, enabled: bool) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let policy = config_policy()?;
    let response = read_text_file_within(
        &root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    let contents = if response.exists {
        response.content
    } else {
        String::new()
    };
    let updated = upsert_feature_flag(&contents, key, enabled);
    write_with_policy(&root, policy, &updated)
}

pub(crate) fn config_toml_path() -> Option<PathBuf> {
    resolve_default_codex_home().map(|home| home.join("config.toml"))
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    read_config_model_from_root(&root)
}

fn resolve_default_codex_home() -> Option<PathBuf> {
    crate::codex::home::resolve_default_codex_home()
}

fn config_policy() -> Result<crate::files::policy::FilePolicy, String> {
    policy_for(FileScope::Global, FileKind::Config)
}

fn read_config_contents_from_root(root: &Path) -> Result<Option<String>, String> {
    let policy = config_policy()?;
    let response = read_text_file_within(
        root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    if response.exists {
        Ok(Some(response.content))
    } else {
        Ok(None)
    }
}

fn read_config_model_from_root(root: &Path) -> Result<Option<String>, String> {
    let contents = read_config_contents_from_root(root)?;
    Ok(contents.as_deref().and_then(parse_model_from_toml))
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

fn parse_personality_from_toml(contents: &str) -> Option<&'static str> {
    let parsed: TomlValue = toml::from_str(contents).ok()?;
    let value = parsed.get("personality")?.as_str()?;
    normalize_personality_value(value)
}

fn normalize_personality_value(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
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

fn remove_top_level_key(contents: &str, key: &str) -> String {
    let mut lines: Vec<String> = contents.lines().map(|line| line.to_string()).collect();
    let table_start = first_table_start_index(&lines).unwrap_or(lines.len());
    lines.retain_with_index(|idx, line| {
        if idx >= table_start {
            return true;
        }
        !is_key_value_for(line, key)
    });

    let mut updated = lines.join("\n");
    if contents.ends_with('\n') || updated.is_empty() {
        updated.push('\n');
    }
    updated
}

fn upsert_top_level_string_key(contents: &str, key: &str, value: &str) -> String {
    let mut lines: Vec<String> = contents.lines().map(|line| line.to_string()).collect();
    let table_start = first_table_start_index(&lines).unwrap_or(lines.len());
    let replacement = format!("{key} = \"{value}\"");
    let mut replaced = false;

    for line in lines.iter_mut().take(table_start) {
        if is_key_value_for(line, key) {
            *line = replacement.clone();
            replaced = true;
            break;
        }
    }

    if !replaced {
        lines.insert(table_start, replacement);
    }

    let mut updated = lines.join("\n");
    if contents.ends_with('\n') || updated.is_empty() {
        updated.push('\n');
    }
    updated
}

fn is_key_value_for(line: &str, key: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return false;
    }
    let Some((candidate_key, _)) = trimmed.split_once('=') else {
        return false;
    };
    candidate_key.trim() == key
}

fn first_table_start_index(lines: &[String]) -> Option<usize> {
    lines.iter().position(|line| {
        let trimmed = line.trim();
        trimmed.starts_with('[') && trimmed.ends_with(']')
    })
}

trait RetainWithIndex<T> {
    fn retain_with_index<F: FnMut(usize, &T) -> bool>(&mut self, f: F);
}

impl<T> RetainWithIndex<T> for Vec<T> {
    fn retain_with_index<F: FnMut(usize, &T) -> bool>(&mut self, mut f: F) {
        let mut index = 0usize;
        self.retain(|item| {
            let keep = f(index, item);
            index += 1;
            keep
        });
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_personality_from_toml, remove_top_level_key, upsert_top_level_string_key,
    };

    #[test]
    fn parse_personality_reads_supported_values() {
        assert_eq!(
            parse_personality_from_toml("personality = \"friendly\"\n"),
            Some("friendly")
        );
        assert_eq!(
            parse_personality_from_toml("personality = \"pragmatic\"\n"),
            Some("pragmatic")
        );
        assert_eq!(parse_personality_from_toml("personality = \"unknown\"\n"), None);
    }

    #[test]
    fn upsert_top_level_personality_before_tables() {
        let input = "[features]\nsteer = true\n";
        let updated = upsert_top_level_string_key(input, "personality", "friendly");
        assert_eq!(updated, "personality = \"friendly\"\n[features]\nsteer = true\n");
    }

    #[test]
    fn upsert_replaces_existing_top_level_personality() {
        let input = "personality = \"friendly\"\n[features]\nsteer = true\n";
        let updated = upsert_top_level_string_key(input, "personality", "pragmatic");
        assert_eq!(updated, "personality = \"pragmatic\"\n[features]\nsteer = true\n");
    }

    #[test]
    fn remove_top_level_personality_keeps_other_keys() {
        let input = "personality = \"friendly\"\nmodel = \"gpt-5\"\n[features]\nsteer = true\n";
        let updated = remove_top_level_key(input, "personality");
        assert_eq!(updated, "model = \"gpt-5\"\n[features]\nsteer = true\n");
    }
}
