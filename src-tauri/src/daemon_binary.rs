use std::path::PathBuf;

pub(crate) fn daemon_binary_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &["codex_monitor_daemon.exe", "codex-monitor-daemon.exe"]
    } else {
        &["codex_monitor_daemon", "codex-monitor-daemon"]
    }
}

fn daemon_search_dirs(executable_dir: &std::path::Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    let mut push_unique = |path: PathBuf| {
        if !dirs.iter().any(|entry| entry == &path) {
            dirs.push(path);
        }
    };

    push_unique(executable_dir.to_path_buf());

    #[cfg(target_os = "macos")]
    {
        if let Some(contents_dir) = executable_dir.parent() {
            push_unique(contents_dir.join("Resources"));
        }
        push_unique(PathBuf::from("/opt/homebrew/bin"));
        push_unique(PathBuf::from("/usr/local/bin"));
    }

    #[cfg(target_os = "linux")]
    {
        push_unique(PathBuf::from("/usr/local/bin"));
        push_unique(PathBuf::from("/usr/bin"));
        push_unique(PathBuf::from("/usr/sbin"));
    }

    dirs
}

pub(crate) fn resolve_daemon_binary_path() -> Result<PathBuf, String> {
    let mut attempted_paths: Vec<PathBuf> = Vec::new();
    let current_exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let parent = current_exe
        .parent()
        .ok_or_else(|| "Unable to resolve executable directory".to_string())?;
    let candidate_names = daemon_binary_candidates();

    if let Ok(explicit_raw) = std::env::var("CODEX_MONITOR_DAEMON_PATH") {
        let explicit = explicit_raw.trim();
        if !explicit.is_empty() {
            let explicit_path = PathBuf::from(explicit);
            if explicit_path.is_file() {
                return Ok(explicit_path);
            }
            if explicit_path.is_dir() {
                for name in candidate_names {
                    let candidate = explicit_path.join(name);
                    if candidate.is_file() {
                        return Ok(candidate);
                    }
                    attempted_paths.push(candidate);
                }
            } else {
                attempted_paths.push(explicit_path);
            }
        }
    }

    for search_dir in daemon_search_dirs(parent) {
        for name in candidate_names {
            let candidate = search_dir.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
            attempted_paths.push(candidate);
        }
    }

    let attempted = attempted_paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "Unable to locate daemon binary (tried: {})",
        attempted
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
