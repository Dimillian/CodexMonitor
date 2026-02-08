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
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::codex::args::parse_codex_args;
use crate::types::WorkspaceEntry;

#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};

#[derive(Clone, Debug)]
pub(crate) struct CliSpawnConfig {
    pub cli_type: String,
    pub cli_bin: Option<String>,
    pub cli_args: Option<String>,
    pub cli_home: Option<PathBuf>,
}

#[async_trait::async_trait]
pub(crate) trait CliAdapter: Send + Sync {
    async fn send_request(&self, method: &str, params: Value) -> Result<Value, String>;
    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String>;
    async fn send_response(&self, id: Value, result: Value) -> Result<(), String>;
    async fn kill(&self);
}

struct AppServerTransport {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
}

enum SessionTransport {
    AppServer(AppServerTransport),
    Adapter(Box<dyn CliAdapter>),
}

pub(crate) struct WorkspaceSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) background_thread_callbacks: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
    transport: SessionTransport,
}

impl WorkspaceSession {
    async fn write_message(&self, value: Value) -> Result<(), String> {
        match &self.transport {
            SessionTransport::AppServer(t) => {
                let mut stdin = t.stdin.lock().await;
                let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
                line.push('\n');
                stdin
                    .write_all(line.as_bytes())
                    .await
                    .map_err(|e| e.to_string())
            }
            SessionTransport::Adapter(_) => {
                Err("write_message not supported on adapter transport".to_string())
            }
        }
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        match &self.transport {
            SessionTransport::AppServer(t) => {
                let id = t.next_id.fetch_add(1, Ordering::SeqCst);
                let (tx, rx) = oneshot::channel();
                t.pending.lock().await.insert(id, tx);
                self.write_message(json!({ "id": id, "method": method, "params": params }))
                    .await?;
                rx.await.map_err(|_| "request canceled".to_string())
            }
            SessionTransport::Adapter(adapter) => adapter.send_request(method, params).await,
        }
    }

    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        match &self.transport {
            SessionTransport::AppServer(_) => {
                let value = if let Some(params) = params {
                    json!({ "method": method, "params": params })
                } else {
                    json!({ "method": method })
                };
                self.write_message(value).await
            }
            SessionTransport::Adapter(adapter) => adapter.send_notification(method, params).await,
        }
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        match &self.transport {
            SessionTransport::AppServer(_) => {
                self.write_message(json!({ "id": id, "result": result }))
                    .await
            }
            SessionTransport::Adapter(adapter) => adapter.send_response(id, result).await,
        }
    }

    pub(crate) async fn kill(&self) {
        match &self.transport {
            SessionTransport::AppServer(t) => {
                let mut child = t.child.lock().await;
                kill_child_process_tree(&mut child).await;
            }
            SessionTransport::Adapter(adapter) => {
                adapter.kill().await;
            }
        }
    }

    pub(crate) fn new_with_adapter(
        entry: WorkspaceEntry,
        adapter: Box<dyn CliAdapter>,
        callbacks: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
    ) -> Self {
        Self {
            entry,
            background_thread_callbacks: callbacks,
            transport: SessionTransport::Adapter(adapter),
        }
    }
}

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

fn build_initialize_params(client_version: &str) -> Value {
    json!({
        "clientInfo": {
            "name": "codex_monitor",
            "title": "Agent Monitor",
            "version": client_version
        },
        "capabilities": {
            "experimentalApi": true
        }
    })
}

pub(crate) fn build_codex_path_env(codex_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let mut extras: Vec<PathBuf> = Vec::new();

    #[cfg(not(target_os = "windows"))]
    {
        extras.extend([
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ].into_iter().map(PathBuf::from));

        if let Ok(home) = env::var("HOME") {
            let home_path = Path::new(&home);
            extras.push(home_path.join(".local/bin"));
            extras.push(home_path.join(".local/share/mise/shims"));
            extras.push(home_path.join(".cargo/bin"));
            extras.push(home_path.join(".bun/bin"));
            let nvm_root = home_path.join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin");
                    if bin_path.is_dir() {
                        extras.push(bin_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = env::var("APPDATA") {
            extras.push(Path::new(&appdata).join("npm"));
        }
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            extras.push(
                Path::new(&local_app_data)
                    .join("Microsoft")
                    .join("WindowsApps"),
            );
        }
        if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
            let home_path = Path::new(&home);
            extras.push(home_path.join(".cargo").join("bin"));
            extras.push(home_path.join("scoop").join("shims"));
        }
        if let Ok(program_data) = env::var("PROGRAMDATA") {
            extras.push(Path::new(&program_data).join("chocolatey").join("bin"));
        }
    }

    if let Some(bin_path) = codex_bin.filter(|value| !value.trim().is_empty()) {
        if let Some(parent) = Path::new(bin_path).parent() {
            extras.push(parent.to_path_buf());
        }
    }

    for extra in extras {
        if !paths.iter().any(|path| path == &extra) {
            paths.push(extra);
        }
    }

    if paths.is_empty() {
        return None;
    }

    env::join_paths(paths)
        .ok()
        .map(|joined| joined.to_string_lossy().to_string())
}

pub(crate) fn build_codex_command_with_bin(
    codex_bin: Option<String>,
    codex_args: Option<&str>,
    args: Vec<String>,
) -> Result<Command, String> {
    let bin = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "codex".into());

    let path_env = build_codex_path_env(codex_bin.as_deref());
    let mut command_args = parse_codex_args(codex_args)?;
    command_args.extend(args);

    #[cfg(target_os = "windows")]
    let mut command = {
        let bin_trimmed = bin.trim();
        let resolved = resolve_windows_executable(bin_trimmed, path_env.as_deref());
        let resolved_path = resolved
            .as_deref()
            .unwrap_or_else(|| Path::new(bin_trimmed));
        let ext = resolved_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());

        if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
            let mut command = tokio_command("cmd");
            let command_line = build_cmd_c_command(resolved_path, &command_args)?;
            command.arg("/D");
            command.arg("/S");
            command.arg("/C");
            command.arg(command_line);
            command
        } else {
            let mut command = tokio_command(resolved_path);
            command.args(command_args);
            command
        }
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = tokio_command(bin.trim());
        command.args(command_args);
        command
    };

    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    Ok(command)
}

