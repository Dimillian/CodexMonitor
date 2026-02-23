use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
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
use crate::codex::args::parse_codex_args;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::types::WorkspaceEntry;

#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn extract_thread_id(value: &Value) -> Option<String> {
    fn extract_from_container(container: Option<&Value>) -> Option<String> {
        let container = container?;
        container
            .get("threadId")
            .or_else(|| container.get("thread_id"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                container
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
            })
    }

    extract_from_container(value.get("params"))
        .or_else(|| extract_from_container(value.get("result")))
}

fn normalize_root_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let normalized = normalized.trim_end_matches('/');
    if normalized.is_empty() {
        return String::new();
    }

    let bytes = normalized.as_bytes();
    let is_drive_path = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'/';
    if is_drive_path || normalized.starts_with("//") {
        normalized.to_ascii_lowercase()
    } else {
        normalized.to_string()
    }
}

#[derive(Debug, Clone)]
struct ThreadListEntry {
    thread_id: String,
    cwd: Option<String>,
}

fn extract_thread_entries_from_thread_list_result(value: &Value) -> Vec<ThreadListEntry> {
    fn collect_entries(input: &Value, out: &mut Vec<ThreadListEntry>) {
        if let Some(values) = input.as_array() {
            for value in values {
                collect_entries(value, out);
            }
            return;
        }
        let Some(object) = input.as_object() else {
            return;
        };

        let cwd = object
            .get("cwd")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| {
                object
                    .get("thread")
                    .and_then(|thread| thread.get("cwd"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            });

        let thread_id = object
            .get("threadId")
            .or_else(|| object.get("thread_id"))
            .or_else(|| object.get("id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| {
                object
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            });
        if let Some(thread_id) = thread_id {
            out.push(ThreadListEntry { thread_id, cwd });
        }

        for key in ["threads", "items", "results", "data"] {
            if let Some(values) = object.get(key).and_then(|value| value.as_array()) {
                for value in values {
                    collect_entries(value, out);
                }
            }
        }
    }

    let mut out = Vec::new();
    if let Some(result) = value.get("result") {
        collect_entries(result, &mut out);
    }
    out
}

fn resolve_workspace_for_cwd(
    cwd: &str,
    workspace_roots: &HashMap<String, String>,
) -> Option<String> {
    let normalized_cwd = normalize_root_path(cwd);
    if normalized_cwd.is_empty() {
        return None;
    }
    workspace_roots.iter().find_map(|(workspace_id, root)| {
        if root == &normalized_cwd {
            Some(workspace_id.clone())
        } else {
            None
        }
    })
}

fn is_global_workspace_notification(method: &str) -> bool {
    matches!(
        method,
        "account/updated" | "account/rateLimits/updated" | "account/login/completed"
    )
}

fn should_broadcast_global_workspace_notification(
    method_name: Option<&str>,
    thread_id: Option<&String>,
    request_workspace: Option<&str>,
) -> bool {
    method_name.is_some_and(is_global_workspace_notification)
        && thread_id.is_none()
        && request_workspace.is_none()
}

#[derive(Clone)]
pub(crate) struct RequestContext {
    workspace_id: String,
    method: String,
}

fn build_initialize_params(client_version: &str) -> Value {
    json!({
        "clientInfo": {
            "name": "codex_monitor",
            "title": "Codex Monitor",
            "version": client_version
        },
        "capabilities": {
            "experimentalApi": true
        }
    })
}

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

pub(crate) struct WorkspaceSession {
    pub(crate) codex_args: Option<String>,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) request_context: Mutex<HashMap<u64, RequestContext>>,
    pub(crate) thread_workspace: Mutex<HashMap<String, String>>,
    pub(crate) next_id: AtomicU64,
    /// Callbacks for background threads - events for these threadIds are sent through the channel
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
    pub(crate) owner_workspace_id: String,
    pub(crate) workspace_ids: Mutex<HashSet<String>>,
    pub(crate) workspace_roots: Mutex<HashMap<String, String>>,
}

impl WorkspaceSession {
    pub(crate) async fn register_workspace(&self, workspace_id: &str) {
        self.register_workspace_with_path(workspace_id, None).await;
    }

