use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use toml_edit::{value, Document, Item, Table};

use crate::codex::home as codex_home;
use crate::shared::config_toml_core;

pub(crate) const DEFAULT_AGENT_MAX_THREADS: u32 = 6;
const MIN_AGENT_MAX_THREADS: u32 = 1;
const MAX_AGENT_MAX_THREADS: u32 = 12;
const MANAGED_AGENTS_DIR: &str = "agents";
const TEMPLATE_BLANK: &str = "blank";
const DEFAULT_AGENT_MODEL: &str = "gpt-5-codex";
const DEFAULT_REASONING_EFFORT: &str = "medium";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSummaryDto {
    pub name: String,
    pub description: Option<String>,
    pub developer_instructions: Option<String>,
    pub config_file: String,
    pub resolved_path: String,
    pub managed_by_app: bool,
    pub file_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentsSettingsDto {
    pub config_path: String,
    pub multi_agent_enabled: bool,
    pub max_threads: u32,
    pub agents: Vec<AgentSummaryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetAgentsCoreInput {
    pub multi_agent_enabled: bool,
    pub max_threads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateAgentInput {
    pub name: String,
    pub description: Option<String>,
    pub developer_instructions: Option<String>,
    pub template: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateAgentInput {
    pub original_name: String,
    pub name: String,
    pub description: Option<String>,
    pub developer_instructions: Option<String>,
    pub rename_managed_file: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteAgentInput {
    pub name: String,
    pub delete_managed_file: Option<bool>,
}

pub(crate) fn get_agents_settings_core() -> Result<AgentsSettingsDto, String> {
    let codex_home = resolve_codex_home()?;
    let config_path = codex_home.join("config.toml");
    let config_path_string = config_path
        .to_str()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?
        .to_string();

    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;
    let multi_agent_enabled = read_multi_agent_enabled(&document);
    let max_threads = read_max_threads(&document);
    let mut agents = collect_agents(&codex_home, &document);
    agents.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(AgentsSettingsDto {
        config_path: config_path_string,
        multi_agent_enabled,
        max_threads,
        agents,
    })
}

pub(crate) fn set_agents_core_settings_core(
    input: SetAgentsCoreInput,
) -> Result<AgentsSettingsDto, String> {
    validate_max_threads(input.max_threads)?;

    let codex_home = resolve_codex_home()?;
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;

    let features = config_toml_core::ensure_table(&mut document, "features")?;
    features["multi_agent"] = value(input.multi_agent_enabled);

    let agents = config_toml_core::ensure_table(&mut document, "agents")?;
    agents["max_threads"] = value(input.max_threads as i64);

    config_toml_core::persist_global_config_document(&codex_home, &document)?;
    get_agents_settings_core()
}

pub(crate) fn create_agent_core(input: CreateAgentInput) -> Result<AgentsSettingsDto, String> {
    let name = normalize_agent_name(input.name.as_str())?;
    let description = normalize_optional_string(input.description.as_deref());
    let developer_instructions = normalize_optional_string(input.developer_instructions.as_deref());

    let codex_home = resolve_codex_home()?;
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;

    {
        let agents = config_toml_core::ensure_table(&mut document, "agents")?;
        if has_agent_name_conflict(agents, &name, None) {
            return Err(format!("agent '{name}' already exists"));
        }
    }

    let relative_config_path = managed_relative_config_for_name(&name);
    let target_path = resolve_safe_managed_abs_path_for_write(&codex_home, &relative_config_path)?;
    if target_path.exists() {
        return Err(format!(
            "target config file already exists: {}",
            target_path.display()
        ));
    }
    let template_content = build_template_content(
        input.template.as_deref(),
        input.model.as_deref(),
        input.reasoning_effort.as_deref(),
        developer_instructions.as_deref(),
    );
    std::fs::write(&target_path, template_content)
        .map_err(|err| format!("Failed to create agent config file: {err}"))?;

    {
        let agents = config_toml_core::ensure_table(&mut document, "agents")?;
        let mut role = Table::new();
        if let Some(desc) = description {
            role["description"] = value(desc);
        }
        role["config_file"] = value(pathbuf_to_string(&relative_config_path)?);
        agents[&name] = Item::Table(role);
    }

    if let Err(err) = config_toml_core::persist_global_config_document(&codex_home, &document) {
        let _ = std::fs::remove_file(&target_path);
        return Err(err);
    }

    get_agents_settings_core()
}

pub(crate) fn update_agent_core(input: UpdateAgentInput) -> Result<AgentsSettingsDto, String> {
    let original_name = normalize_agent_lookup_name(input.original_name.as_str())?;
    let name = normalize_agent_name(input.name.as_str())?;
    let description = normalize_optional_string(input.description.as_deref());
    let developer_instructions_input = input.developer_instructions.clone();
    let developer_instructions = normalize_optional_string(input.developer_instructions.as_deref());
    let rename_managed_file = input.rename_managed_file.unwrap_or(true);

    let codex_home = resolve_codex_home()?;
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;

    let mut maybe_renamed_paths: Option<(PathBuf, PathBuf)> = None;
    let mut maybe_config_content_backup: Option<(PathBuf, Option<Vec<u8>>)> = None;

    {
        let agents = config_toml_core::ensure_table(&mut document, "agents")?;
        if name != original_name && has_agent_name_conflict(agents, &name, Some(&original_name)) {
            return Err(format!("agent '{name}' already exists"));
        }

        let Some(existing_item) = agents.remove(&original_name) else {
            return Err(format!("agent '{original_name}' not found"));
        };

        let mut next_config_file = read_role_config_file(&existing_item);
        let mut role = clone_role_table(&existing_item)?;

        if rename_managed_file && name != original_name {
            if let Some(old_value) = next_config_file.as_deref() {
                if let Some(old_relative_path) = managed_relative_path_from_config(old_value) {
                    let new_relative_path = managed_relative_config_for_name(&name);
                    if old_relative_path != new_relative_path {
                        let old_abs_path = resolve_safe_managed_abs_path_for_read(
                            &codex_home,
                            &old_relative_path,
                        )?;
                        let new_abs_path = resolve_safe_managed_abs_path_for_write(
                            &codex_home,
                            &new_relative_path,
                        )?;
                        if new_abs_path.exists() {
                            return Err(format!(
                                "target config file already exists: {}",
                                new_abs_path.display()
                            ));
                        }
                        if old_abs_path.exists() {
                            std::fs::rename(&old_abs_path, &new_abs_path).map_err(|err| {
                                format!("Failed to rename agent config file: {err}")
                            })?;
                            maybe_renamed_paths = Some((old_abs_path, new_abs_path.clone()));
                        }
                        next_config_file = Some(pathbuf_to_string(&new_relative_path)?);
                    }
                }
            }
        }

        if let Some(desc) = description {
            role["description"] = value(desc);
        } else {
            let _ = role.remove("description");
        }
        if let Some(config_file) = next_config_file.as_deref() {
            role["config_file"] = value(config_file);
        } else {
            let _ = role.remove("config_file");
        }

        if developer_instructions_input.is_some() {
            if let Some(config_file) = next_config_file.as_deref() {
                if let Some(relative_path) = managed_relative_path_from_config(config_file) {
                    let target =
                        resolve_safe_managed_abs_path_for_write(&codex_home, &relative_path)?;
                    let previous = match upsert_developer_instructions_in_agent_config_file(
                        &target,
                        developer_instructions.as_deref(),
                    ) {
                        Ok(value) => value,
                        Err(err) => {
                            if let Some((old_path, new_path)) = maybe_renamed_paths.as_ref() {
                                if new_path.exists() {
                                    let _ = std::fs::rename(new_path, old_path);
                                }
                            }
                            return Err(err);
                        }
                    };
                    maybe_config_content_backup = Some((target, previous));
                } else {
                    if let Some((old_path, new_path)) = maybe_renamed_paths.as_ref() {
                        if new_path.exists() {
                            let _ = std::fs::rename(new_path, old_path);
                        }
                    }
                    return Err(format!(
                        "agent '{name}' config_file is external; edit that file directly to change developer_instructions"
                    ));
                }
            } else {
                if let Some((old_path, new_path)) = maybe_renamed_paths.as_ref() {
                    if new_path.exists() {
                        let _ = std::fs::rename(new_path, old_path);
                    }
                }
                return Err(format!(
                    "agent '{name}' does not define config_file; cannot update developer_instructions"
                ));
            }
        }

        agents[&name] = Item::Table(role);
    }

    if let Err(err) = config_toml_core::persist_global_config_document(&codex_home, &document) {
        if let Some((path, backup)) = maybe_config_content_backup {
            match backup {
                Some(bytes) => {
                    let _ = std::fs::write(&path, bytes);
                }
                None => {
                    if path.exists() {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
        if let Some((old_path, new_path)) = maybe_renamed_paths {
            if new_path.exists() {
                let _ = std::fs::rename(new_path, old_path);
            }
        }
        return Err(err);
    }

    get_agents_settings_core()
}

pub(crate) fn delete_agent_core(input: DeleteAgentInput) -> Result<AgentsSettingsDto, String> {
    let name = normalize_agent_lookup_name(input.name.as_str())?;
    let delete_managed_file = input.delete_managed_file.unwrap_or(false);

    let codex_home = resolve_codex_home()?;
    let (_, mut document) = config_toml_core::load_global_config_document(&codex_home)?;

    let removed_config_file = {
        let agents = config_toml_core::ensure_table(&mut document, "agents")?;
        let Some(existing_item) = agents.remove(&name) else {
            return Err(format!("agent '{name}' not found"));
        };
        read_role_config_file(&existing_item)
    };

    let mut deleted_config_backup: Option<(PathBuf, Vec<u8>)> = None;
    if delete_managed_file {
        if let Some(config_file) = removed_config_file {
            if let Some(relative_path) = managed_relative_path_from_config(config_file.as_str()) {
                let target = resolve_safe_managed_abs_path_for_read(&codex_home, &relative_path)?;
                if target.exists() {
                    let backup = std::fs::read(&target).map_err(|err| {
                        format!("Failed to read agent config file before delete: {err}")
                    })?;
                    std::fs::remove_file(&target)
                        .map_err(|err| format!("Failed to delete agent config file: {err}"))?;
                    deleted_config_backup = Some((target, backup));
                }
            }
        }
    }

    if let Err(persist_error) =
        config_toml_core::persist_global_config_document(&codex_home, &document)
    {
        if let Some((path, backup)) = deleted_config_backup {
            if let Err(restore_error) = std::fs::write(&path, backup) {
                return Err(format!(
                    "{} (also failed to restore deleted config file {}: {})",
                    persist_error,
                    path.display(),
                    restore_error
                ));
            }
        }
        return Err(persist_error);
    }

    get_agents_settings_core()
}

pub(crate) fn read_agent_config_toml_core(agent_name: &str) -> Result<String, String> {
    let (codex_home, relative_path) = resolve_managed_agent_config_relative_path(agent_name)?;
    let path = resolve_safe_managed_abs_path_for_read(&codex_home, &relative_path)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|err| format!("Failed to read agent config file: {err}"))
}

pub(crate) fn write_agent_config_toml_core(agent_name: &str, content: &str) -> Result<(), String> {
    let (codex_home, relative_path) = resolve_managed_agent_config_relative_path(agent_name)?;
    let path = resolve_safe_managed_abs_path_for_write(&codex_home, &relative_path)?;
    std::fs::write(path, content).map_err(|err| format!("Failed to write agent config file: {err}"))
}

fn resolve_codex_home() -> Result<PathBuf, String> {
    codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

fn read_multi_agent_enabled(document: &Document) -> bool {
    read_feature_flag(document, "multi_agent").unwrap_or(false)
}

fn read_feature_flag(document: &Document, key: &str) -> Option<bool> {
    config_toml_core::read_feature_flag(document, key)
}

fn read_max_threads(document: &Document) -> u32 {
    let raw = document
        .get("agents")
        .and_then(Item::as_table_like)
        .and_then(|table| table.get("max_threads"))
        .and_then(Item::as_integer)
        .unwrap_or(DEFAULT_AGENT_MAX_THREADS as i64);
    if raw < MIN_AGENT_MAX_THREADS as i64 {
        return DEFAULT_AGENT_MAX_THREADS;
    }
    u32::try_from(raw)
        .ok()
        .filter(|value| *value <= MAX_AGENT_MAX_THREADS)
        .unwrap_or(DEFAULT_AGENT_MAX_THREADS)
}

fn collect_agents(codex_home: &Path, document: &Document) -> Vec<AgentSummaryDto> {
    let mut result = Vec::new();
    let Some(agents_table) = document.get("agents").and_then(Item::as_table_like) else {
        return result;
    };

    for (name, item) in agents_table.iter() {
        if name == "max_threads" {
            continue;
        }
        let description = read_role_description(item);
        let config_file = read_role_config_file(item).unwrap_or_default();
        let developer_instructions =
            read_role_developer_instructions(codex_home, config_file.as_str());
        let resolved_path = resolve_config_file_path_for_display(codex_home, config_file.as_str())
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_else(|| codex_home.to_string_lossy().to_string());
        let managed_by_app = managed_relative_path_from_config(config_file.as_str()).is_some();
        let file_exists = resolve_config_file_path_for_display(codex_home, config_file.as_str())
            .map(|path| path.is_file())
            .unwrap_or(false);

        result.push(AgentSummaryDto {
            name: name.to_string(),
            description,
            developer_instructions,
            config_file,
            resolved_path,
            managed_by_app,
            file_exists,
        });
    }

    result
}

fn resolve_config_file_path_for_display(codex_home: &Path, raw_value: &str) -> Option<PathBuf> {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let raw_path = Path::new(trimmed);
    if raw_path.is_absolute() {
        return Some(raw_path.to_path_buf());
    }
    let normalized_relative = normalize_relative_path(raw_value)?;
    Some(codex_home.join(normalized_relative))
}

fn normalize_agent_name(raw_name: &str) -> Result<String, String> {
    let mut name = String::new();
    let mut previous_was_space = false;
    for char in raw_name.trim().to_ascii_lowercase().chars() {
        if char.is_ascii_whitespace() {
            if !name.is_empty() && !previous_was_space {
                name.push('-');
            }
            previous_was_space = true;
            continue;
        }
        name.push(char);
        previous_was_space = false;
    }

    if name.is_empty() {
        return Err("agent name is required".to_string());
    }
    if name.len() > 32 {
        return Err("agent name must be 32 characters or fewer".to_string());
    }

    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return Err("agent name is required".to_string());
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err("agent name must start with a lowercase letter or digit".to_string());
    }
    for char in chars {
        if !char.is_ascii_lowercase() && !char.is_ascii_digit() && char != '_' && char != '-' {
            return Err(
                "agent name must use only lowercase letters, digits, '_' or '-'".to_string(),
            );
        }
    }
    Ok(name.to_string())
}

fn normalize_agent_lookup_name(raw_name: &str) -> Result<String, String> {
    let name = raw_name.trim();
    if name.is_empty() {
        return Err("agent name is required".to_string());
    }
    Ok(name.to_string())
}

fn normalize_optional_string(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn validate_max_threads(value: u32) -> Result<(), String> {
    if (MIN_AGENT_MAX_THREADS..=MAX_AGENT_MAX_THREADS).contains(&value) {
        Ok(())
    } else {
        Err(format!(
            "agents.max_threads must be between {} and {}",
            MIN_AGENT_MAX_THREADS, MAX_AGENT_MAX_THREADS
        ))
    }
}

fn has_agent_name_conflict(agents: &Table, name: &str, excluding: Option<&str>) -> bool {
    agents.iter().any(|(existing_name, item)| {
        if existing_name == "max_threads" || !item.is_table_like() {
            return false;
        }
        if let Some(excluding_name) = excluding {
            if existing_name == excluding_name {
                return false;
            }
        }
        existing_name.eq_ignore_ascii_case(name)
    })
}

fn clone_role_table(item: &Item) -> Result<Table, String> {
    let Some(table_like) = item.as_table_like() else {
        return Err("agent role must be a TOML table".to_string());
    };
    let mut role = Table::new();
    for (key, value_item) in table_like.iter() {
        role[key] = value_item.clone();
    }
    Ok(role)
}

fn read_role_description(item: &Item) -> Option<String> {
    item.as_table_like()
        .and_then(|table| table.get("description"))
        .and_then(Item::as_str)
        .and_then(|value| normalize_optional_string(Some(value)))
}

fn read_role_config_file(item: &Item) -> Option<String> {
    item.as_table_like()
        .and_then(|table| table.get("config_file"))
        .and_then(Item::as_str)
        .and_then(|value| normalize_optional_string(Some(value)))
}

fn read_role_developer_instructions(codex_home: &Path, config_file: &str) -> Option<String> {
    let relative_path = managed_relative_path_from_config(config_file)?;
    let path = resolve_safe_managed_abs_path_for_read(codex_home, &relative_path).ok()?;
    if !path.is_file() {
        return None;
    }
    let contents = std::fs::read_to_string(path).ok()?;
    let document = parse_agent_config_document(contents.as_str()).ok()?;
    document
        .get("developer_instructions")
        .and_then(Item::as_str)
        .and_then(|value| normalize_optional_string(Some(value)))
}

fn managed_relative_config_for_name(name: &str) -> PathBuf {
    let mut path = PathBuf::from(MANAGED_AGENTS_DIR);
    path.push(format!("{name}.toml"));
    path
}

fn normalize_relative_path(raw_path: &str) -> Option<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return None;
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => normalized.push(value),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if normalized.as_os_str().is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn managed_relative_path_from_config(raw_path: &str) -> Option<PathBuf> {
    let normalized = normalize_relative_path(raw_path)?;
    let mut components = normalized.components();
    match components.next() {
        Some(Component::Normal(component)) if component == OsStr::new(MANAGED_AGENTS_DIR) => {
            Some(normalized)
        }
        _ => None,
    }
}

fn resolve_managed_agent_config_relative_path(
    agent_name: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let name = normalize_agent_lookup_name(agent_name)?;
    let codex_home = resolve_codex_home()?;
    let (_, document) = config_toml_core::load_global_config_document(&codex_home)?;

    let agents_table = document
        .get("agents")
        .and_then(Item::as_table_like)
        .ok_or_else(|| "agents table not found in config.toml".to_string())?;

    let role_item = agents_table
        .get(name.as_str())
        .ok_or_else(|| format!("agent '{name}' not found"))?;

    let Some(config_file) = read_role_config_file(role_item) else {
        return Err(format!("agent '{name}' does not define config_file"));
    };

    let Some(relative_path) = managed_relative_path_from_config(config_file.as_str()) else {
        return Err(format!(
            "agent '{name}' config_file is not managed by CodexMonitor"
        ));
    };

    Ok((codex_home, relative_path))
}

fn resolve_safe_managed_abs_path_for_read(
    codex_home: &Path,
    relative_path: &Path,
) -> Result<PathBuf, String> {
    let path = codex_home.join(relative_path);
    assert_managed_path_without_symlinks(codex_home, relative_path, true)?;
    Ok(path)
}

fn resolve_safe_managed_abs_path_for_write(
    codex_home: &Path,
    relative_path: &Path,
) -> Result<PathBuf, String> {
    let path = codex_home.join(relative_path);
    assert_managed_path_without_symlinks(codex_home, relative_path, true)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create agents directory: {err}"))?;
    }
    assert_managed_path_without_symlinks(codex_home, relative_path, true)?;
    Ok(path)
}

fn assert_managed_path_without_symlinks(
    codex_home: &Path,
    relative_path: &Path,
    include_leaf: bool,
) -> Result<(), String> {
    let mut current = codex_home.to_path_buf();
    let mut components = relative_path.components().peekable();
    while let Some(component) = components.next() {
        current.push(component.as_os_str());
        let is_leaf = components.peek().is_none();
        if is_leaf && !include_leaf {
            break;
        }
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err(format!(
                        "Managed agent config path may not contain symlinks: {}",
                        current.display()
                    ));
                }
            }
            Err(err) if err.kind() == ErrorKind::NotFound => break,
            Err(err) => {
                return Err(format!(
                    "Failed to validate managed agent path {}: {}",
                    current.display(),
                    err
                ))
            }
        }
    }
    Ok(())
}

fn parse_agent_config_document(contents: &str) -> Result<Document, String> {
    if contents.trim().is_empty() {
        return Ok(Document::new());
    }
    contents
        .parse::<Document>()
        .map_err(|err| format!("Failed to parse agent config file: {err}"))
}

fn upsert_developer_instructions_in_agent_config_file(
    path: &Path,
    developer_instructions: Option<&str>,
) -> Result<Option<Vec<u8>>, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create agents directory: {err}"))?;
    }

    let previous = if path.exists() {
        Some(
            std::fs::read(path)
                .map_err(|err| format!("Failed to read agent config file before update: {err}"))?,
        )
    } else {
        None
    };

    let existing = if let Some(bytes) = previous.as_ref() {
        std::str::from_utf8(bytes)
            .map_err(|err| format!("Agent config file is not valid UTF-8: {err}"))?
    } else {
        ""
    };
    let mut document = parse_agent_config_document(existing)?;

    if let Some(value_raw) = developer_instructions {
        if let Some(value_normalized) = normalize_optional_string(Some(value_raw)) {
            document["developer_instructions"] = value(value_normalized);
        } else {
            let _ = document.remove("developer_instructions");
        }
    } else {
        let _ = document.remove("developer_instructions");
    }

    let mut rendered = document.to_string();
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    std::fs::write(path, rendered)
        .map_err(|err| format!("Failed to update agent config file: {err}"))?;
    Ok(previous)
}

fn build_template_content(
    template: Option<&str>,
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    developer_instructions: Option<&str>,
) -> String {
    let template = template.map(str::trim).unwrap_or(TEMPLATE_BLANK);
    let model = normalize_optional_string(model).unwrap_or_else(|| DEFAULT_AGENT_MODEL.to_string());
    let reasoning_effort = normalize_optional_string(reasoning_effort)
        .unwrap_or_else(|| DEFAULT_REASONING_EFFORT.to_string());
    let mut overrides = Document::new();
    overrides["model"] = value(model.as_str());
    if !reasoning_effort.is_empty() {
        overrides["model_reasoning_effort"] = value(reasoning_effort.as_str());
    }
    if let Some(instructions) = developer_instructions {
        if let Some(normalized) = normalize_optional_string(Some(instructions)) {
            overrides["developer_instructions"] = value(normalized);
        }
    }
    match template {
        TEMPLATE_BLANK => {
            let mut rendered = String::from("# Agent-specific overrides\n");
            rendered.push_str(overrides.to_string().as_str());
            rendered.push('\n');
            rendered
        }
        _ => {
            let mut rendered = String::from("# Agent-specific overrides\n");
            rendered.push_str(overrides.to_string().as_str());
            rendered.push('\n');
            rendered
        }
    }
}

fn pathbuf_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "invalid UTF-8 path".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("codex-monitor-{prefix}-{nonce}"));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn normalize_agent_name_accepts_expected_shape() {
        assert_eq!(normalize_agent_name("explorer").expect("valid"), "explorer");
        assert_eq!(normalize_agent_name("a-1_b").expect("valid"), "a-1_b");
        assert_eq!(
            normalize_agent_name(" Explorer ").expect("valid"),
            "explorer"
        );
        assert_eq!(normalize_agent_name("A-1_B").expect("valid"), "a-1_b");
        assert_eq!(
            normalize_agent_name("Hello world").expect("valid"),
            "hello-world"
        );
        assert_eq!(
            normalize_agent_name("HELLO   WORLD").expect("valid"),
            "hello-world"
        );
    }

    #[test]
    fn normalize_agent_name_rejects_invalid_shape() {
        assert!(normalize_agent_name("_bad").is_err());
        assert!(normalize_agent_name("bad.name").is_err());
        assert!(normalize_agent_name("Hello/world").is_err());
    }

    #[test]
    fn managed_path_detection_accepts_agents_prefix() {
        assert_eq!(
            managed_relative_path_from_config("./agents/researcher.toml").expect("managed path"),
            PathBuf::from("agents/researcher.toml")
        );
        assert_eq!(
            managed_relative_path_from_config("agents/researcher.toml").expect("managed path"),
            PathBuf::from("agents/researcher.toml")
        );
    }

    #[test]
    fn managed_path_detection_rejects_escape() {
        assert!(managed_relative_path_from_config("../agents/researcher.toml").is_none());
        assert!(managed_relative_path_from_config("/tmp/researcher.toml").is_none());
        assert!(managed_relative_path_from_config("roles/researcher.toml").is_none());
    }

    #[test]
    fn clone_role_table_preserves_unknown_keys() {
        let document: Document = "[agents.researcher]\ndescription = \"Old\"\nconfig_file = \"agents/researcher.toml\"\ncustom_key = \"keep\"\n"
            .parse()
            .expect("parse");
        let role_item = document
            .get("agents")
            .and_then(Item::as_table_like)
            .and_then(|table| table.get("researcher"))
            .expect("role item");

        let mut role = clone_role_table(role_item).expect("clone role");
        role["description"] = value("New");

        assert_eq!(role.get("custom_key").and_then(Item::as_str), Some("keep"));
        assert_eq!(role.get("description").and_then(Item::as_str), Some("New"));
    }

    #[cfg(unix)]
    #[test]
    fn managed_write_rejects_symlinked_agents_dir() {
        use std::os::unix::fs::symlink;

        let codex_home = temp_dir("codex-home");
        let outside = temp_dir("outside");
        symlink(&outside, codex_home.join("agents")).expect("symlink agents");

        let err = resolve_safe_managed_abs_path_for_write(
            &codex_home,
            std::path::Path::new("agents/researcher.toml"),
        )
        .expect_err("should reject symlink path");
        assert!(err.contains("symlinks"));

        let _ = std::fs::remove_dir_all(&codex_home);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn read_multi_agent_enabled_reads_multi_agent_flag() {
        let document: Document = "[features]\nmulti_agent = true\n".parse().expect("parse");
        assert!(read_multi_agent_enabled(&document));
    }

    #[test]
    fn read_max_threads_uses_default_when_missing() {
        let document = Document::new();
        assert_eq!(read_max_threads(&document), DEFAULT_AGENT_MAX_THREADS);
    }

    #[test]
    fn read_max_threads_reads_value_when_present() {
        let document: Document = "[agents]\nmax_threads = 12\n".parse().expect("parse");
        assert_eq!(read_max_threads(&document), 12);
    }

    #[test]
    fn validate_max_threads_enforces_upper_bound() {
        assert!(validate_max_threads(12).is_ok());
        assert!(validate_max_threads(13).is_err());
    }

    #[test]
    fn build_template_content_uses_provided_model_and_reasoning() {
        let content = build_template_content(Some("blank"), Some("gpt-5.1"), Some("high"), None);
        assert!(content.contains("model = \"gpt-5.1\""));
        assert!(content.contains("model_reasoning_effort = \"high\""));
    }

    #[test]
    fn build_template_content_includes_developer_instructions() {
        let content = build_template_content(
            Some("blank"),
            Some("gpt-5.1"),
            Some("medium"),
            Some("Investigate root causes first.\nCall out risks."),
        );
        assert!(content.contains("developer_instructions"));
    }
}
