use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use crate::backend::events::{EventSink, TerminalOutput};
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

fn shell_path() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn spawn_terminal_reader(
    event_sink: impl EventSink,
    workspace_id: String,
    terminal_id: String,
    mut reader: Box<dyn Read + Send>,
) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let payload = TerminalOutput {
                        workspace_id: workspace_id.clone(),
                        terminal_id: terminal_id.clone(),
                        data,
                    };
                    event_sink.emit_terminal_output(payload);
                }
                Err(_) => break,
            }
        }
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
    cmd.arg("-i");
    cmd.env("TERM", "xterm-256color");

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
            let mut child = session.child.lock().await;
            let _ = child.kill();
            return Ok(TerminalSessionInfo {
                id: existing.id.clone(),
            });
        }
        sessions.insert(key, session);
    }
    let event_sink = TauriEventSink::new(app);
    spawn_terminal_reader(event_sink, workspace_id, terminal_id, reader);

    Ok(TerminalSessionInfo {
        id: session_id,
    })
}

#[tauri::command]
pub(crate) async fn terminal_write(
    workspace_id: String,
    terminal_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = terminal_key(&workspace_id, &terminal_id);
    let sessions = state.terminal_sessions.lock().await;
    let session = sessions
        .get(&key)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    let mut writer = session.writer.lock().await;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to pty: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush pty: {e}"))?;
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
    let sessions = state.terminal_sessions.lock().await;
    let session = sessions
        .get(&key)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    let size = PtySize {
        rows: rows.max(2),
        cols: cols.max(2),
        pixel_width: 0,
        pixel_height: 0,
    };
    let master = session.master.lock().await;
    master
        .resize(size)
        .map_err(|e| format!("Failed to resize pty: {e}"))?;
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
    let mut child = session.child.lock().await;
    let _ = child.kill();
    Ok(())
}