    pub(crate) async fn register_workspace_with_path(
        &self,
        workspace_id: &str,
        workspace_path: Option<&str>,
    ) {
        self.workspace_ids
            .lock()
            .await
            .insert(workspace_id.to_string());
        if let Some(path) = workspace_path {
            let normalized = normalize_root_path(path);
            if !normalized.is_empty() {
                self.workspace_roots
                    .lock()
                    .await
                    .insert(workspace_id.to_string(), normalized);
            }
        }
    }

    pub(crate) async fn unregister_workspace(&self, workspace_id: &str) {
        self.workspace_ids.lock().await.remove(workspace_id);
        self.workspace_roots.lock().await.remove(workspace_id);
    }

    pub(crate) async fn workspace_ids_snapshot(&self) -> Vec<String> {
        self.workspace_ids.lock().await.iter().cloned().collect()
    }

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
        self.send_request_for_workspace(self.owner_workspace_id.as_str(), method, params)
            .await
    }

    pub(crate) async fn send_request_for_workspace(
        &self,
        workspace_id: &str,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.register_workspace(workspace_id).await;
        self.pending.lock().await.insert(id, tx);
        self.request_context.lock().await.insert(
            id,
            RequestContext {
                workspace_id: workspace_id.to_string(),
                method: method.to_string(),
            },
        );
        if let Some(thread_id) = extract_thread_id(&json!({ "params": params.clone() })) {
            self.thread_workspace
                .lock()
                .await
                .insert(thread_id, workspace_id.to_string());
        }
        if let Err(error) = self
            .write_message(json!({ "id": id, "method": method, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            self.request_context.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err("request canceled".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                self.request_context.lock().await.remove(&id);
                Err(format!(
                    "request timed out after {} seconds",
                    REQUEST_TIMEOUT.as_secs()
                ))
            }
        }
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
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let mut extras: Vec<PathBuf> = Vec::new();

    #[cfg(not(target_os = "windows"))]
    {
        extras.extend(
            [
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/bin",
                "/bin",
                "/usr/sbin",
                "/sbin",
            ]
            .into_iter()
            .map(PathBuf::from),
        );

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
            command.raw_arg(command_line);
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

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_codex_command_with_bin(codex_bin, None, vec!["--version".to_string()])?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Codex CLI not found. Install Codex and ensure `codex` is on your PATH.".to_string()
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
                "Codex CLI failed to start. Try running `codex --version` in Terminal.".to_string(),
            );
        }
        return Err(format!(
            "Codex CLI failed to start: {detail}. Try running `codex --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() {
        None
    } else {
        Some(version)
    })
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let codex_bin = default_codex_bin;
    let _ = check_codex_installation(codex_bin.clone()).await?;

    let mut command = build_codex_command_with_bin(
        codex_bin,
        codex_args.as_deref(),
        vec!["app-server".to_string()],
    )?;
    command.current_dir(&entry.path);
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
        codex_args,
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        request_context: Mutex::new(HashMap::new()),
        thread_workspace: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        owner_workspace_id: entry.id.clone(),
        workspace_ids: Mutex::new(HashSet::from([entry.id.clone()])),
        workspace_roots: Mutex::new(HashMap::from([(
            entry.id.clone(),
            normalize_root_path(&entry.path),
        )])),
    });

    let session_clone = Arc::clone(&session);
    let fallback_workspace_id = entry.id.clone();
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
                        workspace_id: fallback_workspace_id.clone(),
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
            let method_name = value.get("method").and_then(|method| method.as_str());

            // Check if this event is for a background thread
            let thread_id = extract_thread_id(&value);
            let mut request_workspace: Option<String> = None;
            let mut request_method: Option<String> = None;
            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(context) = session_clone.request_context.lock().await.remove(&id) {
                        request_workspace = Some(context.workspace_id);
                        request_method = Some(context.method);
                    }
                }
            }

            if let Some(ref workspace_id) = request_workspace {
                if let Some(ref tid) = thread_id {
                    session_clone
                        .thread_workspace
                        .lock()
                        .await
                        .insert(tid.clone(), workspace_id.clone());
                }
            }
            if matches!(request_method.as_deref(), Some("thread/list")) {
                let thread_entries = extract_thread_entries_from_thread_list_result(&value);
                if !thread_entries.is_empty() {
                    let workspace_roots = session_clone.workspace_roots.lock().await.clone();
                    let mut thread_workspace = session_clone.thread_workspace.lock().await;
                    for entry in thread_entries {
                        let mapped_workspace = entry
                            .cwd
                            .as_deref()
                            .and_then(|cwd| resolve_workspace_for_cwd(cwd, &workspace_roots));
                        if let Some(workspace_id) = mapped_workspace {
                            thread_workspace.insert(entry.thread_id, workspace_id);
                        }
                    }
                }
            }

            let routed_workspace_id = if let Some(ref tid) = thread_id {
                session_clone
                    .thread_workspace
                    .lock()
                    .await
                    .get(tid)
                    .cloned()
                    .or_else(|| request_workspace.clone())
                    .unwrap_or_else(|| fallback_workspace_id.clone())
            } else {
                request_workspace
                    .clone()
                    .unwrap_or_else(|| fallback_workspace_id.clone())
            };

            if method_name == Some("thread/archived") {
                if let Some(ref tid) = thread_id {
                    session_clone.thread_workspace.lock().await.remove(tid);
                }
            }

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
                        if should_broadcast_global_workspace_notification(
                            method_name,
                            thread_id.as_ref(),
                            request_workspace.as_deref(),
                        ) {
                            let workspace_ids = session_clone.workspace_ids_snapshot().await;
                            if workspace_ids.is_empty() {
                                let payload = AppServerEvent {
                                    workspace_id: routed_workspace_id.clone(),
                                    message: value,
                                };
                                event_sink_clone.emit_app_server_event(payload);
                            } else {
                                for workspace_id in workspace_ids {
                                    let payload = AppServerEvent {
                                        workspace_id,
                                        message: value.clone(),
                                    };
                                    event_sink_clone.emit_app_server_event(payload);
                                }
                            }
                        } else {
                            let payload = AppServerEvent {
                                workspace_id: routed_workspace_id.clone(),
                                message: value,
                            };
                            event_sink_clone.emit_app_server_event(payload);
                        }
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
                    if should_broadcast_global_workspace_notification(
                        method_name,
                        thread_id.as_ref(),
                        request_workspace.as_deref(),
                    ) {
                        let workspace_ids = session_clone.workspace_ids_snapshot().await;
                        if workspace_ids.is_empty() {
                            let payload = AppServerEvent {
                                workspace_id: routed_workspace_id,
                                message: value,
                            };
                            event_sink_clone.emit_app_server_event(payload);
                        } else {
                            for workspace_id in workspace_ids {
                                let payload = AppServerEvent {
                                    workspace_id,
                                    message: value.clone(),
                                };
                                event_sink_clone.emit_app_server_event(payload);
                            }
                        }
                    } else {
                        let payload = AppServerEvent {
                            workspace_id: routed_workspace_id,
                            message: value,
                        };
                        event_sink_clone.emit_app_server_event(payload);
                    }
                }
            }
        }

        // Ensure pending foreground requests cannot accumulate after process output ends.
        session_clone.pending.lock().await.clear();
        session_clone.request_context.lock().await.clear();
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
            let mut child = session.child.lock().await;
            kill_child_process_tree(&mut child).await;
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
    use super::{
        build_initialize_params, extract_thread_entries_from_thread_list_result, extract_thread_id,
        normalize_root_path, resolve_workspace_for_cwd,
    };
    use std::collections::HashMap;
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
    fn extract_thread_entries_reads_result_data_items() {
        let value = json!({
            "result": {
                "data": [
                    { "id": "thread-a", "cwd": "/tmp/a" },
                    { "threadId": "thread-b", "cwd": "/tmp/b" }
                ]
            }
        });
        let entries = extract_thread_entries_from_thread_list_result(&value);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].thread_id, "thread-a");
        assert_eq!(entries[0].cwd.as_deref(), Some("/tmp/a"));
        assert_eq!(entries[1].thread_id, "thread-b");
        assert_eq!(entries[1].cwd.as_deref(), Some("/tmp/b"));
    }

    #[test]
    fn resolve_workspace_for_cwd_normalizes_windows_paths() {
        let mut roots = HashMap::new();
        roots.insert("ws-1".to_string(), normalize_root_path("C:\\Dev\\Codex"));
        assert_eq!(
            resolve_workspace_for_cwd("c:/dev/codex", &roots),
            Some("ws-1".to_string())
        );
    }
}
