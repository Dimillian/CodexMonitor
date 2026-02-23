use std::path::PathBuf;

pub(crate) fn daemon_binary_name() -> &'static str {
    if cfg!(windows) {
        "codex-monitor-daemon.exe"
    } else {
        "codex-monitor-daemon"
    }
}

pub(crate) fn resolve_daemon_binary_path() -> Result<PathBuf, String> {
    let current_exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let parent = current_exe
        .parent()
        .ok_or_else(|| "Unable to resolve executable directory".to_string())?;
    let candidate_name = daemon_binary_name();

    let candidate = parent.join(candidate_name);
    if candidate.is_file() {
        return Ok(candidate);
    }

    Err(format!(
        "Unable to locate daemon binary in {} (tried: {})",
        parent.display(),
        candidate_name
    ))
}

#[cfg(test)]
mod tests {
    use super::daemon_binary_name;

    #[test]
    fn daemon_binary_name_is_canonical() {
        assert!(
            daemon_binary_name().starts_with("codex-monitor-daemon"),
            "unexpected daemon binary name: {}",
            daemon_binary_name()
        );
    }
}
