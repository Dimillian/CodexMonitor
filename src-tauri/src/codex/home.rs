use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::types::{AppSettings, WorkspaceEntry};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexHomeStatus {
    pub(crate) configured_path: Option<String>,
    pub(crate) effective_path: String,
    pub(crate) source: String,
}

/// Resolve the home once for all application operations. An unavailable selected
/// home is an error: falling back could select another environment's credentials.
pub(crate) fn resolve_codex_home(configured_home: Option<&str>) -> Result<PathBuf, String> {
    resolve_codex_home_with_sources(
        configured_home,
        env::var("CODEX_HOME").ok().as_deref(),
        resolve_home_dir().as_deref(),
    )
    .map(|(path, _)| path)
}

/// Confirm that a launcher did not replace the home selected by the application.
/// Older app-servers may omit this field; callers only invoke this when reported.
pub(crate) fn validate_reported_codex_home(expected: &Path, reported: &str) -> Result<(), String> {
    if reported.trim().is_empty() {
        return Err(
            "Codex app-server reported an empty Codex home; refusing to connect".to_string(),
        );
    }
    let expected = fs::canonicalize(expected).map_err(|error| {
        format!(
            "Selected Codex home became unavailable: {} ({error})",
            expected.display(),
        )
    })?;
    if !expected.is_dir() {
        return Err(format!(
            "Selected Codex home is not a directory: {}",
            expected.display()
        ));
    }
    let (actual, _) = resolve_codex_home_with_sources(Some(reported), None, None)?;
    if actual != expected {
        return Err(format!(
            "Codex app-server is using a different Codex home (expected {}, reported {}). Check the configured executable or launcher; refusing to connect.",
            expected.display(), actual.display(),
        ));
    }
    Ok(())
}

pub(crate) fn resolve_codex_home_status(
    configured_home: Option<&str>,
) -> Result<CodexHomeStatus, String> {
    let (path, source) = resolve_codex_home_with_sources(
        configured_home,
        env::var("CODEX_HOME").ok().as_deref(),
        resolve_home_dir().as_deref(),
    )?;
    Ok(CodexHomeStatus {
        configured_path: nonempty(configured_home).map(str::to_owned),
        effective_path: path.to_string_lossy().into_owned(),
        source: source.to_string(),
    })
}

fn nonempty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn resolve_codex_home_with_sources(
    configured_home: Option<&str>,
    environment_home: Option<&str>,
    user_home: Option<&Path>,
) -> Result<(PathBuf, &'static str), String> {
    let (path, source) = if let Some(value) = nonempty(configured_home) {
        (
            normalize_codex_home(value).expect("nonempty home"),
            "application",
        )
    } else if let Some(value) = nonempty(environment_home) {
        (
            normalize_codex_home(value).expect("nonempty home"),
            "environment",
        )
    } else {
        (
            user_home
                .ok_or_else(|| "Unable to resolve the default Codex home directory".to_string())?
                .join(".codex"),
            "default",
        )
    };
    if !path.is_absolute() {
        return Err(format!(
            "Codex home must be an absolute directory path: {}",
            path.display()
        ));
    }
    let canonical = match fs::canonicalize(&path) {
        Ok(canonical) => canonical,
        Err(error)
            if source == "default"
                && error.kind() == std::io::ErrorKind::NotFound
                && matches!(fs::symlink_metadata(&path), Err(error) if error.kind() == std::io::ErrorKind::NotFound) =>
        {
            // Preserve first-run default behavior; global file writes create it.
            return Ok((path, source));
        }
        Err(error) => {
            return Err(format!(
                "Codex home directory is unavailable: {} ({error}). Ensure its volume is mounted and the directory is accessible.",
                path.display()
            ));
        }
    };
    if !canonical.is_dir() {
        return Err(format!("Codex home is not a directory: {}", path.display()));
    }
    fs::read_dir(&canonical).map_err(|error| {
        format!(
            "Codex home directory is not accessible: {} ({error})",
            path.display()
        )
    })?;
    Ok((canonical, source))
}

pub(crate) fn resolve_workspace_codex_home(
    _entry: &WorkspaceEntry,
    _parent_entry: Option<&WorkspaceEntry>,
    app_settings: &AppSettings,
) -> Result<PathBuf, String> {
    resolve_codex_home(app_settings.codex_home.as_deref())
}

