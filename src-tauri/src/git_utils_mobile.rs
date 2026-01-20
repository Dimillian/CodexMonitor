use std::path::{Path, PathBuf};

use crate::types::WorkspaceEntry;

pub(crate) fn resolve_git_root(entry: &WorkspaceEntry) -> Result<PathBuf, String> {
    let base = PathBuf::from(&entry.path);
    let root = entry
        .settings
        .git_root
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let Some(root) = root else {
        return Ok(base);
    };
    let root_path = if Path::new(root).is_absolute() {
        PathBuf::from(root)
    } else {
        base.join(root)
    };
    if root_path.is_dir() {
        Ok(root_path)
    } else {
        Err(format!("Git root not found: {root}"))
    }
}

