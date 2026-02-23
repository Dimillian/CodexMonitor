#[cfg(all(target_os = "macos", debug_assertions))]
use std::process::Command;

#[tauri::command]
pub(crate) async fn is_macos_debug_build() -> bool {
    cfg!(all(target_os = "macos", debug_assertions))
}

#[tauri::command]
pub(crate) async fn app_build_type() -> String {
    if cfg!(debug_assertions) {
        "debug".to_string()
    } else {
        "release".to_string()
    }
}

/// macOS dev-mode fallback for system notifications.
///
/// In `tauri dev` (debug assertions enabled), the app is typically run as a
/// bare binary instead of a bundled `.app`. macOS notifications can silently
/// fail in that mode because the process does not have a stable bundle
/// identifier registered with the system notification center.
///
/// This fallback uses AppleScript via `osascript` so the developer still gets
/// a visible notification during local development.
#[tauri::command]
pub(crate) async fn send_notification_fallback(title: String, body: String) -> Result<(), String> {
    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        let escape = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            escape(&body),
            escape(&title)
        );

        let status = Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map_err(|error| format!("Failed to run osascript: {error}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("osascript exited with status: {status}"))
        }
    }

    #[cfg(not(all(target_os = "macos", debug_assertions)))]
    {
        let _ = (title, body);
        Err("Notification fallback is only available on macOS debug builds.".to_string())
    }
}
