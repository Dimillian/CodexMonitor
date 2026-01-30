use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::timeout;

#[cfg(windows)]
fn hide_windows_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_windows_console(_command: &mut Command) {}

use crate::backend::events::{AppServerEvent, EventSink};
use crate::codex::args::apply_codex_args;
use crate::types::WorkspaceEntry;

fn extract_thread_id(value: &Value) -> Option<String> {
    value
        .get("params")
        .and_then(|p| p.get("threadId").or_else(|| p.get("thread_id")))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

pub(crate) struct WorkspaceSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) next_id: AtomicU64,
    /// Callbacks for background threads - events for these threadIds are sent through the channel
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
}

impl WorkspaceSession {
    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        self.write_message(json!({ "id": id, "method": method, "params": params }))
            .await?;
        rx.await.map_err(|_| "request canceled".to_string())
    }

    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "method": method, "params": params })
        } else {
            json!({ "method": method })
        };
        self.write_message(value).await
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }
}

pub(crate) fn build_codex_path_env(codex_bin: Option<&str>) -> Option<String> {
    use std::ffi::OsString;

    // Use OS-specific path parsing and joining
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let mut extras: Vec<PathBuf> = Vec::new();
    
    // Only add Unix-specific paths on non-Windows systems
    if !cfg!(windows) {
        extras.extend(vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
            PathBuf::from("/usr/sbin"),
            PathBuf::from("/sbin"),
        ]);
    }

    // Handle home directory paths (works on both Windows and Unix)
    let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    if let Ok(home) = env::var(home_var) {
        if !cfg!(windows) {
            extras.push(PathBuf::from(format!("{home}/.local/bin")));
            extras.push(PathBuf::from(format!("{home}/.local/share/mise/shims")));
            extras.push(PathBuf::from(format!("{home}/.cargo/bin")));
            extras.push(PathBuf::from(format!("{home}/.bun/bin")));
            let nvm_root = Path::new(&home).join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin");
                    if bin_path.is_dir() {
                        extras.push(bin_path);
                    }
                }
            }
        } else {
            // Windows-specific paths
            extras.push(PathBuf::from(format!("{home}\\.cargo\\bin")));
        }
    }

    if let Some(bin_path) = codex_bin.filter(|value| !value.trim().is_empty()) {
        let parent = Path::new(bin_path).parent();
        if let Some(parent) = parent {
            extras.push(parent.to_path_buf());
        }
    }

    for extra in extras {
        if !paths.contains(&extra) {
            paths.push(extra);
        }
    }

    if paths.is_empty() {
        None
    } else {
        let joined = env::join_paths(paths).unwrap_or_else(|_| OsString::new());
        Some(joined.to_string_lossy().to_string())
    }
}

