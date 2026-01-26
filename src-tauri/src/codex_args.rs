use tokio::process::Command;

pub(crate) fn parse_codex_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Codex args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

pub(crate) fn apply_codex_args(command: &mut Command, value: Option<&str>) -> Result<(), String> {
    let args = parse_codex_args(value)?;
    if !args.is_empty() {
        command.args(args);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_codex_args;

    #[test]
    fn parses_empty_args() {
        assert!(parse_codex_args(None).expect("parse none").is_empty());
        assert!(parse_codex_args(Some("   ")).expect("parse blanks").is_empty());
    }

    #[test]
    fn parses_simple_args() {
        let args =
            parse_codex_args(Some("--profile personal --flag")).expect("parse args");
        assert_eq!(args, vec!["--profile", "personal", "--flag"]);
    }

    #[test]
    fn parses_quoted_args() {
        let args =
            parse_codex_args(Some("--path \"a b\" --name='c d'")).expect("parse args");
        assert_eq!(args, vec!["--path", "a b", "--name=c d"]);
    }
}