fn normalize_codex_home(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(path) = expand_tilde(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_dollar_env(trimmed) {
        return Some(path);
    }
    if let Some(path) = expand_percent_env(trimmed) {
        return Some(path);
    }
    Some(PathBuf::from(trimmed))
}

fn expand_tilde(value: &str) -> Option<PathBuf> {
    if !value.starts_with('~') {
        return None;
    }
    let home_dir = resolve_home_dir()?;
    if value == "~" {
        return Some(home_dir);
    }
    let rest = value.strip_prefix("~/")?;
    Some(home_dir.join(rest))
}

fn expand_dollar_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('$')?;
    if rest.is_empty() {
        return None;
    }

    let (var, remainder) = if let Some(inner) = rest.strip_prefix('{') {
        let end = inner.find('}')?;
        let name = &inner[..end];
        let remaining = &inner[end + 1..];
        (name, remaining)
    } else {
        let end = rest
            .find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '_'))
            .unwrap_or(rest.len());
        let name = &rest[..end];
        let remaining = &rest[end..];
        (name, remaining)
    };

    if var.is_empty() {
        return None;
    }

    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn expand_percent_env(value: &str) -> Option<PathBuf> {
    let rest = value.strip_prefix('%')?;
    let end = rest.find('%')?;
    let var = &rest[..end];
    if var.is_empty() {
        return None;
    }
    let remainder = &rest[end + 1..];
    let value = resolve_env_var(var)?;
    Some(join_env_path(&value, remainder))
}

fn resolve_env_var(name: &str) -> Option<String> {
    if name.eq_ignore_ascii_case("HOME") {
        if let Some(home) = resolve_home_dir() {
            return Some(home.to_string_lossy().to_string());
        }
    }
    if let Some(value) = lookup_env_value(name) {
        return Some(value);
    }
    None
}

