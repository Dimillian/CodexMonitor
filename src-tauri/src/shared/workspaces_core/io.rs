use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::path::Path;
use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::shared::process_core::tokio_command;
#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
use crate::types::WorkspaceEntry;

use super::helpers::resolve_workspace_root;

pub(crate) async fn open_workspace_in_core(
    path: String,
    app: Option<String>,
    args: Vec<String>,
    command: Option<String>,
) -> Result<(), String> {
    fn output_snippet(bytes: &[u8]) -> Option<String> {
        const MAX_CHARS: usize = 240;
        let text = String::from_utf8_lossy(bytes).trim().replace('\n', "\\n");
        if text.is_empty() {
            return None;
        }
        let mut chars = text.chars();
        let snippet: String = chars.by_ref().take(MAX_CHARS).collect();
        if chars.next().is_some() {
            Some(format!("{snippet}..."))
        } else {
            Some(snippet)
        }
    }

    let target_label = command
        .as_ref()
        .map(|value| format!("command `{value}`"))
        .or_else(|| app.as_ref().map(|value| format!("app `{value}`")))
        .unwrap_or_else(|| "target".to_string());

    let output = if let Some(command) = command {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "windows")]
        let mut cmd = {
            let resolved = resolve_windows_executable(trimmed, None);
            let resolved_path = resolved.as_deref().unwrap_or_else(|| Path::new(trimmed));
            let ext = resolved_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase());

            if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
                let mut cmd = tokio_command("cmd");
                let mut command_args = args.clone();
                command_args.push(path.clone());
                let command_line = build_cmd_c_command(resolved_path, &command_args)?;
                cmd.arg("/D");
                cmd.arg("/S");
                cmd.arg("/C");
                cmd.raw_arg(command_line);
                cmd
            } else {
                let mut cmd = tokio_command(resolved_path);
                cmd.args(&args).arg(&path);
                cmd
            }
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.output()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else if let Some(app) = app {
        let trimmed = app.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "macos")]
        let mut cmd = {
            let mut cmd = tokio_command("open");
            cmd.arg("-a").arg(trimmed).arg(&path);
            if !args.is_empty() {
                cmd.arg("--args").args(&args);
            }
            cmd
        };

        #[cfg(not(target_os = "macos"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.output()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else {
        return Err("Missing app or command".to_string());
    };

    if output.status.success() {
        return Ok(());
    }

    let exit_detail = output
        .status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated by signal".to_string());
    let mut details = Vec::new();
    if let Some(stderr) = output_snippet(&output.stderr) {
        details.push(format!("stderr: {stderr}"));
    }
    if let Some(stdout) = output_snippet(&output.stdout) {
        details.push(format!("stdout: {stdout}"));
    }

    if details.is_empty() {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail})."
        ))
    } else {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail}; {}).",
            details.join("; ")
        ))
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let trimmed = app_name.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let icon_loader = std::sync::Arc::new(icon_loader);
    tokio::task::spawn_blocking(move || icon_loader(&trimmed))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let _ = app_name;
    let _ = icon_loader;
    Ok(None)
}

pub(crate) async fn list_workspace_files_core<F>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    list_files: F,
) -> Result<Vec<String>, String>
where
    F: Fn(&PathBuf) -> Vec<String>,
{
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    Ok(list_files(&root))
}

pub(crate) async fn read_workspace_file_core<F, T>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    path: &str,
    read_file: F,
) -> Result<T, String>
where
    F: Fn(&PathBuf, &str) -> Result<T, String>,
{
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    read_file(&root, path)
}
