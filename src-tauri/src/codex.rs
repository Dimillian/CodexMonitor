use serde_json::{json, Map, Value};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, State};
use tokio::process::Command;
use tokio::time::timeout;

pub(crate) use crate::backend::app_server::WorkspaceSession;
use crate::backend::app_server::{
    build_codex_command_with_bin, build_codex_path_env, check_codex_installation,
    spawn_workspace_session as spawn_workspace_session_inner,
};
use crate::codex_home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::event_sink::TauriEventSink;
use crate::rules;
use crate::state::AppState;
use crate::types::WorkspaceEntry;

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    app_handle: AppHandle,
    codex_home: Option<PathBuf>,
) -> Result<Arc<WorkspaceSession>, String> {
    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    spawn_workspace_session_inner(
        entry,
        default_codex_bin,
        client_version,
        event_sink,
        codex_home,
    )
    .await
}

#[tauri::command]
pub(crate) async fn codex_doctor(
    codex_bin: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let resolved = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let path_env = build_codex_path_env(resolved.as_deref());
    let version = check_codex_installation(resolved.clone()).await?;
    let mut command = build_codex_command_with_bin(resolved.clone());
    command.arg("app-server");
    command.arg("--help");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let app_server_ok = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map(|output| output.status.success()).unwrap_or(false),
        Err(_) => false,
    };
    let (node_ok, node_version, node_details) = {
        let mut node_command = Command::new("node");
        if let Some(ref path_env) = path_env {
            node_command.env("PATH", path_env);
        }
        node_command.arg("--version");
        node_command.stdout(std::process::Stdio::piped());
        node_command.stderr(std::process::Stdio::piped());
        match timeout(Duration::from_secs(5), node_command.output()).await {
            Ok(result) => match result {
                Ok(output) => {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout)
                            .trim()
                            .to_string();
                        (
                            !version.is_empty(),
                            if version.is_empty() { None } else { Some(version) },
                            None,
                        )
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let detail = if stderr.trim().is_empty() {
                            stdout.trim()
                        } else {
                            stderr.trim()
                        };
                        (
                            false,
                            None,
                            Some(if detail.is_empty() {
                                "Node failed to start.".to_string()
                            } else {
                                detail.to_string()
                            }),
                        )
                    }
                }
                Err(err) => {
                    if err.kind() == ErrorKind::NotFound {
                        (false, None, Some("Node not found on PATH.".to_string()))
                    } else {
                        (false, None, Some(err.to_string()))
                    }
                }
            },
            Err(_) => (false, None, Some("Timed out while checking Node.".to_string())),
        }
    };
    let details = if app_server_ok {
        None
    } else {
        Some("Failed to run `codex app-server --help`.".to_string())
    };
    Ok(json!({
        "ok": version.is_some() && app_server_ok,
        "codexBin": resolved,
        "version": version,
        "appServerOk": app_server_ok,
        "details": details,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
    }))
}

#[tauri::command]
pub(crate) async fn start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "on-request"
    });
    session.send_request("thread/start", params).await
}

#[tauri::command]
pub(crate) async fn resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id
    });
    session.send_request("thread/resume", params).await
}

#[tauri::command]
pub(crate) async fn list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cursor": cursor,
        "limit": limit,
    });
    session.send_request("thread/list", params).await
}

#[tauri::command]
pub(crate) async fn archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id
    });
    session.send_request("thread/archive", params).await
}

#[tauri::command]
pub(crate) async fn send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    collaboration_mode: Option<Value>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let access_mode = access_mode.unwrap_or_else(|| "current".to_string());
    let sandbox_policy = match access_mode.as_str() {
        "full-access" => json!({
            "type": "dangerFullAccess"
        }),
        "read-only" => json!({
            "type": "readOnly"
        }),
        _ => json!({
            "type": "workspaceWrite",
            "writableRoots": [session.entry.path],
            "networkAccess": true
        }),
    };

    let approval_policy = if access_mode == "full-access" {
        "never"
    } else {
        "on-request"
    };

    let trimmed_text = text.trim();
    let mut input: Vec<Value> = Vec::new();
    if !trimmed_text.is_empty() {
        input.push(json!({ "type": "text", "text": trimmed_text }));
    }
    if let Some(paths) = images {
        for path in paths {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.starts_with("data:")
                || trimmed.starts_with("http://")
                || trimmed.starts_with("https://")
            {
                input.push(json!({ "type": "image", "url": trimmed }));
            } else {
                input.push(json!({ "type": "localImage", "path": trimmed }));
            }
        }
    }
    if input.is_empty() {
        return Err("empty user message".to_string());
    }

    let params = json!({
        "threadId": thread_id,
        "input": input,
        "cwd": session.entry.path,
        "approvalPolicy": approval_policy,
        "sandboxPolicy": sandbox_policy,
        "model": model,
        "effort": effort,
        "collaborationMode": collaboration_mode,
    });
    session.send_request("turn/start", params).await
}

#[tauri::command]
pub(crate) async fn collaboration_mode_list(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    session
        .send_request("collaborationMode/list", json!({}))
        .await
}

#[tauri::command]
pub(crate) async fn turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "threadId": thread_id,
        "turnId": turn_id,
    });
    session.send_request("turn/interrupt", params).await
}

#[tauri::command]
pub(crate) async fn start_review(
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let mut params = Map::new();
    params.insert("threadId".to_string(), json!(thread_id));
    params.insert("target".to_string(), target);
    if let Some(delivery) = delivery {
        params.insert("delivery".to_string(), json!(delivery));
    }
    session
        .send_request("review/start", Value::Object(params))
        .await
}

#[tauri::command]
pub(crate) async fn model_list(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({});
    session.send_request("model/list", params).await
}

#[tauri::command]
pub(crate) async fn account_rate_limits(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    session
        .send_request("account/rateLimits/read", Value::Null)
        .await
}

#[tauri::command]
pub(crate) async fn skills_list(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    let params = json!({
        "cwd": session.entry.path
    });
    session.send_request("skills/list", params).await
}

#[tauri::command]
pub(crate) async fn respond_to_server_request(
    workspace_id: String,
    request_id: u64,
    result: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(&workspace_id)
        .ok_or("workspace not connected")?;
    session.send_response(request_id, result).await
}

#[tauri::command]
pub(crate) async fn remember_approval_rule(
    workspace_id: String,
    command: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let command = command
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if command.is_empty() {
        return Err("empty command".to_string());
    }

    let (entry, parent_path) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .ok_or("workspace not found")?
            .clone();
        let parent_path = entry
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id))
            .map(|parent| parent.path.clone());
        (entry, parent_path)
    };

    let codex_home = resolve_workspace_codex_home(&entry, parent_path.as_deref())
        .or_else(resolve_default_codex_home)
        .ok_or("Unable to resolve CODEX_HOME".to_string())?;
    let rules_path = rules::default_rules_path(&codex_home);
    rules::append_prefix_rule(&rules_path, &command)?;

    Ok(json!({
        "ok": true,
        "rulesPath": rules_path,
    }))
}
