use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::backend::events::{EventSink, TerminalExit, TerminalOutput};
use crate::event_sink::TauriEventSink;
use crate::state::AppState;

pub(crate) struct TerminalSession {
    pub(crate) id: String,
    pub(crate) master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    pub(crate) writer: Mutex<Box<dyn Write + Send>>,
    pub(crate) child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TerminalSessionInfo {
    id: String,
}

fn terminal_key(workspace_id: &str, terminal_id: &str) -> String {
    format!("{workspace_id}:{terminal_id}")
}

fn is_terminal_closed_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("broken pipe")
        || lower.contains("input/output error")
        || lower.contains("os error 5")
        || lower.contains("eio")
        || lower.contains("io error")
        || lower.contains("not connected")
        || lower.contains("closed")
}

async fn get_terminal_session(
    state: &State<'_, AppState>,
    key: &str,
) -> Result<Arc<TerminalSession>, String> {
    let sessions = state.terminal_sessions.lock().await;
    sessions
        .get(key)
        .cloned()
        .ok_or_else(|| "Terminal session not found".to_string())
}

#[cfg(target_os = "windows")]
fn shell_path() -> String {
    std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
}

#[cfg(not(target_os = "windows"))]
fn shell_path() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

#[cfg(any(target_os = "windows", test))]
fn windows_shell_args(shell: &str) -> Vec<&'static str> {
    let shell = shell.to_ascii_lowercase();
    if shell.contains("powershell") || shell.ends_with("pwsh.exe") || shell.ends_with("\\pwsh") {
        vec!["-NoLogo", "-NoExit"]
    } else if shell.ends_with("cmd.exe") || shell.ends_with("\\cmd") {
        vec!["/K"]
    } else {
        Vec::new()
    }
}

fn unix_shell_args() -> Vec<&'static str> {
    vec!["-i"]
}

#[cfg(target_os = "windows")]
fn configure_shell_args(cmd: &mut CommandBuilder) {
    for arg in windows_shell_args(&shell_path()) {
        cmd.arg(arg);
    }
}

#[cfg(not(target_os = "windows"))]
fn configure_shell_args(cmd: &mut CommandBuilder) {
    for arg in unix_shell_args() {
        cmd.arg(arg);
    }
}

fn resolve_locale() -> String {
    let candidate = std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_else(|_| "en_US.UTF-8".to_string());
    let lower = candidate.to_lowercase();
    if lower.contains("utf-8") || lower.contains("utf8") {
        return candidate;
    }
    "en_US.UTF-8".to_string()
}

fn spawn_terminal_reader(
    event_sink: impl EventSink,
    app: AppHandle,
    session: Arc<TerminalSession>,
    workspace_id: String,
    terminal_id: String,
    mut reader: Box<dyn Read + Send>,
) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    pending.extend_from_slice(&buffer[..count]);
                    loop {
                        match std::str::from_utf8(&pending) {
                            Ok(decoded) => {
                                if !decoded.is_empty() {
                                    let payload = TerminalOutput {
                                        workspace_id: workspace_id.clone(),
                                        terminal_id: terminal_id.clone(),
                                        data: decoded.to_string(),
                                    };
                                    event_sink.emit_terminal_output(payload);
                                }
                                pending.clear();
                                break;
                            }
                            Err(error) => {
                                let valid_up_to = error.valid_up_to();
                                if valid_up_to == 0 {
                                    if error.error_len().is_none() {
                                        break;
                                    }
                                    let invalid_len = error.error_len().unwrap_or(1);
                                    pending.drain(..invalid_len.min(pending.len()));
                                    continue;
                                }
                                let chunk =
                                    String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
                                if !chunk.is_empty() {
                                    let payload = TerminalOutput {
                                        workspace_id: workspace_id.clone(),
                                        terminal_id: terminal_id.clone(),
                                        data: chunk,
                                    };
                                    event_sink.emit_terminal_output(payload);
                                }
                                pending.drain(..valid_up_to);
                                if error.error_len().is_none() {
                                    break;
                                }
                                let invalid_len = error.error_len().unwrap_or(1);
                                pending.drain(..invalid_len.min(pending.len()));
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        let cleanup_workspace_id = workspace_id.clone();
        let cleanup_terminal_id = terminal_id.clone();
        let cleanup_session = Arc::clone(&session);
        event_sink.emit_terminal_exit(TerminalExit {
            workspace_id,
            terminal_id,
        });
        tauri::async_runtime::spawn(async move {
            let state = app.state::<AppState>();
            let mut sessions = state.terminal_sessions.lock().await;
            let key = terminal_key(&cleanup_workspace_id, &cleanup_terminal_id);
            let should_remove = sessions
                .get(&key)
                .is_some_and(|current| Arc::ptr_eq(current, &cleanup_session));
            if should_remove {
                sessions.remove(&key);
            }
        });
    });
}

async fn get_workspace_path(
    workspace_id: &str,
    state: &State<'_, AppState>,
) -> Result<PathBuf, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "Unknown workspace".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

