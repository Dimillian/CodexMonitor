use std::env;
use std::path::PathBuf;

use crate::types::WorkspaceEntry;

pub(crate) fn resolve_workspace_claude_home(
    entry: &WorkspaceEntry,
    parent_entry: Option<&WorkspaceEntry>,
) -> Option<PathBuf> {
    if let Some(value) = entry.settings.claude_home.as_ref() {
        let base = PathBuf::from(&entry.path);
        if let Some(path) = normalize_claude_home_with_base(value, &base) {
            return Some(path);
        }
    }
    if entry.kind.is_worktree() {
        if let Some(parent) = parent_entry {
            if let Some(value) = parent.settings.claude_home.as_ref() {
                let base = PathBuf::from(&parent.path);
                if let Some(path) = normalize_claude_home_with_base(value, &base) {
                    return Some(path);
                }
            }
        }
    }
    resolve_default_claude_home()
}

pub(crate) fn resolve_default_claude_home() -> Option<PathBuf> {
    if let Ok(value) = env::var("CLAUDE_CONFIG_DIR") {
        if let Some(path) = normalize_claude_home(&value) {
            return Some(path);
        }
    }
    resolve_home_dir().map(|home| home.join(".claude"))
}

fn normalize_claude_home(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(path) = expand_tilde(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_dollar_env(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_percent_env(trimmed) {
        return Some(path);
    }
    Some(PathBuf::from(trimmed))
}

fn normalize_claude_home_with_base(value: &str, base: &PathBuf) -> Option<PathBuf> {
    let path = normalize_claude_home(value)?;
    if path.is_absolute() {
        Some(path)
    } else {
        Some(base.join(path))
    }
}

fn expand_tilde(value: &str) -> Option<PathBuf> {
    if !value.starts_with('~') {
        return None;
    }
    let home_dir = resolve_home_dir()?;
    if value == "~" {
        return Some(home_dir);
    }
    let rest = value.strip_prefix("~/")?;
    Some(home_dir.join(rest))
}

fn expand_dollar_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('$')?;
    if rest.is_empty() {
        return None;
    }

    let (var, remainder) = if let Some(inner) = rest.strip_prefix('{') {
        let end = inner.find('}')?;
        let name = &inner[..end];
        let remaining = &inner[end + 1..];
        (name, remaining)
    } else {
        let end = rest
            .find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
            .unwrap_or(rest.len());
        let name = &rest[..end];
        let remaining = &rest[end..];
        (name, remaining)
    };

    if var.is_empty() {
        return None;
    }

    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn expand_percent_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('%')?;
    let end = rest.find('%')?;
    let var = &rest[..end];
    if var.is_empty() {
        return None;
    }
    let remainder = &rest[end + 1..];
    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn resolve_env_var(name: &str) -> Option<String> {
    if name.eq_ignore_ascii_case("HOME") {
        if let Some(home) = resolve_home_dir() {
            return Some(home.to_string_lossy().to_string());
        }
    }
    lookup_env_value(name)
}

fn lookup_env_value(name: &str) -> Option<String> {
    if let Ok(value) = env::var(name) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }
    let upper = name.to_ascii_uppercase();
    if upper != name {
        if let Ok(value) = env::var(&upper) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    let lower = name.to_ascii_lowercase();
    if lower != name && lower != upper {
        if let Ok(value) = env::var(&lower) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn join_env_path(prefix: &str, remainder: &str) -> PathBuf {
    let mut base = PathBuf::from(prefix.trim());
    let trimmed_remainder = remainder.trim_start_matches(['/', '\\']);
    if trimmed_remainder.is_empty() {
        base
    } else {
        base.push(trimmed_remainder);
        base
    }
}

fn resolve_home_dir() -> Option<PathBuf> {
    if let Ok(value) = env::var("HOME") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    if let Ok(value) = env::var("USERPROFILE") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceKind, WorkspaceSettings, WorktreeInfo};

    fn workspace_entry(
        kind: WorkspaceKind,
        path: &str,
        claude_home: Option<&str>,
    ) -> WorkspaceEntry {
        let worktree = if kind.is_worktree() {
            Some(WorktreeInfo {
                branch: "feature/test".to_string(),
            })
        } else {
            None
        };
        WorkspaceEntry {
            id: "workspace-id".to_string(),
            name: "workspace".to_string(),
            path: path.to_string(),
            codex_bin: None,
            kind,
            parent_id: None,
            worktree,
            settings: WorkspaceSettings {
                claude_home: claude_home.map(|value| value.to_string()),
                ..WorkspaceSettings::default()
            },
        }
    }

    #[test]
    fn worktree_inherits_parent_claude_home_override() {
        let parent = workspace_entry(WorkspaceKind::Main, "/repo", Some("/tmp/claude-parent"));
        let child = workspace_entry(WorkspaceKind::Worktree, "/repo/worktree", None);

        let resolved = resolve_workspace_claude_home(&child, Some(&parent));

        assert_eq!(resolved, Some(PathBuf::from("/tmp/claude-parent")));
    }

    #[test]
    fn workspace_claude_home_relative_resolves_against_workspace_path() {
        let entry = workspace_entry(WorkspaceKind::Main, "/repo", Some(".claude"));

        let resolved = resolve_workspace_claude_home(&entry, None);

        assert_eq!(resolved, Some(PathBuf::from("/repo/.claude")));
    }

    #[test]
    fn worktree_relative_override_uses_parent_path() {
        let parent = workspace_entry(WorkspaceKind::Main, "/repo", Some(".claude"));
        let child = workspace_entry(WorkspaceKind::Worktree, "/repo/worktree", None);

        let resolved = resolve_workspace_claude_home(&child, Some(&parent));

        assert_eq!(resolved, Some(PathBuf::from("/repo/.claude")));
    }
}
