use std::path::PathBuf;

pub(crate) fn daemon_binary_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &["codex_monitor_daemon.exe", "codex-monitor-daemon.exe"]
    } else {
        &["codex_monitor_daemon", "codex-monitor-daemon"]
    }
}

pub(crate) fn resolve_daemon_binary_path() -> Result<PathBuf, String> {
    let current_exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let parent = current_exe
        .parent()
        .ok_or_else(|| "Unable to resolve executable directory".to_string())?;
    let candidate_names = daemon_binary_candidates();

    for name in candidate_names {
        let candidate = parent.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Unable to locate daemon binary in {} (tried: {})",
        parent.display(),
        candidate_names.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::daemon_binary_candidates;

    #[test]
    fn daemon_binary_candidates_prioritize_underscored_name() {
        assert!(daemon_binary_candidates()[0].starts_with("codex_monitor_daemon"));
    }
}
