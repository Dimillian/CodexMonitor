fn main() {
    ensure_daemon_sidecar_stub();
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rustc-link-lib=z");
        println!("cargo:rustc-link-lib=iconv");
    }
}

fn ensure_daemon_sidecar_stub() {
    use std::fs;
    use std::path::PathBuf;

    let target_triple = std::env::var("TARGET").unwrap_or_default();
    if target_triple.is_empty() {
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default());
    if manifest_dir.as_os_str().is_empty() {
        return;
    }

    let extension = if target_triple.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar_path = manifest_dir
        .join("target")
        .join("sidecars")
        .join(format!("codex-monitor-daemon-{target_triple}{extension}"));

    if sidecar_path.exists() {
        return;
    }

    if let Some(parent) = sidecar_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    #[cfg(unix)]
    let stub = b"#!/bin/sh\necho \"codex-monitor-daemon sidecar placeholder\" >&2\nexit 1\n";
    #[cfg(not(unix))]
    let stub = b"";

    if fs::write(&sidecar_path, stub).is_err() {
        return;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&sidecar_path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o755);
            let _ = fs::set_permissions(&sidecar_path, permissions);
        }
    }
}
