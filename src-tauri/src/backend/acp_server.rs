use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;
use uuid::Uuid;

use crate::backend::app_server::build_codex_path_env;
use crate::backend::events::{AppServerEvent, EventSink};
use crate::shared::process_core::tokio_command;
use crate::types::WorkspaceEntry;

struct PromptState {
    turn_id: String,
    item_id: String,
    text: String,
}

pub(crate) struct AcpSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) next_id: AtomicU64,
    prompt_states: Mutex<HashMap<String, PromptState>>,
}

impl AcpSession {
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
        self.write_message(json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))
        .await?;
        rx.await.map_err(|_| "request canceled".to_string())
    }

    pub(crate) async fn begin_prompt<E: EventSink>(
        &self,
        session_id: &str,
        event_sink: &E,
    ) -> Result<String, String> {
        let mut prompt_states = self.prompt_states.lock().await;
        if prompt_states.contains_key(session_id) {
            return Err("prompt already in progress".to_string());
        }
        let turn_id = format!("turn-{}", Uuid::new_v4());
        let item_id = format!("item-{}", Uuid::new_v4());
        prompt_states.insert(
            session_id.to_string(),
            PromptState {
                turn_id: turn_id.clone(),
                item_id: item_id.clone(),
                text: String::new(),
            },
        );
        drop(prompt_states);

        let payload = AppServerEvent {
            workspace_id: self.entry.id.clone(),
            message: json!({
                "method": "turn/started",
                "params": {
                    "threadId": session_id,
                    "turn": { "id": turn_id, "threadId": session_id },
                }
            }),
        };
        event_sink.emit_app_server_event(payload);
        Ok(turn_id)
    }

    pub(crate) async fn append_prompt_delta(&self, session_id: &str, delta: &str) -> Option<String> {
        let mut prompt_states = self.prompt_states.lock().await;
        let state = prompt_states.get_mut(session_id)?;
        state.text.push_str(delta);
        Some(state.item_id.clone())
    }

    pub(crate) async fn finish_prompt<E: EventSink>(
        &self,
        session_id: &str,
        event_sink: &E,
    ) {
        let state = {
            let mut prompt_states = self.prompt_states.lock().await;
            prompt_states.remove(session_id)
        };
        let Some(state) = state else {
            return;
        };

        let item_payload = AppServerEvent {
            workspace_id: self.entry.id.clone(),
            message: json!({
                "method": "item/completed",
                "params": {
                    "threadId": session_id,
                    "item": {
                        "id": state.item_id,
                        "type": "agentMessage",
                        "text": state.text,
                    }
                }
            }),
        };
        event_sink.emit_app_server_event(item_payload);

        let turn_payload = AppServerEvent {
            workspace_id: self.entry.id.clone(),
            message: json!({
                "method": "turn/completed",
                "params": {
                    "threadId": session_id,
                    "turn": { "id": state.turn_id, "threadId": session_id },
                }
            }),
        };
        event_sink.emit_app_server_event(turn_payload);
    }

    pub(crate) async fn clear_prompt(&self, session_id: &str) {
        let mut prompt_states = self.prompt_states.lock().await;
        prompt_states.remove(session_id);
    }
}

fn build_initialize_params(client_version: &str) -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": { "readTextFile": true, "writeTextFile": true },
            "terminal": true,
        },
        "clientInfo": {
            "name": "codex_monitor",
            "title": "Codex Monitor",
            "version": client_version,
        },
    })
}

fn build_copilot_command_with_bin(copilot_bin: Option<String>) -> Command {
    let bin = copilot_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "copilot".into());
    let mut command = tokio_command(bin);
    if let Some(path_env) = build_codex_path_env(copilot_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

fn parse_copilot_args(value: Option<&str>) -> Result<Vec<String>, String> {
    let raw = match value {
        Some(raw) if !raw.trim().is_empty() => raw.trim(),
        _ => return Ok(Vec::new()),
    };
    shell_words::split(raw)
        .map_err(|err| format!("Invalid Copilot args: {err}"))
        .map(|args| args.into_iter().filter(|arg| !arg.is_empty()).collect())
}

fn apply_copilot_args(command: &mut Command, value: Option<&str>) -> Result<(), String> {
    let args = parse_copilot_args(value)?;
    if !args.is_empty() {
        command.args(args);
    }
    Ok(())
}

async fn check_copilot_installation(copilot_bin: Option<String>) -> Result<Option<String>, String> {
    let mut command = build_copilot_command_with_bin(copilot_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Copilot CLI not found. Install Copilot CLI and ensure `copilot` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Copilot CLI. Make sure `copilot --version` runs in Terminal."
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
                "Copilot CLI failed to start. Try running `copilot --version` in Terminal."
                    .to_string(),
            );
        }
        return Err(format!(
            "Copilot CLI failed to start: {detail}. Try running `copilot --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() { None } else { Some(version) })
}

fn parse_response_id(value: &Value) -> Option<u64> {
    value
        .get("id")
        .and_then(|id| {
            if let Some(id) = id.as_u64() {
                return Some(id);
            }
            id.as_str().and_then(|value| value.parse::<u64>().ok())
        })
}

fn parse_session_update(value: &Value) -> Option<(String, String)> {
    let params = value.get("params")?;
    let session_id = params.get("sessionId")?.as_str()?.to_string();
    let update = params.get("update")?;
    let update_type = update.get("sessionUpdate")?.as_str()?;
    if update_type != "agent_message_chunk" {
        return None;
    }
    let content = update.get("content")?;
    let content_type = content.get("type").and_then(|value| value.as_str());
    if content_type != Some("text") {
        return None;
    }
    let text = content.get("text")?.as_str()?.to_string();
    if text.is_empty() {
        return None;
    }
    Some((session_id, text))
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    copilot_bin: Option<String>,
    copilot_args: Option<String>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<AcpSession>, String> {
    let _ = check_copilot_installation(copilot_bin.clone()).await?;

    let mut command = build_copilot_command_with_bin(copilot_bin);
    command.current_dir(&entry.path);
    command.arg("--acp");
    command.arg("--stdio");
    apply_copilot_args(&mut command, copilot_args.as_deref())?;
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(AcpSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        prompt_states: Mutex::new(HashMap::new()),
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

            let maybe_id = parse_response_id(&value);
            let has_method = value.get("method").is_some();
            let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();

            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                    continue;
                }
            }

            if has_method {
                if value.get("method").and_then(Value::as_str) == Some("session/update") {
                    if let Some((session_id, delta)) = parse_session_update(&value) {
                        if let Some(item_id) =
                            session_clone.append_prompt_delta(&session_id, &delta).await
                        {
                            let payload = AppServerEvent {
                                workspace_id: workspace_id.clone(),
                                message: json!({
                                    "method": "item/agentMessage/delta",
                                    "params": {
                                        "threadId": session_id,
                                        "itemId": item_id,
                                        "delta": delta,
                                    }
                                }),
                            };
                            event_sink_clone.emit_app_server_event(payload);
                        }
                    }
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
    let init_result = timeout(Duration::from_secs(15), session.send_request("initialize", init_params)).await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
            return Err(
                "Copilot ACP did not respond to initialize. Check that `copilot --acp --stdio` works in Terminal."
                    .to_string(),
            );
        }
    };
    let init_response = init_response?;
    if init_response.get("error").is_some() {
        return Err(format!("Copilot ACP initialize failed: {init_response}"));
    }

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() },
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}
