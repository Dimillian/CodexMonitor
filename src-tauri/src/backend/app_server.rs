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

use crate::backend::events::{AppServerEvent, EventSink};
use crate::gemini::args::apply_gemini_args;
use crate::types::WorkspaceEntry;

fn extract_thread_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;

    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("thread")
                .and_then(|thread| thread.get("id"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
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

pub(crate) fn build_gemini_path_env(gemini_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<String> = env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect();
    let mut extras = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(|value| value.to_string())
    .collect::<Vec<String>>();
    if let Ok(home) = env::var("HOME") {
        extras.push(format!("{home}/.local/bin"));
        extras.push(format!("{home}/.local/share/mise/shims"));
        extras.push(format!("{home}/.cargo/bin"));
        extras.push(format!("{home}/.bun/bin"));
        // Add Google Cloud SDK path for gemini
        extras.push(format!("{home}/google-cloud-sdk/bin"));
        let nvm_root = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.is_dir() {
                    extras.push(bin_path.to_string_lossy().to_string());
                }
            }
        }
    }
    if let Some(bin_path) = gemini_bin.filter(|value| !value.trim().is_empty()) {
        let parent = Path::new(bin_path).parent();
        if let Some(parent) = parent {
            extras.push(parent.to_string_lossy().to_string());
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
        Some(paths.join(":"))
    }
}

pub(crate) fn build_gemini_command_with_bin(gemini_bin: Option<String>) -> Command {
    let bin = gemini_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "gemini".into());
    let mut command = Command::new(bin);
    if let Some(path_env) = build_gemini_path_env(gemini_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

pub(crate) async fn check_gemini_installation(
    gemini_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_gemini_command_with_bin(gemini_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Gemini CLI not found. Install Gemini CLI and ensure `gemini` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Gemini CLI. Make sure `gemini --version` runs in Terminal."
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
                "Gemini CLI failed to start. Try running `gemini --version` in Terminal."
                    .to_string(),
            );
        }
        return Err(format!(
            "Gemini CLI failed to start: {detail}. Try running `gemini --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

// Cursor CLI support

pub(crate) fn build_cursor_path_env(cursor_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<String> = env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect();
    let mut extras = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(|value| value.to_string())
    .collect::<Vec<String>>();
    if let Ok(home) = env::var("HOME") {
        extras.push(format!("{home}/.local/bin"));
        extras.push(format!("{home}/.local/share/mise/shims"));
        extras.push(format!("{home}/.cargo/bin"));
        extras.push(format!("{home}/.bun/bin"));
        // Common Cursor CLI installation paths
        extras.push(format!("{home}/.cursor/bin"));
        let nvm_root = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.is_dir() {
                    extras.push(bin_path.to_string_lossy().to_string());
                }
            }
        }
    }
    if let Some(bin_path) = cursor_bin.filter(|value| !value.trim().is_empty()) {
        let parent = Path::new(bin_path).parent();
        if let Some(parent) = parent {
            extras.push(parent.to_string_lossy().to_string());
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
        Some(paths.join(":"))
    }
}

pub(crate) fn build_cursor_command_with_bin(cursor_bin: Option<String>) -> Command {
    let bin = cursor_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "cursor".into());
    let mut command = Command::new(bin);
    if let Some(path_env) = build_cursor_path_env(cursor_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

/// Cursor CLI settings for spawning
pub(crate) struct CursorCliSettings {
    pub(crate) vim_mode: bool,
    pub(crate) default_mode: String,
    pub(crate) output_format: String,
    pub(crate) attribute_commits: bool,
    pub(crate) attribute_prs: bool,
    pub(crate) use_http1: bool,
}

impl Default for CursorCliSettings {
    fn default() -> Self {
        Self {
            vim_mode: false,
            default_mode: "agent".to_string(),
            output_format: "stream-json".to_string(),
            attribute_commits: false,
            attribute_prs: false,
            use_http1: false,
        }
    }
}

pub(crate) fn apply_cursor_flags(command: &mut Command, settings: &CursorCliSettings) {
    // Apply operating mode
    if !settings.default_mode.is_empty() {
        command.args(["--mode", &settings.default_mode]);
    }

    // Apply output format for streaming JSON (required for our protocol)
    if !settings.output_format.is_empty() {
        command.args(["--output-format", &settings.output_format]);
    }

    // Apply vim mode if enabled
    if settings.vim_mode {
        command.arg("--vim");
    }

    // Apply attribution settings
    if settings.attribute_commits {
        command.arg("--attribute-commits");
    }
    if settings.attribute_prs {
        command.arg("--attribute-prs");
    }

    // Apply HTTP/1 mode if needed
    if settings.use_http1 {
        command.arg("--use-http1");
    }
}

pub(crate) async fn check_cursor_installation(
    cursor_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_cursor_command_with_bin(cursor_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Cursor CLI not found. Install Cursor CLI and ensure `cursor` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Cursor CLI. Make sure `cursor --version` runs in Terminal."
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
                "Cursor CLI failed to start. Try running `cursor --version` in Terminal."
                    .to_string(),
            );
        }
        return Err(format!(
            "Cursor CLI failed to start: {detail}. Try running `cursor --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

// Claude Code CLI support

pub(crate) fn build_claude_path_env(claude_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<String> = env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect();
    let mut extras = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(|value| value.to_string())
    .collect::<Vec<String>>();
    if let Ok(home) = env::var("HOME") {
        extras.push(format!("{home}/.local/bin"));
        extras.push(format!("{home}/.local/share/mise/shims"));
        extras.push(format!("{home}/.cargo/bin"));
        extras.push(format!("{home}/.bun/bin"));
        // Common Claude Code CLI installation paths
        extras.push(format!("{home}/.claude/bin"));
        let nvm_root = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.is_dir() {
                    extras.push(bin_path.to_string_lossy().to_string());
                }
            }
        }
    }
    if let Some(bin_path) = claude_bin.filter(|value| !value.trim().is_empty()) {
        let parent = Path::new(bin_path).parent();
        if let Some(parent) = parent {
            extras.push(parent.to_string_lossy().to_string());
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
        Some(paths.join(":"))
    }
}

pub(crate) fn build_claude_command_with_bin(claude_bin: Option<String>) -> Command {
    let bin = claude_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "claude".into());
    let mut command = Command::new(bin);
    if let Some(path_env) = build_claude_path_env(claude_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

pub(crate) async fn check_claude_installation(
    claude_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_claude_command_with_bin(claude_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Claude Code CLI not found. Install Claude Code CLI and ensure `claude` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Claude Code CLI. Make sure `claude --version` runs in Terminal."
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
                "Claude Code CLI failed to start. Try running `claude --version` in Terminal."
                    .to_string(),
            );
        }
        return Err(format!(
            "Claude Code CLI failed to start: {detail}. Try running `claude --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

/// CLI spawn configuration
pub(crate) struct CliSpawnConfig {
    pub(crate) cli_type: String,
    pub(crate) gemini_bin: Option<String>,
    pub(crate) gemini_args: Option<String>,
    pub(crate) gemini_home: Option<PathBuf>,
    pub(crate) cursor_bin: Option<String>,
    pub(crate) cursor_args: Option<String>,
    pub(crate) cursor_settings: CursorCliSettings,
    pub(crate) claude_bin: Option<String>,
    pub(crate) claude_args: Option<String>,
}

impl Default for CliSpawnConfig {
    fn default() -> Self {
        Self {
            cli_type: "gemini".to_string(),
            gemini_bin: None,
            gemini_args: None,
            gemini_home: None,
            cursor_bin: None,
            cursor_args: None,
            cursor_settings: CursorCliSettings::default(),
            claude_bin: None,
            claude_args: None,
        }
    }
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    config: CliSpawnConfig,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let cli_type = config.cli_type.as_str();
    let cli_name = match cli_type {
        "cursor" => "cursor",
        "claude" => "claude",
        _ => "gemini",
    };

    // Build command based on CLI type
    let mut command = match cli_type {
        "cursor" => {
            // Cursor CLI
            let cursor_bin = config.cursor_bin;
            let _ = check_cursor_installation(cursor_bin.clone()).await?;

            let mut cmd = build_cursor_command_with_bin(cursor_bin);
            apply_cursor_flags(&mut cmd, &config.cursor_settings);
            if let Some(args) = config.cursor_args.as_deref() {
                let parsed = shell_words::split(args).map_err(|e| format!("Invalid Cursor args: {e}"))?;
                cmd.args(parsed);
            }
            cmd.current_dir(&entry.path);
            cmd
        }
        "claude" => {
            // Claude Code CLI
            let claude_bin = config.claude_bin;
            let _ = check_claude_installation(claude_bin.clone()).await?;

            let mut cmd = build_claude_command_with_bin(claude_bin);
            if let Some(args) = config.claude_args.as_deref() {
                let parsed = shell_words::split(args).map_err(|e| format!("Invalid Claude args: {e}"))?;
                cmd.args(parsed);
            }
            cmd.current_dir(&entry.path);
            cmd.arg("sandbox");
            cmd
        }
        _ => {
            // Gemini CLI (default)
            let gemini_bin = entry
                .gemini_bin
                .clone()
                .filter(|value| !value.trim().is_empty())
                .or(config.gemini_bin);
            let _ = check_gemini_installation(gemini_bin.clone()).await?;

            let mut cmd = build_gemini_command_with_bin(gemini_bin);
            apply_gemini_args(&mut cmd, config.gemini_args.as_deref())?;
            cmd.current_dir(&entry.path);
            // Use Gemini's sandbox mode
            cmd.arg("sandbox");
            if let Some(gemini_home) = config.gemini_home {
                cmd.env("GEMINI_HOME", gemini_home);
            }
            cmd
        }
    };

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
                            "method": "cli/parseError",
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
                    "method": "cli/stderr",
                    "params": { "message": line },
                }),
            };
            event_sink_clone.emit_app_server_event(payload);
        }
    });

    let init_params = json!({
        "clientInfo": {
            "name": "gemini_monitor",
            "title": "GeminiMonitor",
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
            let display_name = match cli_name {
                "cursor" => "Cursor",
                "claude" => "Claude Code",
                _ => "Gemini",
            };
            let check_cmd = if cli_name == "cursor" { "--help" } else { "sandbox" };
            return Err(format!(
                "{display_name} CLI did not respond to initialize. Check that `{cli_name} {check_cmd}` works in Terminal."
            ));
        }
    };
    init_response?;
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "cli/connected",
            "params": { "workspaceId": entry.id.clone(), "cliType": cli_name }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::extract_thread_id;
    use serde_json::json;

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
}
