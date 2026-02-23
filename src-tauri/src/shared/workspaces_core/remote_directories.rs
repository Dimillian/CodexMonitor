use std::env;
use std::path::{Path, PathBuf};

use crate::shared::workspace_rpc::{
    ListRemoteDirectoriesRequest, ListRemoteDirectoriesResponse, RemoteDirectoryEntry,
};

const DEFAULT_DIRECTORY_LIMIT: u32 = 300;
const MIN_DIRECTORY_LIMIT: u32 = 50;
const MAX_DIRECTORY_LIMIT: u32 = 1000;

#[derive(Debug)]
struct DirectoryCandidate {
    name: String,
    path: PathBuf,
    path_display: String,
    is_symlink: bool,
    symlink_target: Option<PathBuf>,
}

fn error_with_code(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn has_null_byte(value: &str) -> bool {
    value.bytes().any(|byte| byte == 0)
}

fn resolve_home_dir_with(
    home_env: Option<String>,
    fallback_home: Option<PathBuf>,
) -> Result<PathBuf, String> {
    if let Some(home) = home_env {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    if let Some(path) = fallback_home {
        return Ok(path);
    }
    Err(error_with_code(
        "INVALID_PATH",
        "Unable to resolve HOME directory.",
    ))
}

fn resolve_home_dir() -> Result<PathBuf, String> {
    let home_env = env::var("HOME")
        .ok()
        .or_else(|| env::var("USERPROFILE").ok());
    let fallback_home = dirs::home_dir();
    resolve_home_dir_with(home_env, fallback_home)
}

fn expand_requested_path(raw_path: Option<String>) -> Result<PathBuf, String> {
    let Some(raw_path) = raw_path else {
        return resolve_home_dir();
    };

    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return resolve_home_dir();
    }
    if has_null_byte(trimmed) {
        return Err(error_with_code(
            "INVALID_PATH",
            "Path contains an invalid null byte.",
        ));
    }

    if trimmed == "~" {
        return resolve_home_dir();
    }

    if let Some(suffix) = trimmed.strip_prefix("~/") {
        let home = resolve_home_dir()?;
        return Ok(home.join(suffix));
    }

    if let Some(suffix) = trimmed.strip_prefix("~\\") {
        let home = resolve_home_dir()?;
        let normalized = suffix.replace('\\', "/");
        return Ok(home.join(normalized));
    }

    if trimmed.starts_with('~') {
        return Err(error_with_code(
            "UNSUPPORTED_TILDE_USER",
            "Only current-user tilde expansion (~/...) is supported.",
        ));
    }

    Ok(PathBuf::from(trimmed))
}

fn canonicalize_directory(path: &Path) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path).map_err(|err| match err.kind() {
        std::io::ErrorKind::NotFound => {
            error_with_code("NOT_FOUND", format!("Path not found: {}", path.display()))
        }
        std::io::ErrorKind::PermissionDenied => error_with_code(
            "PERMISSION_DENIED",
            format!("Permission denied: {}", path.display()),
        ),
        _ => error_with_code(
            "INVALID_PATH",
            format!("Failed to resolve path {}: {err}", path.display()),
        ),
    })?;

    let metadata = std::fs::metadata(&canonical).map_err(|err| match err.kind() {
        std::io::ErrorKind::PermissionDenied => error_with_code(
            "PERMISSION_DENIED",
            format!("Permission denied: {}", canonical.display()),
        ),
        _ => error_with_code(
            "INVALID_PATH",
            format!("Failed to inspect path {}: {err}", canonical.display()),
        ),
    })?;

    if !metadata.is_dir() {
        return Err(error_with_code(
            "NOT_DIRECTORY",
            format!("Path is not a directory: {}", canonical.display()),
        ));
    }

    Ok(canonical)
}

fn should_include_hidden(include_hidden: bool, name: &str) -> bool {
    include_hidden || !name.starts_with('.')
}

fn clamp_limit(limit: Option<u32>) -> usize {
    let bounded = limit
        .unwrap_or(DEFAULT_DIRECTORY_LIMIT)
        .clamp(MIN_DIRECTORY_LIMIT, MAX_DIRECTORY_LIMIT);
    usize::try_from(bounded).unwrap_or(MAX_DIRECTORY_LIMIT as usize)
}

fn load_directory_candidates(
    canonical_path: &Path,
    include_hidden: bool,
) -> Result<Vec<DirectoryCandidate>, String> {
    let mut candidates = Vec::new();
    let read_dir = std::fs::read_dir(canonical_path).map_err(|err| match err.kind() {
        std::io::ErrorKind::PermissionDenied => error_with_code(
            "PERMISSION_DENIED",
            format!("Permission denied: {}", canonical_path.display()),
        ),
        _ => error_with_code(
            "INVALID_PATH",
            format!("Failed to read directory {}: {err}", canonical_path.display()),
        ),
    })?;

    for entry_result in read_dir {
        let Ok(entry) = entry_result else {
            continue;
        };

        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() || !should_include_hidden(include_hidden, &name) {
            continue;
        }

        let entry_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };

        let is_symlink = file_type.is_symlink();
        let mut canonical_target: Option<PathBuf> = None;

        let is_directory = if file_type.is_dir() {
            true
        } else if is_symlink {
            match std::fs::canonicalize(&entry_path) {
                Ok(target) => {
                    let is_dir = target.is_dir();
                    if is_dir {
                        canonical_target = Some(target);
                    }
                    is_dir
                }
                Err(_) => false,
            }
        } else {
            false
        };

        if !is_directory {
            continue;
        }

        if let Some(target) = canonical_target.as_ref() {
            if target == canonical_path || canonical_path.starts_with(target) {
                continue;
            }
        }

        let path_display = path_to_string(&entry_path);
        candidates.push(DirectoryCandidate {
            name,
            path: entry_path,
            path_display,
            is_symlink,
            symlink_target: canonical_target,
        });
    }

    candidates.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.path_display.cmp(&right.path_display))
    });

    Ok(candidates)
}

