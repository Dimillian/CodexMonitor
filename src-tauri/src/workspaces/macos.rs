#[cfg(target_os = "macos")]
use base64::Engine as _;
#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
fn app_search_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    roots
}

#[cfg(target_os = "macos")]
fn normalize_app_bundle_name(app_name: &str) -> String {
    let trimmed = app_name.trim();
    if trimmed.to_ascii_lowercase().ends_with(".app") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.app")
    }
}

#[cfg(target_os = "macos")]
fn find_app_bundle(app_name: &str) -> Option<PathBuf> {
    let trimmed = app_name.trim();
    if trimmed.contains('/') {
        let direct = PathBuf::from(trimmed);
        if direct.exists() {
            return Some(direct);
        }
    }
    let normalized = normalize_app_bundle_name(app_name);
    let normalized_lower = normalized.to_ascii_lowercase();
    for root in app_search_roots() {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = match path.file_name() {
                    Some(name) => name.to_string_lossy().to_string(),
                    None => continue,
                };
                if file_name.to_ascii_lowercase() == normalized_lower && path.is_dir() {
                    return Some(path);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn defaults_read(info_domain: &Path, key: &str) -> Option<String> {
    let output = std::process::Command::new("defaults")
        .arg("read")
        .arg(info_domain.as_os_str())
        .arg(key)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(target_os = "macos")]
fn resolve_icon_name(bundle_path: &Path) -> String {
    let info_domain = bundle_path.join("Contents/Info");
    defaults_read(&info_domain, "CFBundleIconFile")
        .or_else(|| defaults_read(&info_domain, "CFBundleIconName"))
        .unwrap_or_else(|| {
            bundle_path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
                .unwrap_or_else(|| "AppIcon".to_string())
        })
}

#[cfg(target_os = "macos")]
fn resolve_icon_path(bundle_path: &Path, icon_name: &str) -> Option<PathBuf> {
    let resources_dir = bundle_path.join("Contents/Resources");
    if !resources_dir.exists() {
        return None;
    }

    let icon_path = PathBuf::from(icon_name);
    if icon_path.extension().is_some() {
        let direct = resources_dir.join(icon_path);
        if direct.exists() {
            return Some(direct);
        }
    }

    let candidates = [
        format!("{icon_name}.icns"),
        format!("{icon_name}.png"),
        "AppIcon.icns".to_string(),
        "AppIcon.png".to_string(),
        "app.icns".to_string(),
    ];
    for candidate in candidates {
        let path = resources_dir.join(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    let icon_name_lower = icon_name.to_ascii_lowercase();
    if let Ok(entries) = fs::read_dir(resources_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let ext = path
                .extension()
                .map(|ext| ext.to_string_lossy().to_ascii_lowercase());
            if !matches!(ext.as_deref(), Some("icns" | "png")) {
                continue;
            }
            let stem = path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if stem == icon_name_lower {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn temp_png_path(app_name: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let safe_name = app_name
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>();
    std::env::temp_dir().join(format!("codex-monitor-icon-{safe_name}-{ts}.png"))
}

#[cfg(target_os = "macos")]
fn load_icon_png_bytes(icon_path: &Path, app_name: &str) -> Option<Vec<u8>> {
    let ext = icon_path
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase());
    if matches!(ext.as_deref(), Some("png")) {
        return fs::read(icon_path).ok();
    }
    let out_path = temp_png_path(app_name);
    let status = std::process::Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(icon_path.as_os_str())
        .arg("--out")
        .arg(out_path.as_os_str())
        .status()
        .ok()?;
    if !status.success() {
        let _ = fs::remove_file(&out_path);
        return None;
    }
    let bytes = fs::read(&out_path).ok();
    let _ = fs::remove_file(&out_path);
    bytes
}

#[cfg(target_os = "macos")]
pub(crate) fn get_open_app_icon_inner(app_name: &str) -> Option<String> {
    let bundle_path = find_app_bundle(app_name)?;
    let icon_name = resolve_icon_name(&bundle_path);
    let icon_path = resolve_icon_path(&bundle_path, &icon_name)?;
    let png_bytes = load_icon_png_bytes(&icon_path, app_name)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    Some(format!("data:image/png;base64,{encoded}"))
}
