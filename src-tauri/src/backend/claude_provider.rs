use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;

use crate::backend::app_server::build_codex_path_env;
use crate::backend::events::{AppServerEvent, EventSink};
use crate::backend::provider::AgentProvider;
use crate::types::WorkspaceEntry;

/// Session managing communication with the Claude Node.js bridge
pub struct ClaudeSession {
    pub entry: WorkspaceEntry,
    pub child: Mutex<Child>,
    pub stdin: Mutex<ChildStdin>,
    pub pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub next_id: AtomicU64,
}

impl ClaudeSession {
    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        self.write_message(json!({ "id": id, "method": method, "params": params }))
            .await?;
        rx.await.map_err(|_| "request canceled".to_string())
    }

    pub async fn send_notification(
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

    pub async fn send_response(&self, id: u64, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }
}

/// ClaudeProvider wraps a ClaudeSession to implement AgentProvider
pub struct ClaudeProvider {
    session: Arc<ClaudeSession>,
}

impl ClaudeProvider {
    pub fn new(session: Arc<ClaudeSession>) -> Self {
        Self { session }
    }
}

#[async_trait]
impl AgentProvider for ClaudeProvider {
    fn workspace_entry(&self) -> &WorkspaceEntry {
        &self.session.entry
    }

    async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.session.send_request(method, params).await
    }

    async fn send_response(&self, id: u64, result: Value) -> Result<(), String> {
        self.session.send_response(id, result).await
    }

    async fn shutdown(&self) -> Result<(), String> {
        let mut child = self.session.child.lock().await;
        child.kill().await.map_err(|e| e.to_string())
    }
}

/// Build the path to the Claude bridge executable
fn find_claude_bridge(app_root: Option<&Path>) -> PathBuf {
    // Try to find the bridge in several locations:
    // 1. Relative to app root (for bundled app)
    // 2. In src-nodejs/dist (for development)

    if let Some(root) = app_root {
        // Check bundled location
        let bundled = root.join("claude-bridge").join("dist").join("index.js");
        if bundled.exists() {
            return bundled;
        }
    }

    // Development location - relative to project root
    // This assumes we're running from the project directory
    PathBuf::from("src-nodejs/dist/index.js")
}

/// Check if Node.js is available
pub async fn check_node_installation(path_env: Option<&str>) -> Result<Option<String>, String> {
    let mut command = Command::new("node");
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "Node.js not found. Install Node.js to use Claude integration.".to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err("Timed out while checking Node.js.".to_string());
        }
    };

    if !output.status.success() {
        return Err("Node.js check failed.".to_string());
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() {
        None
    } else {
        Some(version)
    })
}

/// Spawn a Claude bridge session for a workspace
pub async fn spawn_claude_session<E: EventSink>(
    entry: WorkspaceEntry,
    client_version: String,
    event_sink: E,
    app_root: Option<PathBuf>,
    claude_bin: Option<String>,
    data_dir: Option<PathBuf>,
) -> Result<Arc<ClaudeSession>, String> {
    let path_env = build_codex_path_env(claude_bin.as_deref());
    // Check Node.js is available
    let _ = check_node_installation(path_env.as_deref()).await?;

    let bridge_path = find_claude_bridge(app_root.as_deref());
    if !bridge_path.exists() {
        return Err(format!(
            "Claude bridge not found at {}. Run 'npm --prefix src-nodejs run build'.",
            bridge_path.display()
        ));
    }

    let mut command = Command::new("node");
    if let Some(ref path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.arg(&bridge_path);
    command.current_dir(&entry.path);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    if let Some(ref data_dir) = data_dir {
        command.env(
            "CODEX_MONITOR_DATA_DIR",
            data_dir.to_string_lossy().to_string(),
        );
    }
    command.env("CODEX_MONITOR_WORKSPACE_ID", entry.id.clone());
    if let Some(ref claude_bin) = claude_bin.filter(|value| !value.trim().is_empty()) {
        command.env("CODEX_MONITOR_CLAUDE_PATH", claude_bin);
    }

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(ClaudeSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
    });

    // Spawn stdout reader task
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
            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if has_method {
                    let payload = AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: value,
                    };
                    event_sink_clone.emit_app_server_event(payload);
                } else if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                    let _ = tx.send(value);
                }
            } else if has_method {
                let payload = AppServerEvent {
                    workspace_id: workspace_id.clone(),
                    message: value,
                };
                event_sink_clone.emit_app_server_event(payload);
            }
        }
    });

    // Spawn stderr reader task
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

    // Initialize the bridge
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
                "Claude bridge did not respond to initialize. Check that the bridge is built."
                    .to_string(),
            );
        }
    };
    init_response?;
    session.send_notification("initialized", None).await?;

    // Emit connected event
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
    use super::*;

    #[test]
    fn find_claude_bridge_returns_dev_path_without_app_root() {
        let path = find_claude_bridge(None);
        assert_eq!(path, PathBuf::from("src-nodejs/dist/index.js"));
    }

    #[test]
    fn find_claude_bridge_checks_bundled_first() {
        use std::fs;
        use tempfile::TempDir;

        // Create a temp directory with the bundled path
        let temp_dir = TempDir::new().unwrap();
        let bundled_dir = temp_dir.path().join("claude-bridge").join("dist");
        fs::create_dir_all(&bundled_dir).unwrap();
        let bundled_path = bundled_dir.join("index.js");
        fs::write(&bundled_path, "// test").unwrap();

        let path = find_claude_bridge(Some(temp_dir.path()));
        assert_eq!(path, bundled_path);
    }
}
