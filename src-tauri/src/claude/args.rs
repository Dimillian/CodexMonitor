use tokio::process::Command;

use crate::types::AppSettings;

pub(crate) fn parse_claude_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Claude args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn apply_claude_args(command: &mut Command, value: Option<&str>) -> Result<(), String> {
    let args = parse_claude_args(value)?;
    if !args.is_empty() {
        command.args(args);
    }
    Ok(())
}

#[allow(dead_code)]
pub(crate) fn resolve_app_claude_args(app_settings: Option<&AppSettings>) -> Option<String> {
    if let Some(settings) = app_settings {
        if let Some(value) = settings.claude_args.as_deref() {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_claude_args;

    #[test]
    fn parses_empty_args() {
        assert!(parse_claude_args(None).expect("parse none").is_empty());
        assert!(parse_claude_args(Some("   ")).expect("parse blanks").is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args = parse_claude_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args = parse_claude_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }
}