pub(crate) fn list_remote_directories_core(
    request: ListRemoteDirectoriesRequest,
) -> Result<ListRemoteDirectoriesResponse, String> {
    let include_hidden = request.include_hidden.unwrap_or(false);
    let offset = usize::try_from(request.offset.unwrap_or(0)).unwrap_or(usize::MAX);
    let limit = clamp_limit(request.limit);

    let requested_path = expand_requested_path(request.path)?;
    let canonical_path = canonicalize_directory(&requested_path)?;
    let current_path = path_to_string(&canonical_path);

    let candidates = load_directory_candidates(&canonical_path, include_hidden)?;
    let entry_count = u32::try_from(candidates.len()).unwrap_or(u32::MAX);

    let remaining = candidates.len().saturating_sub(offset);
    let entries = candidates
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|entry| RemoteDirectoryEntry {
            name: entry.name,
            path: entry.path_display,
            is_symlink: entry.is_symlink,
            is_readable: std::fs::read_dir(&entry.path).is_ok(),
            symlink_target: entry.symlink_target.as_deref().map(path_to_string),
        })
        .collect::<Vec<_>>();

    let truncated = remaining > entries.len();
    let parent_path = canonical_path
        .parent()
        .map(path_to_string)
        .filter(|parent| parent != &current_path);

    Ok(ListRemoteDirectoriesResponse {
        current_path,
        parent_path,
        entries,
        truncated,
        entry_count,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        list_remote_directories_core, resolve_home_dir_with, ListRemoteDirectoriesRequest,
    };
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn make_temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("codex-monitor-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn resolves_home_from_environment_when_present() {
        let home = make_temp_dir();
        let resolved = resolve_home_dir_with(
            Some(home.to_string_lossy().to_string()),
            None,
        )
        .expect("home should resolve");
        assert_eq!(resolved, home);
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn resolves_home_from_fallback_when_env_missing() {
        let fallback = make_temp_dir();
        let resolved = resolve_home_dir_with(None, Some(fallback.clone()))
            .expect("fallback home should resolve");
        assert_eq!(resolved, fallback);
        let _ = fs::remove_dir_all(fallback);
    }

    #[test]
    fn fails_when_no_home_directory_is_available() {
        let error = resolve_home_dir_with(None, None).expect_err("home resolution should fail");
        assert!(error.starts_with("INVALID_PATH:"));
    }

    #[test]
    fn rejects_paths_with_null_bytes() {
        let error = list_remote_directories_core(ListRemoteDirectoriesRequest {
            path: Some("/tmp\0/bad".to_string()),
            include_hidden: None,
            limit: None,
            offset: None,
        })
        .expect_err("null-byte paths must fail");
        assert!(error.starts_with("INVALID_PATH:"));
    }

    #[test]
    fn honors_hidden_filtering() {
        let root = make_temp_dir();
        fs::create_dir_all(root.join("visible")).expect("create visible dir");
        fs::create_dir_all(root.join(".hidden")).expect("create hidden dir");

        let without_hidden = list_remote_directories_core(ListRemoteDirectoriesRequest {
            path: Some(root.to_string_lossy().to_string()),
            include_hidden: Some(false),
            limit: Some(200),
            offset: Some(0),
        })
        .expect("list without hidden");
        assert_eq!(without_hidden.entry_count, 1);
        assert_eq!(without_hidden.entries.len(), 1);
        assert_eq!(without_hidden.entries[0].name, "visible");

        let with_hidden = list_remote_directories_core(ListRemoteDirectoriesRequest {
            path: Some(root.to_string_lossy().to_string()),
            include_hidden: Some(true),
            limit: Some(200),
            offset: Some(0),
        })
        .expect("list with hidden");
        assert_eq!(with_hidden.entry_count, 2);
        let names = with_hidden
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![".hidden", "visible"]);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn applies_limit_offset_and_truncation() {
        let root = make_temp_dir();
        for index in 0..120 {
            let path = root.join(format!("project-{index:03}"));
            fs::create_dir_all(path).expect("create project dir");
        }

        let response = list_remote_directories_core(ListRemoteDirectoriesRequest {
            path: Some(root.to_string_lossy().to_string()),
            include_hidden: Some(false),
            limit: Some(50),
            offset: Some(10),
        })
        .expect("list directories");

        assert_eq!(response.entry_count, 120);
        assert_eq!(response.entries.len(), 50);
        assert!(response.truncated);

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn filters_self_and_ancestor_symlink_loops() {
        use std::os::unix::fs::symlink;

        let root = make_temp_dir();
        let current = root.join("current");
        fs::create_dir_all(&current).expect("create current dir");
        fs::create_dir_all(current.join("child")).expect("create child dir");

        symlink(&current, current.join("self-loop")).expect("create self symlink");
        symlink(&root, current.join("ancestor-loop")).expect("create ancestor symlink");

        let response = list_remote_directories_core(ListRemoteDirectoriesRequest {
            path: Some(current.to_string_lossy().to_string()),
            include_hidden: Some(true),
            limit: Some(200),
            offset: Some(0),
        })
        .expect("list directories");

        let names = response
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["child"]);

        let _ = fs::remove_dir_all(root);
    }
}
