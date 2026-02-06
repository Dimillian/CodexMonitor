use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) fn parse_gemini_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Gemini args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn resolve_workspace_codex_args(
    entry: &WorkspaceEntry,
    parent_entry: Option<&WorkspaceEntry>,
    app_settings: Option<&AppSettings>,
) -> Option<String> {
    if let Some(value) = entry.settings.gemini_args.as_deref() {
        if let Some(normalized) = normalize_gemini_args(value) {
            return Some(normalized);
        }
    }
    if entry.kind.is_worktree() {
        if let Some(parent) = parent_entry {
            if let Some(value) = parent.settings.gemini_args.as_deref() {
                if let Some(normalized) = normalize_gemini_args(value) {
                    return Some(normalized);
                }
            }
        }
    }
    if let Some(settings) = app_settings {
        if let Some(value) = settings.gemini_args.as_deref() {
            return normalize_gemini_args(value);
        }
    }
    None
}

fn normalize_gemini_args(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_gemini_args, resolve_workspace_gemini_args};
    use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};

    #[test]
    fn parses_empty_args() {
        assert!(parse_gemini_args(None).expect("parse none").is_empty());
        assert!(parse_gemini_args(Some("   ")).expect("parse blanks").is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args =
            parse_gemini_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args =
            parse_gemini_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }

    #[test]
    fn resolves_workspace_gemini_args_precedence() {
        let mut app_settings = AppSettings::default();
        app_settings.gemini_args = Some("--profile app".to_string());

        let parent = WorkspaceEntry {
            id: "parent".to_string(),
            name: "Parent".to_string(),
            path: "/tmp/parent".to_string(),
            gemini_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings {
                gemini_args: Some("--profile parent".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        let child = WorkspaceEntry {
            id: "child".to_string(),
            name: "Child".to_string(),
            path: "/tmp/child".to_string(),
            gemini_bin: None,
            kind: WorkspaceKind::Worktree,
            parent_id: Some(parent.id.clone()),
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let resolved = resolve_workspace_gemini_args(&child, Some(&parent), Some(&app_settings));
        assert_eq!(resolved.as_deref(), Some("--profile parent"));

        let mut override_child = child.clone();
        override_child.settings.gemini_args = Some("  --profile child  ".to_string());
        let resolved_child =
            resolve_workspace_gemini_args(&override_child, Some(&parent), Some(&app_settings));
        assert_eq!(resolved_child.as_deref(), Some("--profile child"));

        let main = WorkspaceEntry {
            id: "main".to_string(),
            name: "Main".to_string(),
            path: "/tmp/main".to_string(),
            gemini_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let resolved_main = resolve_workspace_gemini_args(&main, None, Some(&app_settings));
        assert_eq!(resolved_main.as_deref(), Some("--profile app"));
    }
}
