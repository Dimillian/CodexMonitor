use serde_json::{json, Value};
use std::time::Duration;

use tauri::State;
use tokio::time::timeout;

pub(crate) mod args;

use crate::backend::app_server::{
    build_cursor_command_with_bin, build_cursor_path_env, check_cursor_installation,
};
use crate::state::AppState;
use self::args::apply_cursor_args;

/// Check Cursor CLI installation and report status
#[tauri::command]
pub(crate) async fn cursor_doctor(
    cursor_bin: Option<String>,
    cursor_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = state.app_settings.lock().await;
        (settings.cursor_bin.clone(), settings.cursor_args.clone())
    };
    let resolved = cursor_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = cursor_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_cursor_path_env(resolved.as_deref());
    let version = check_cursor_installation(resolved.clone()).await?;

    // Test basic command execution
    let mut command = build_cursor_command_with_bin(resolved.clone());
    apply_cursor_args(&mut command, resolved_args.as_deref())?;
    command.arg("--help");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let help_ok = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map(|output| output.status.success()).unwrap_or(false),
        Err(_) => false,
    };

    let details = if help_ok {
        None
    } else {
        Some("Failed to run `cursor --help`.".to_string())
    };

    Ok(json!({
        "ok": version.is_some() && help_ok,
        "cursorBin": resolved,
        "version": version,
        "helpOk": help_ok,
        "details": details,
        "path": path_env,
    }))
}
