use std::path::{Path, PathBuf};

use crate::files::io::read_text_file_within;
use crate::files::policy::{policy_for, FileKind, FileScope};

/// Returns the path to the Claude config directory (e.g. ~/.claude).
pub(crate) fn config_dir_path() -> Option<PathBuf> {
    resolve_default_claude_home()
}

/// Reads the model from the Claude config, if any.
pub(crate) fn read_config_model(claude_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = claude_home.or_else(resolve_default_claude_home);
    let Some(root) = root else {
        return Err("Unable to resolve Claude config dir".to_string());
    };
    read_config_model_from_root(&root)
}

fn resolve_default_claude_home() -> Option<PathBuf> {
    crate::claude::home::resolve_default_claude_home()
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
    Ok(contents.as_deref().and_then(parse_model_from_json))
}

fn parse_model_from_json(contents: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(contents).ok()?;
    let model = parsed.get("model")?.as_str()?;
    let trimmed = model.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
