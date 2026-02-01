use tokio::process::Command;

use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) fn parse_cursor_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Cursor args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn apply_cursor_args(command: &mut Command, value: Option<&str>) -> Result<(), String> {
    let args = parse_cursor_args(value)?;
    if !args.is_empty() {
        command.args(args);
    }
    Ok(())
}

#[allow(dead_code)]
pub(crate) fn resolve_workspace_cursor_args(
    _entry: &WorkspaceEntry,
    _parent_entry: Option<&WorkspaceEntry>,
    app_settings: Option<&AppSettings>,
) -> Option<String> {
    // Workspace-level args (future: could add cursor_args to WorkspaceSettings)
    // For now, we only support app-level cursor args
    if let Some(settings) = app_settings {
        if let Some(value) = settings.cursor_args.as_deref() {
            return normalize_cursor_args(value);
        }
    }
    None
}

#[allow(dead_code)]
fn normalize_cursor_args(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::parse_cursor_args;

    #[test]
    fn parses_empty_args() {
        assert!(parse_cursor_args(None).expect("parse none").is_empty());
        assert!(parse_cursor_args(Some("   ")).expect("parse blanks").is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args = parse_cursor_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args = parse_cursor_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }
}
