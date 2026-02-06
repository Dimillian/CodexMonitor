use serde_json::{json, Value};
use std::time::Duration;

use tauri::State;
use tokio::time::timeout;

pub(crate) mod args;

use crate::backend::app_server::{
    build_claude_command_with_bin, build_claude_path_env, check_claude_installation,
};
use crate::state::AppState;
use self::args::apply_claude_args;

/// Check Claude Code CLI installation and report status
#[tauri::command]
pub(crate) async fn claude_doctor(
    claude_bin: Option<String>,
    claude_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = state.app_settings.lock().await;
        (settings.claude_bin.clone(), settings.claude_args.clone())
    };
    let resolved = claude_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = claude_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_claude_path_env(resolved.as_deref());
    let version = check_claude_installation(resolved.clone()).await?;

    // Test sandbox subcommand
    let mut command = build_claude_command_with_bin(resolved.clone());
    apply_claude_args(&mut command, resolved_args.as_deref())?;
    command.arg("sandbox");
    command.arg("--help");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let sandbox_ok = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map(|output| output.status.success()).unwrap_or(false),
        Err(_) => false,
    };

    let details = if sandbox_ok {
        None
    } else {
        Some("Failed to run `claude sandbox --help`.".to_string())
    };

    Ok(json!({
        "ok": version.is_some() && sandbox_ok,
        "claudeBin": resolved,
        "version": version,
        "sandboxOk": sandbox_ok,
        "details": details,
        "path": path_env,
    }))
}