pub(crate) async fn check_cli_installation(
    cli_bin: Option<String>,
    cli_name: &str,
) -> Result<Option<String>, String> {
    let mut command =
        build_codex_command_with_bin(cli_bin, None, vec!["--version".to_string()])?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                format!(
                    "{cli_name} CLI not found. Install {cli_name} and ensure `{bin}` is on your PATH.",
                    bin = cli_name.to_lowercase()
                )
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(format!(
                "Timed out while checking {cli_name} CLI. Make sure `{bin} --version` runs in Terminal.",
                bin = cli_name.to_lowercase()
            ));
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
            return Err(format!(
                "{cli_name} CLI failed to start. Try running `{bin} --version` in Terminal.",
                bin = cli_name.to_lowercase()
            ));
        }
        return Err(format!(
            "{cli_name} CLI failed to start: {detail}. Try running `{bin} --version` in Terminal.",
            bin = cli_name.to_lowercase()
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    check_cli_installation(codex_bin, "Codex").await
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    config: CliSpawnConfig,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    if config.cli_type == "claude" {
        return crate::backend::claude_adapter::spawn_claude_session(
            entry, config, event_sink,
        )
        .await;
    }

    let codex_bin = config
        .cli_bin
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            entry
                .codex_bin
                .clone()
                .filter(|value| !value.trim().is_empty())
        });
    let _ = check_codex_installation(codex_bin.clone()).await?;

    let mut command = build_codex_command_with_bin(
        codex_bin,
        config.cli_args.as_deref(),
        vec!["app-server".to_string()],
    )?;
    command.current_dir(&entry.path);
    if let Some(codex_home) = config.cli_home {
        command.env("CODEX_HOME", codex_home);
    }
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let transport = AppServerTransport {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
    };

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        background_thread_callbacks: Arc::new(Mutex::new(HashMap::new())),
        transport: SessionTransport::AppServer(transport),
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

            let thread_id = extract_thread_id(&value);

            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let SessionTransport::AppServer(t) = &session_clone.transport {
                        if let Some(tx) = t.pending.lock().await.remove(&id) {
                            let _ = tx.send(value);
                        }
                    }
                } else if has_method {
                    let mut sent_to_background = false;
                    if let Some(ref tid) = thread_id {
                        let callbacks = session_clone.background_thread_callbacks.lock().await;
                        if let Some(tx) = callbacks.get(tid) {
                            let _ = tx.send(value.clone());
                            sent_to_background = true;
                        }
                    }
                    if !sent_to_background {
                        let payload = AppServerEvent {
                            workspace_id: workspace_id.clone(),
                            message: value,
                        };
                        event_sink_clone.emit_app_server_event(payload);
                    }
                } else if let SessionTransport::AppServer(t) = &session_clone.transport {
                    if let Some(tx) = t.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                }
            } else if has_method {
                let mut sent_to_background = false;
                if let Some(ref tid) = thread_id {
                    let callbacks = session_clone.background_thread_callbacks.lock().await;
                    if let Some(tx) = callbacks.get(tid) {
                        let _ = tx.send(value.clone());
                        sent_to_background = true;
                    }
                }
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

    let init_params = build_initialize_params(&client_version);
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            session.kill().await;
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
    use super::{build_initialize_params, extract_thread_id, CliSpawnConfig};
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

    #[test]
    fn build_initialize_params_enables_experimental_api() {
        let params = build_initialize_params("1.2.3");
        assert_eq!(
            params
                .get("capabilities")
                .and_then(|caps| caps.get("experimentalApi"))
                .and_then(|value| value.as_bool()),
            Some(true)
        );
    }

    #[test]
    fn cli_spawn_config_defaults() {
        let config = CliSpawnConfig {
            cli_type: "codex".to_string(),
            cli_bin: None,
            cli_args: None,
            cli_home: None,
        };
        assert_eq!(config.cli_type, "codex");
        assert!(config.cli_bin.is_none());
    }
}
