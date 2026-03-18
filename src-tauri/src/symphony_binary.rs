use std::path::{Path, PathBuf};

pub(crate) fn symphony_binary_candidates() -> &'static [&'static str] {
    if cfg!(windows) {
        &[
            "codex_monitor_symphony.exe",
            "codex-monitor-symphony.exe",
            "symphony.exe",
        ]
    } else {
        &[
            "codex_monitor_symphony",
            "codex-monitor-symphony",
            "symphony",
        ]
    }
}

fn push_unique(dirs: &mut Vec<PathBuf>, path: PathBuf) {
    if !dirs.iter().any(|entry| entry == &path) {
        dirs.push(path);
    }
}

fn symphony_dev_candidates(current_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // In dev, the process cwd can be either the repo root or `src-tauri/`.
    // Walk a few ancestor levels so the sibling `../symphony` repo is found
    // from both layouts without hard-coding only one relative hop.
    for ancestor in current_dir.ancestors().take(4) {
        push_unique(
            &mut candidates,
            ancestor.join("../symphony/elixir/bin/symphony"),
        );
    }

    candidates
}

fn symphony_search_dirs(executable_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    push_unique(&mut dirs, executable_dir.to_path_buf());
    push_unique(&mut dirs, executable_dir.join("resources").join("symphony"));
    push_unique(&mut dirs, executable_dir.join("symphony"));

    #[cfg(target_os = "macos")]
    {
        if let Some(contents_dir) = executable_dir.parent() {
            push_unique(&mut dirs, contents_dir.join("Resources"));
            push_unique(
                &mut dirs,
                contents_dir
                    .join("Resources")
                    .join("resources")
                    .join("symphony"),
            );
            push_unique(&mut dirs, contents_dir.join("Resources").join("symphony"));
        }
        push_unique(&mut dirs, PathBuf::from("/opt/homebrew/bin"));
        push_unique(&mut dirs, PathBuf::from("/usr/local/bin"));
    }

    #[cfg(target_os = "linux")]
    {
        push_unique(&mut dirs, PathBuf::from("/usr/local/bin"));
        push_unique(&mut dirs, PathBuf::from("/usr/bin"));
    }

    dirs
}

pub(crate) fn resolve_symphony_binary_path() -> Result<PathBuf, String> {
    let candidate_names = symphony_binary_candidates();
    let mut attempted_paths: Vec<PathBuf> = Vec::new();

    if let Ok(explicit_raw) = std::env::var("CODEX_MONITOR_SYMPHONY_PATH") {
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

    if let Ok(current_dir) = std::env::current_dir() {
        for dev_candidate in symphony_dev_candidates(&current_dir) {
            if dev_candidate.is_file() {
                return Ok(dev_candidate);
            }
            attempted_paths.push(dev_candidate);
        }
    }

    let current_exe = std::env::current_exe().map_err(|err| err.to_string())?;
    let executable_dir = current_exe
        .parent()
        .ok_or_else(|| "Unable to resolve executable directory".to_string())?;
    for search_dir in symphony_search_dirs(executable_dir) {
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
        "Unable to locate Symphony binary (tried: {})",
        attempted
    ))
}