fn lookup_env_value(name: &str) -> Option<String> {
    if let Ok(value) = env::var(name) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }
    let upper = name.to_ascii_uppercase();
    if upper != name {
        if let Ok(value) = env::var(&upper) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    let lower = name.to_ascii_lowercase();
    if lower != name && lower != upper {
        if let Ok(value) = env::var(&lower) {
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn join_env_path(prefix: &str, remainder: &str) -> PathBuf {
    let mut base = PathBuf::from(prefix.trim());
    let trimmed_remainder = remainder.trim_start_matches(['/', '\\']);
    if trimmed_remainder.is_empty() {
        base
    } else {
        base.push(trimmed_remainder);
        base
    }
}

pub(crate) fn resolve_home_dir() -> Option<PathBuf> {
    if let Ok(value) = env::var("HOME") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    if let Ok(value) = env::var("USERPROFILE") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    #[cfg(unix)]
    {
        // Fallback for daemon environments that do not expose HOME.
        unsafe {
            let uid = libc::geteuid();
            let pwd = libc::getpwuid(uid);
            if !pwd.is_null() {
                let dir_ptr = (*pwd).pw_dir;
                if !dir_ptr.is_null() {
                    if let Ok(dir) = std::ffi::CStr::from_ptr(dir_ptr).to_str() {
                        if !dir.trim().is_empty() {
                            return Some(PathBuf::from(dir));
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceKind, WorkspaceSettings, WorktreeInfo};
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn workspace_entry(kind: WorkspaceKind, path: &str) -> WorkspaceEntry {
        let worktree = if kind.is_worktree() {
            Some(WorktreeInfo {
                branch: "feature/test".to_string(),
            })
        } else {
            None
        };
        WorkspaceEntry {
            id: "workspace-id".to_string(),
            name: "workspace".to_string(),
            path: path.to_string(),
            kind,
            parent_id: None,
            worktree,
            settings: WorkspaceSettings::default(),
        }
    }

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("codex-home-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create fixture");
            Self(path)
        }

        fn directory(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            fs::create_dir_all(&path).expect("create directory");
            path
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reported_home_must_match_selected_existing_directory() {
        let fixture = Fixture::new();
        let selected = fixture.directory("selected");
        let other = fixture.directory("other");
        validate_reported_codex_home(&selected, selected.to_str().unwrap()).unwrap();
        assert!(
            validate_reported_codex_home(&selected, other.to_str().unwrap())
                .unwrap_err()
                .contains("different Codex home")
        );
        assert!(validate_reported_codex_home(&selected, "").is_err());
        assert!(validate_reported_codex_home(
            &selected,
            fixture.0.join("missing").to_str().unwrap()
        )
        .is_err());
        assert!(validate_reported_codex_home(
            &fixture.0.join("missing"),
            selected.to_str().unwrap()
        )
        .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn reported_home_accepts_symlink_to_selected_home() {
        let fixture = Fixture::new();
        let selected = fixture.directory("selected");
        let linked = fixture.0.join("linked");
        std::os::unix::fs::symlink(&selected, &linked).unwrap();
        validate_reported_codex_home(&selected, linked.to_str().unwrap()).unwrap();
        validate_reported_codex_home(&linked, selected.to_str().unwrap()).unwrap();
    }

    #[test]
    fn explicit_home_precedes_environment_and_default() {
        let fixture = Fixture::new();
        let selected = fixture.directory("selected");
        let environment = fixture.directory("environment");
        let (resolved, source) = resolve_codex_home_with_sources(
            selected.to_str(),
            environment.to_str(),
            Some(&fixture.0),
        )
        .expect("resolve explicit");
        assert_eq!(
            resolved,
            fs::canonicalize(selected).expect("canonical selected")
        );
        assert_eq!(source, "application");
    }

    #[test]
    fn environment_precedes_default_and_blank_setting_restores_default_behavior() {
        let fixture = Fixture::new();
        let environment = fixture.directory("environment");
        let (resolved, source) =
            resolve_codex_home_with_sources(Some("  "), environment.to_str(), Some(&fixture.0))
                .expect("resolve environment");
        assert_eq!(
            resolved,
            fs::canonicalize(environment).expect("canonical environment")
        );
        assert_eq!(source, "environment");
        let (resolved, source) =
            resolve_codex_home_with_sources(None, Some("  "), Some(&fixture.0))
                .expect("missing default remains creatable");
        assert_eq!(resolved, fixture.0.join(".codex"));
        assert_eq!(source, "default");
    }

    #[test]
    fn unavailable_selected_home_never_falls_back() {
        let fixture = Fixture::new();
        let selected = fixture.0.join("unmounted-volume");
        let environment = fixture.directory("environment");
        let error = resolve_codex_home_with_sources(
            selected.to_str(),
            environment.to_str(),
            Some(&fixture.0),
        )
        .expect_err("unavailable explicit home");
        assert!(error.contains("unavailable"));
        assert!(error.contains("unmounted-volume"));
        assert!(
            resolve_codex_home_with_sources(None, selected.to_str(), Some(&fixture.0)).is_err()
        );
    }

    #[test]
    fn home_must_be_an_absolute_directory() {
        let fixture = Fixture::new();
        let file = fixture.0.join("config.toml");
        fs::write(&file, "").expect("create file");
        assert!(resolve_codex_home_with_sources(file.to_str(), None, None)
            .expect_err("file is not home")
            .contains("not a directory"));
        assert!(
            resolve_codex_home_with_sources(Some("relative/home"), None, None)
                .expect_err("relative home")
                .contains("absolute")
        );
    }

    #[test]
    fn workspace_home_uses_application_setting() {
        let fixture = Fixture::new();
        let selected = fixture.directory("selected");
        let settings = AppSettings {
            codex_home: selected.to_str().map(str::to_owned),
            ..AppSettings::default()
        };
        let entry = workspace_entry(WorkspaceKind::Main, "/repo");
        assert_eq!(
            resolve_workspace_codex_home(&entry, None, &settings).expect("resolve workspace"),
            fs::canonicalize(selected).expect("canonical selected"),
        );
        let status = resolve_codex_home_status(settings.codex_home.as_deref()).expect("status");
        assert_eq!(status.configured_path, settings.codex_home);
        assert_eq!(status.source, "application");
        let serialized = serde_json::to_value(&status).expect("serialize status");
        assert_eq!(serialized["configuredPath"], settings.codex_home.unwrap());
        assert_eq!(serialized["effectivePath"], status.effective_path);
        assert_eq!(serialized["source"], "application");
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_home_is_canonical_and_dangling_link_is_rejected() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let destination = fixture.directory("volume-home");
        fs::write(destination.join("config.toml"), "model = \"fixture\"\n").expect("config");
        let link = fixture.0.join("selected-home");
        symlink(&destination, &link).expect("symlink home");
        let (resolved, _) =
            resolve_codex_home_with_sources(link.to_str(), None, None).expect("resolve symlink");
        assert_eq!(
            resolved,
            fs::canonicalize(&destination).expect("canonical destination")
        );
        fs::remove_dir_all(destination).expect("simulate unmounted home");
        assert!(resolve_codex_home_with_sources(link.to_str(), None, None).is_err());
        let default_link = fixture.0.join(".codex");
        symlink(fixture.0.join("absent"), &default_link).expect("dangling default");
        assert!(resolve_codex_home_with_sources(None, None, Some(&fixture.0)).is_err());
    }

    #[test]
    fn codex_home_expands_tilde_and_env_vars() {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let home_dir = std::env::temp_dir().join("codex-home-test");
        let home_str = home_dir.to_string_lossy().to_string();

        let prev_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &home_str);

        let prev_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", "/tmp/appdata-root");

        let tilde = normalize_codex_home("~/.codex-api");
        assert_eq!(tilde, Some(home_dir.join(".codex-api")));

        let dollar = normalize_codex_home("$HOME/.codex-api");
        assert_eq!(dollar, Some(home_dir.join(".codex-api")));

        let braces = normalize_codex_home("${HOME}/.codex-api");
        assert_eq!(braces, Some(home_dir.join(".codex-api")));

        let appdata = normalize_codex_home("%APPDATA%/Codex");
        assert_eq!(appdata, Some(PathBuf::from("/tmp/appdata-root/Codex")));

        let appdata_lower = normalize_codex_home("$appdata/Codex");
        assert_eq!(
            appdata_lower,
            Some(PathBuf::from("/tmp/appdata-root/Codex"))
        );

        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        match prev_appdata {
            Some(value) => std::env::set_var("APPDATA", value),
            None => std::env::remove_var("APPDATA"),
        }
    }
}
