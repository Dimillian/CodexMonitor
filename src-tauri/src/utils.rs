use std::env;
use std::ffi::OsString;
use std::path::PathBuf;

pub(crate) fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub(crate) fn normalize_windows_namespace_path(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }

    fn strip_prefix_ascii_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
        value
            .get(..prefix.len())
            .filter(|candidate| candidate.eq_ignore_ascii_case(prefix))
            .map(|_| &value[prefix.len()..])
    }

    fn starts_with_drive_path(value: &str) -> bool {
        let bytes = value.as_bytes();
        bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/')
    }

    if let Some(rest) = strip_prefix_ascii_case(path, r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//?/UNC/") {
        return format!("//{rest}");
    }
    if let Some(rest) = strip_prefix_ascii_case(path, r"\\?\").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//?/").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, r"\\.\").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }
    if let Some(rest) = strip_prefix_ascii_case(path, "//./").filter(|rest| starts_with_drive_path(rest)) {
        return rest.to_string();
    }

    path.to_string()
}

fn find_in_path(binary: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub(crate) fn resolve_git_binary() -> Result<PathBuf, String> {
    if let Some(path) = find_in_path("git") {
        return Ok(path);
    }
    if cfg!(windows) {
        if let Some(path) = find_in_path("git.exe") {
            return Ok(path);
        }
    }

    let candidates: &[&str] = if cfg!(windows) {
        &[
            "C:\\Program Files\\Git\\bin\\git.exe",
            "C:\\Program Files (x86)\\Git\\bin\\git.exe",
        ]
    } else {
        &[
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
            "/opt/local/bin/git",
            "/run/current-system/sw/bin/git",
        ]
    };

    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "Git not found. Install Git or ensure it is on PATH. Tried: {}",
        candidates.join(", ")
    ))
}

pub(crate) fn git_env_path() -> String {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let defaults: &[&str] = if cfg!(windows) {
        &["C:\\Windows\\System32"]
    } else {
        &[
            "/usr/bin",
            "/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/opt/local/bin",
            "/run/current-system/sw/bin",
        ]
    };

    for candidate in defaults {
        let path = PathBuf::from(candidate);
        if !paths.contains(&path) {
            paths.push(path);
        }
    }

    let joined = env::join_paths(paths).unwrap_or_else(|_| OsString::new());
    joined.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_git_path, normalize_windows_namespace_path};

    #[test]
    fn normalize_git_path_replaces_backslashes() {
        assert_eq!(normalize_git_path("foo\\bar\\baz"), "foo/bar/baz");
    }

    #[test]
    fn normalize_windows_namespace_path_strips_drive_prefix() {
        assert_eq!(
            normalize_windows_namespace_path(r"\\?\I:\gpt-projects\json-composer"),
            r"I:\gpt-projects\json-composer"
        );
        assert_eq!(
            normalize_windows_namespace_path("//?/I:/gpt-projects/json-composer"),
            "I:/gpt-projects/json-composer"
        );
    }

    #[test]
    fn normalize_windows_namespace_path_strips_unc_prefix() {
        assert_eq!(
            normalize_windows_namespace_path(r"\\?\UNC\SERVER\Share\Repo"),
            r"\\SERVER\Share\Repo"
        );
        assert_eq!(
            normalize_windows_namespace_path("//?/UNC/SERVER/Share/Repo"),
            "//SERVER/Share/Repo"
        );
        assert_eq!(
            normalize_windows_namespace_path(r"\\?\unc\SERVER\Share\Repo"),
            r"\\SERVER\Share\Repo"
        );
        assert_eq!(
            normalize_windows_namespace_path("//?/unc/SERVER/Share/Repo"),
            "//SERVER/Share/Repo"
        );
    }

    #[test]
    fn normalize_windows_namespace_path_preserves_whitespace_for_plain_paths() {
        assert_eq!(
            normalize_windows_namespace_path("  /tmp/workspace  "),
            "  /tmp/workspace  "
        );
    }

    #[test]
    fn normalize_windows_namespace_path_preserves_other_namespace_forms() {
        assert_eq!(
            normalize_windows_namespace_path(r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\repo"),
            r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\repo"
        );
        assert_eq!(
            normalize_windows_namespace_path(r"\\.\pipe\codex-monitor"),
            r"\\.\pipe\codex-monitor"
        );
    }
}
