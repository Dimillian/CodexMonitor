use std::path::Path;

use toml_edit::{value, Document, Item, Table};

use crate::files::ops::{read_with_policy, write_with_policy};
use crate::files::policy::{policy_for, FileKind, FileScope};

pub(crate) fn load_global_config_document(codex_home: &Path) -> Result<(bool, Document), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let response = read_with_policy(&root, policy)?;
    let document = if response.exists {
        parse_document(response.content.as_str())?
    } else {
        Document::new()
    };
    Ok((response.exists, document))
}

pub(crate) fn persist_global_config_document(
    codex_home: &Path,
    document: &Document,
) -> Result<(), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let mut rendered = document.to_string();
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    write_with_policy(&root, policy, rendered.as_str())
}

pub(crate) fn parse_document(contents: &str) -> Result<Document, String> {
    if contents.trim().is_empty() {
        return Ok(Document::new());
    }
    contents
        .parse::<Document>()
        .map_err(|err| format!("Failed to parse config.toml: {err}"))
}

pub(crate) fn ensure_table<'a>(
    document: &'a mut Document,
    key: &str,
) -> Result<&'a mut Table, String> {
    if document.get(key).is_none() {
        document[key] = Item::Table(Table::new());
    }
    document[key]
        .as_table_mut()
        .ok_or_else(|| format!("`{key}` must be a table in config.toml"))
}

pub(crate) fn read_feature_flag(document: &Document, key: &str) -> Option<bool> {
    document
        .get("features")
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(key))
        .and_then(Item::as_bool)
}

pub(crate) fn set_feature_flag(
    document: &mut Document,
    key: &str,
    enabled: bool,
) -> Result<(), String> {
    let features = ensure_table(document, "features")?;
    features[key] = value(enabled);
    Ok(())
}

pub(crate) fn read_top_level_string(document: &Document, key: &str) -> Option<String> {
    let value = document.get(key).and_then(Item::as_str)?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn set_top_level_string(document: &mut Document, key: &str, value_raw: Option<&str>) {
    let Some(value_raw) = value_raw else {
        let _ = document.remove(key);
        return;
    };
    let trimmed = value_raw.trim();
    if trimmed.is_empty() {
        let _ = document.remove(key);
        return;
    }
    document[key] = value(trimmed);
}