#[tauri::command]
pub(crate) async fn terminal_open(
    workspace_id: String,
    terminal_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<TerminalSessionInfo, String> {
    if terminal_id.is_empty() {
        return Err("Terminal id is required".to_string());
    }
    let key = terminal_key(&workspace_id, &terminal_id);
    {
        let sessions = state.terminal_sessions.lock().await;
        if let Some(existing) = sessions.get(&key) {
            return Ok(TerminalSessionInfo {
                id: existing.id.clone(),
            });
        }
    }

    let cwd = get_workspace_path(&workspace_id, &state).await?;
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.max(2),
        cols: cols.max(2),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open pty: {e}"))?;

    let mut cmd = CommandBuilder::new(shell_path());
    cmd.cwd(cwd);
    configure_shell_args(&mut cmd);
    cmd.env("TERM", "xterm-256color");
    let locale = resolve_locale();
    cmd.env("LANG", &locale);
    cmd.env("LC_ALL", &locale);
    cmd.env("LC_CTYPE", &locale);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to open pty reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to open pty writer: {e}"))?;

    let session = Arc::new(TerminalSession {
        id: terminal_id.clone(),
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    });
    let session_id = session.id.clone();

    {
        let mut sessions = state.terminal_sessions.lock().await;
        if let Some(existing) = sessions.get(&key) {
            let id = existing.id.clone();
            drop(sessions);
            let _ = tokio::task::spawn_blocking(move || {
                let mut child = session.child.blocking_lock();
                let _ = child.kill();
            })
            .await;
            return Ok(TerminalSessionInfo { id });
        }
        sessions.insert(key, Arc::clone(&session));
    }
    let event_sink = TauriEventSink::new(app.clone());
    spawn_terminal_reader(
        event_sink,
        app,
        Arc::clone(&session),
        workspace_id,
        terminal_id,
        reader,
    );

    Ok(TerminalSessionInfo { id: session_id })
}

#[tauri::command]
pub(crate) async fn terminal_write(
    workspace_id: String,
    terminal_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = terminal_key(&workspace_id, &terminal_id);
    let session = get_terminal_session(&state, &key).await?;
    let write_result = tokio::task::spawn_blocking(move || {
        let mut writer = session.writer.blocking_lock();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to pty: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush pty: {e}"))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Terminal write task failed: {e}"))?;

    if let Err(err) = write_result {
        if is_terminal_closed_error(&err) {
            let mut sessions = state.terminal_sessions.lock().await;
            sessions.remove(&key);
        }
        return Err(err);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn terminal_resize(
    workspace_id: String,
    terminal_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = terminal_key(&workspace_id, &terminal_id);
    let session = get_terminal_session(&state, &key).await?;
    let size = PtySize {
        rows: rows.max(2),
        cols: cols.max(2),
        pixel_width: 0,
        pixel_height: 0,
    };
    let resize_result = tokio::task::spawn_blocking(move || {
        let master = session.master.blocking_lock();
        master
            .resize(size)
            .map_err(|e| format!("Failed to resize pty: {e}"))
    })
    .await
    .map_err(|e| format!("Terminal resize task failed: {e}"))?;
    if let Err(err) = resize_result {
        if is_terminal_closed_error(&err) {
            let mut sessions = state.terminal_sessions.lock().await;
            sessions.remove(&key);
        }
        return Err(err);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn terminal_close(
    workspace_id: String,
    terminal_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = terminal_key(&workspace_id, &terminal_id);
    let mut sessions = state.terminal_sessions.lock().await;
    let session = sessions
        .remove(&key)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    drop(sessions);
    let _ = tokio::task::spawn_blocking(move || {
        let mut child = session.child.blocking_lock();
        let _ = child.kill();
    })
    .await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{unix_shell_args, windows_shell_args};

    #[test]
    fn windows_shell_args_match_powershell_variants() {
        assert_eq!(
            windows_shell_args(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"),
            vec!["-NoLogo", "-NoExit"]
        );
        assert_eq!(
            windows_shell_args(r"C:\Program Files\PowerShell\7\pwsh.exe"),
            vec!["-NoLogo", "-NoExit"]
        );
        assert_eq!(
            windows_shell_args(r"C:\Program Files\PowerShell\7\PwSh"),
            vec!["-NoLogo", "-NoExit"]
        );
    }

    #[test]
    fn windows_shell_args_match_cmd_variants() {
        assert_eq!(
            windows_shell_args(r"C:\Windows\System32\cmd.exe"),
            vec!["/K"]
        );
        assert_eq!(windows_shell_args(r"C:\Windows\System32\CMD"), vec!["/K"]);
    }

    #[test]
    fn windows_shell_args_are_empty_for_other_shells() {
        assert!(windows_shell_args("nu.exe").is_empty());
    }

    #[test]
    fn unix_shell_args_stay_interactive() {
        assert_eq!(unix_shell_args(), vec!["-i"]);
    }
}
