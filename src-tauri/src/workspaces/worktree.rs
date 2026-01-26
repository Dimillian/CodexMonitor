use std::path::PathBuf;

pub(crate) fn sanitize_worktree_name(branch: &str) -> String {
    let mut result = String::new();
    for ch in branch.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "worktree".to_string()
    } else {
        trimmed
    }
}

pub(crate) fn sanitize_clone_dir_name(name: &str) -> String {
    let mut result = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "copy".to_string()
    } else {
        trimmed
    }
}

pub(crate) fn unique_worktree_path(base_dir: &PathBuf, name: &str) -> PathBuf {
    let mut candidate = base_dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if !next.exists() {
            candidate = next;
            break;
        }
    }
    candidate
}

pub(crate) fn unique_worktree_path_for_rename(
    base_dir: &PathBuf,
    name: &str,
    current_path: &PathBuf,
) -> Result<PathBuf, String> {
    let candidate = base_dir.join(name);
    if candidate == *current_path {
        return Ok(candidate);
    }
    if !candidate.exists() {
        return Ok(candidate);
    }
    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if next == *current_path || !next.exists() {
            return Ok(next);
        }
    }
    Err(format!(
        "Failed to find an available worktree path under {}.",
        base_dir.display()
    ))
}

pub(crate) fn build_clone_destination_path(copies_folder: &PathBuf, copy_name: &str) -> PathBuf {
    let safe_name = sanitize_clone_dir_name(copy_name);
    unique_worktree_path(copies_folder, &safe_name)
}

pub(crate) fn null_device_path() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}