pub(crate) fn build_codex_command_with_bin(codex_bin: Option<String>) -> Command {
    let bin = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "codex".into());

    let mut command = if cfg!(windows) {
        // On Windows, handle different codex installation types:
        // 1. If it's a .js file, run it through node
        // 2. If it's a .cmd/.bat script, run via cmd.exe (required on Windows)
        // 3. Otherwise, execute the binary directly (avoids unnecessary cmd.exe and
        //    reduces command-injection risk from user-provided codex_bin)
        let bin_lower = bin.to_ascii_lowercase();
        if bin_lower.ends_with(".js") {
            let mut cmd = Command::new("node");
            cmd.arg(&bin);
            cmd
        } else if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
            let mut cmd = Command::new("cmd");
            cmd.arg("/C");
            cmd.arg(&bin);
            cmd
        } else {
            Command::new(&bin)
        }
    } else {
        Command::new(bin)
    };

    hide_windows_console(&mut command);
    if let Some(path_env) = build_codex_path_env(codex_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_codex_command_with_bin(codex_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Codex CLI not found. Install Codex and ensure `codex` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Codex CLI. Make sure `codex --version` runs in Terminal."
                    .to_string(),
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err(
                "Codex CLI failed to start. Try running `codex --version` in Terminal."
                    .to_string(),
            );
        }
        return Err(format!(
            "Codex CLI failed to start: {detail}. Try running `codex --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let codex_bin = entry
        .codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_codex_bin);
    let _ = check_codex_installation(codex_bin.clone()).await?;

    let mut command = build_codex_command_with_bin(codex_bin);
    apply_codex_args(&mut command, codex_args.as_deref())?;
    command.current_dir(&entry.path);
    command.arg("app-server");
    if let Some(codex_home) = codex_home {
        command.env("CODEX_HOME", codex_home);
    }
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
    });

    let session_clone = Arc::clone(&session);
    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "codex/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    };
                    event_sink_clone.emit_app_server_event(payload);
                    continue;
                }
            };

            let maybe_id = value.get("id").and_then(|id| id.as_u64());
            let has_method = value.get("method").is_some();
            let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();

            // Check if this event is for a background thread
            let thread_id = extract_thread_id(&value);

            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if has_method {
                    // Check for background thread callback
                    let mut sent_to_background = false;
                    if let Some(ref tid) = thread_id {
                        let callbacks = session_clone.background_thread_callbacks.lock().await;
                        if let Some(tx) = callbacks.get(tid) {
                            let _ = tx.send(value.clone());
                            sent_to_background = true;
                        }
                    }
                    // Don't emit to frontend if this is a background thread event
                    if !sent_to_background {
                        let payload = AppServerEvent {
                            workspace_id: workspace_id.clone(),
                            message: value,
                        };
                        event_sink_clone.emit_app_server_event(payload);
                    }
                } else if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                    let _ = tx.send(value);
                }
            } else if has_method {
                // Check for background thread callback
                let mut sent_to_background = false;
                if let Some(ref tid) = thread_id {
                    let callbacks = session_clone.background_thread_callbacks.lock().await;
                    if let Some(tx) = callbacks.get(tid) {
                        let _ = tx.send(value.clone());
                        sent_to_background = true;
                    }
                }
                // Don't emit to frontend if this is a background thread event
                if !sent_to_background {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: value,
                    };
                    event_sink_clone.emit_app_server_event(payload);
                }
            }
        }
    });

    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let payload = AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            };
            event_sink_clone.emit_app_server_event(payload);
        }
    });

    let init_params = json!({
        "clientInfo": {
            "name": "codex_monitor",
            "title": "CodexMonitor",
            "version": client_version
        }
    });
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
            return Err(
                "Codex app-server did not respond to initialize. Check that `codex app-server` works in Terminal."
                    .to_string(),
            );
        }
    };
    init_response?;
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::{build_codex_command_with_bin, build_codex_path_env, extract_thread_id};
    use serde_json::json;
    use std::env;
    use std::ffi::OsString;

    #[test]
    fn extract_thread_id_reads_camel_case() {
        let value = json!({ "params": { "threadId": "thread-123" } });
        assert_eq!(extract_thread_id(&value), Some("thread-123".to_string()));
    }

    #[test]
    fn extract_thread_id_reads_snake_case() {
        let value = json!({ "params": { "thread_id": "thread-456" } });
        assert_eq!(extract_thread_id(&value), Some("thread-456".to_string()));
    }

    #[test]
    fn extract_thread_id_returns_none_when_missing() {
        let value = json!({ "params": {} });
        assert_eq!(extract_thread_id(&value), None);
    }

    #[test]
    fn build_codex_path_env_includes_parent_path() {
        let original_path = env::var_os("PATH");
        env::set_var("PATH", "C:\\Temp\\bin");

        let result = build_codex_path_env(Some("C:\\Tools\\codex\\codex.exe"))
            .expect("expected PATH result");

        assert!(result.contains("C:\\Temp\\bin"));
        assert!(result.contains("C:\\Tools\\codex"));

        match original_path {
            Some(value) => env::set_var("PATH", value),
            None => env::remove_var("PATH"),
        }
    }

    #[cfg(windows)]
    #[test]
    fn build_codex_path_env_uses_windows_separator() {
        let original_path = env::var_os("PATH");
        env::set_var("PATH", "C:\\Temp\\bin;C:\\Tools");

        let result = build_codex_path_env(None).expect("expected PATH result");
        assert!(result.contains(';'));

        match original_path {
            Some(value) => env::set_var("PATH", value),
            None => env::remove_var("PATH"),
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn build_codex_path_env_uses_unix_separator() {
        let original_path = env::var_os("PATH");
        env::set_var("PATH", "/tmp/bin:/usr/bin");

        let result = build_codex_path_env(None).expect("expected PATH result");
        assert!(result.contains(':'));

        match original_path {
            Some(value) => env::set_var("PATH", value),
            None => env::remove_var("PATH"),
        }
    }

    #[cfg(windows)]
    #[test]
    fn build_codex_command_uses_node_for_js() {
        let command = build_codex_command_with_bin(Some(
            "C:\\Tools\\codex\\codex.js".to_string(),
        ));
        let std_command = command.as_std();
        assert_eq!(std_command.get_program(), &OsString::from("node"));
        let args: Vec<OsString> = std_command.get_args().map(|arg| arg.to_os_string()).collect();
        assert!(args.contains(&OsString::from("C:\\Tools\\codex\\codex.js")));
    }

    #[cfg(windows)]
    #[test]
    fn build_codex_command_uses_cmd_for_wrappers() {
        let command = build_codex_command_with_bin(Some("codex".to_string()));
        let std_command = command.as_std();
        assert_eq!(std_command.get_program(), &OsString::from("cmd"));
        let args: Vec<OsString> = std_command.get_args().map(|arg| arg.to_os_string()).collect();
        assert!(args.contains(&OsString::from("/C")));
        assert!(args.contains(&OsString::from("codex")));
    }

    #[cfg(not(windows))]
    #[test]
    fn build_codex_command_uses_bin_directly() {
        let command = build_codex_command_with_bin(Some("/usr/local/bin/codex".to_string()));
        let std_command = command.as_std();
        assert_eq!(
            std_command.get_program(),
            &OsString::from("/usr/local/bin/codex")
        );
    }
}
